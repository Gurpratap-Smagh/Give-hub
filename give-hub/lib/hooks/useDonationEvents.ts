// lib/hooks/useDonationEvents.ts
import { useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import { getTokenByAddress as getTokenMeta } from "@/lib/tokens/catalog";

/** Matches the contract:
 * event ContributionReceived(
 *   uint256 indexed campaignId,
 *   address indexed donor,
 *   uint256 indexed contributionId,
 *   address originalToken,
 *   uint256 originalAmount,
 *   uint256 convertedAmount,
 *   string originChain,
 *   string donorName,
 *   string note
 * );
 */
const CROWDFUND_ABI = [
  "event ContributionReceived(uint256 indexed campaignId, address indexed donor, uint256 indexed contributionId, address originalToken, uint256 originalAmount, uint256 convertedAmount, string originChain, string donorName, string note)",
];
// Prefer unified envs; fall back to legacy names
const rpcUrl =
  process.env.NEXT_PUBLIC_ZETA_RPC_URL ||
  process.env.NEXT_PUBLIC_ZETA_RPC_HTTP ||
  '';
const contractAddress =
  process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT ||
  process.env.NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS ||
  process.env.NEXT_PUBLIC_DONATION_CONTRACT ||
  '';
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_ZETA_CHAIN_ID || 7001);
const DISABLE_EVENTS = String(process.env.NEXT_PUBLIC_DISABLE_DONATION_EVENTS || '').toLowerCase() === 'true';

// ---------- helpers ----------
function toTopic1IfNumeric(id: string | number | undefined | null) {
  if (id === undefined || id === null) return null;
  const s = String(id).trim();
  if (!/^\d+$/.test(s)) return null; // not numeric -> don't build topic1
  return ethers.zeroPadValue(ethers.toBeHex(BigInt(s)), 32);
}

// per-token decimals (adjust later if you add non-18-dec tokens)
const DEFAULT_DECIMALS = 18;
const ZERO = "0x0000000000000000000000000000000000000000";
const getDecimals = (addrLower: string) => {
  try {
    const meta = getTokenMeta(addrLower);
    if (meta && Number.isFinite(Number(meta.decimals))) {
      return Number(meta.decimals);
    }
    if (addrLower === ZERO) return DEFAULT_DECIMALS;
  } catch {
    // fall through to default
  }
  return DEFAULT_DECIMALS;
};

// polling interval for live updates (ms)
const POLL_INTERVAL_MS = 5000;

// ---------- types ----------
export type DonationEvent = {
  id: string; // txHash-logIndex (stable key)
  blockNumber: number;
  txHash: string;
  logIndex: number;

  campaignId: string;
  donor: string;
  contributionId: string;
  originalToken: string;   // address lowercase
  originalAmount: string;  // formatted, default 18 decimals
  convertedAmount: string; // formatted, default 18 decimals
  originChain: string;
  donorName: string;
  note: string;
};

// ---------- hook ----------
export function useDonationEvents(
  targetCampaignId?: string | number,
  lookbackBlocks = 20_000,
  step = 400,
  options?: { enabled?: boolean }
) {
  const [events, setEvents] = useState<DonationEvent[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState(true);
  const seen = useRef<Set<string>>(new Set());
  const loadingBackfill = useRef(false);
  const lastBlockRef = useRef<number | null>(null);

  const iface = useMemo(() => new ethers.Interface(CROWDFUND_ABI), []);
  const topic0 = useMemo(
    () => ethers.id("ContributionReceived(uint256,address,uint256,address,uint256,uint256,string,string,string)"),
    []
  );
  const topic1 = useMemo(() => toTopic1IfNumeric(targetCampaignId), [targetCampaignId]);

  const enabled = useMemo(() => options?.enabled !== false && !DISABLE_EVENTS, [options?.enabled]);

  // Only apply in-memory filtering by campaignId when the prop is numeric
  const expectedCidStr = useMemo(() => {
    const s = targetCampaignId == null ? undefined : String(targetCampaignId).trim();
    return s && /^\d+$/.test(s) ? s : undefined;
  }, [targetCampaignId]);

  const http = useMemo(
    () => new ethers.JsonRpcProvider(rpcUrl, { name: "zetachain-athens", chainId: CHAIN_ID }),
    []
  );

  const decodeLog = (log: ethers.Log): DonationEvent => {
    const parsed = (() => {
      try {
        return iface.parseLog(log);
      } catch {
        return null;
      }
    })();
    if (!parsed) {
      throw new Error("Unexpected log format for ContributionReceived");
    }
    // ContributionReceived(
    //   uint256 campaignId, address donor, uint256 contributionId,
    //   address originalToken, uint256 originalAmount, uint256 convertedAmount,
    //   string originChain, string donorName, string note
    // )
    const args = parsed.args as readonly unknown[];
    const campaignId = args[0] as bigint;
    const donor = args[1] as string;
    const contributionId = args[2] as bigint;
    const originalToken = args[3] as string;
    const originalAmount = args[4] as bigint;
    const convertedAmount = args[5] as bigint;
    const originChain = args[6] as string;
    const donorName = args[7] as string;
    const note = args[8] as string;

    const origAddr = String(originalToken).toLowerCase();
    const dec = getDecimals(origAddr);
    const id = `${log.transactionHash}-${log.index}`;

    return {
      id,
      blockNumber: log.blockNumber!,
      txHash: log.transactionHash!,
      logIndex: log.index!,
      campaignId: campaignId.toString(),
      donor,
      contributionId: contributionId.toString(),
      originalToken: origAddr,
      originalAmount: ethers.formatUnits(originalAmount, dec),
      convertedAmount: ethers.formatUnits(convertedAmount, dec),
      originChain,
      donorName,
      note,
    };
  };

  // ------- backfill recent logs in safe chunks -------
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!enabled) return;
      // Pause during in-flight donation to avoid getLogs interference
      try {
        if (typeof window !== 'undefined' && sessionStorage.getItem('DONATION_INFLIGHT') === '1') return;
      } catch {}
      if (loadingBackfill.current) return;
      loadingBackfill.current = true;
      setIsLoading(true);
      setError(null);
      try {
        if (!rpcUrl || !contractAddress) {
          throw new Error('Missing RPC URL or contract address. Check NEXT_PUBLIC_ZETA_RPC_URL and NEXT_PUBLIC_CROSSCHAIN_CONTRACT');
        }
        // Use read-only provider to avoid any wallet connection prompts
        const latest = await http.getBlockNumber();
        const start = Math.max(0, latest - lookbackBlocks);
        // hard-cap the range to stay well below common provider limits (<=400)
        const maxRange = Math.min(step ?? 400, 400);

        for (let from = start; from <= latest; from += (maxRange + 1)) {
          // Re-check in-flight flag between chunks
          try {
            if (typeof window !== 'undefined' && sessionStorage.getItem('DONATION_INFLIGHT') === '1') break;
          } catch {}
          const to = Math.min(latest, from + maxRange);
          let logs: ethers.Log[] = [];
          try {
            const topicsArr = topic1 ? [topic0, topic1] : [topic0];
            logs = await http.getLogs({
              address: contractAddress,
              fromBlock: from,
              toBlock: to,
              topics: topicsArr,
            });
          } catch {
            // tiny retry helps with transient 400s
            await new Promise(r => setTimeout(r, 250));
            const topicsArr = topic1 ? [topic0, topic1] : [topic0];
            logs = await http.getLogs({
              address: contractAddress,
              fromBlock: from,
              toBlock: to,
              topics: topicsArr,
            });
          }
          if (!alive) return;

          if (logs.length) {
            const decoded = logs.map(decodeLog).filter(d => {
              if (expectedCidStr && d.campaignId !== expectedCidStr) return false;
              if (seen.current.has(d.id)) return false;
              seen.current.add(d.id);
              return true;
            });
            if (decoded.length) {
              setEvents(prev => {
                const next = [...prev, ...decoded];
                next.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
                return next;
              });
            }
          }
        }
        // initialize live polling cursor
        lastBlockRef.current = latest;
      } catch (err) {
        if (alive) setError(err);
      } finally {
        if (alive) setIsLoading(false);
        loadingBackfill.current = false;
      }
    })();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic0, topic1, expectedCidStr, enabled]);

  // ------- live polling fallback (works on providers without eth_subscribe) -------
  useEffect(() => {
    let mounted = true;
    let currentPollTimer: NodeJS.Timeout | null = null;

    async function poll() {
      try {
        if (!mounted || !enabled || !rpcUrl || !contractAddress) return;
        // Skip polling while a donation tx is in-flight
        try {
          if (typeof window !== 'undefined' && sessionStorage.getItem('DONATION_INFLIGHT') === '1') {
            return;
          }
        } catch {}
        const latest = await http.getBlockNumber();
        const maxRange = Math.min(step ?? 400, 400);
        let from = (lastBlockRef.current ?? Math.max(0, latest - maxRange)) + 1;
        if (from > latest) return;

        while (from <= latest && mounted) {
          // Re-check before each chunk
          try {
            if (typeof window !== 'undefined' && sessionStorage.getItem('DONATION_INFLIGHT') === '1') return;
          } catch {}
          const to = Math.min(latest, from + maxRange);
          let logs: ethers.Log[] = [];
          try {
            const topicsArr = topic1 ? [topic0, topic1] : [topic0];
            logs = await http.getLogs({
              address: contractAddress,
              fromBlock: from,
              toBlock: to,
              topics: topicsArr,
            });
          } catch (err) {
            console.warn('[useDonationEvents] Failed to fetch logs, retrying...', err);
            await new Promise(r => setTimeout(r, 500));
            if (!mounted) return;
            try {
              const topicsArr = topic1 ? [topic0, topic1] : [topic0];
              logs = await http.getLogs({
                address: contractAddress,
                fromBlock: from,
                toBlock: to,
                topics: topicsArr,
              });
            } catch (retryErr) {
              console.error('[useDonationEvents] Retry failed, skipping this range', retryErr);
              from = to + 1;
              continue;
            }
          }

          if (!mounted) return;

          if (logs.length) {
            const decoded = logs.map(decodeLog).filter(d => {
              if (expectedCidStr && d.campaignId !== expectedCidStr) return false;
              if (seen.current.has(d.id)) return false;
              seen.current.add(d.id);
              return true;
            });
            if (decoded.length) {
              setEvents(prev => {
                const next = [...prev, ...decoded];
                next.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex); // Most recent first
                return next;
              });
            }
          }

          lastBlockRef.current = to;
          from = to + 1;
        }
      } catch (err) {
        console.error('[useDonationEvents] Polling error:', err);
        // Don't set error state for polling failures, just log and continue
      }

      // Schedule next poll
      if (mounted && enabled) {
        currentPollTimer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    if (enabled && lastBlockRef.current !== null) {
      // Only start polling after initial backfill is complete
      currentPollTimer = setTimeout(poll, 1000); // Start first poll after 1s
    }

    return () => {
      mounted = false;
      if (currentPollTimer) clearTimeout(currentPollTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic0, topic1, expectedCidStr, enabled, lastBlockRef.current]);

  return { events, error, isLoading };
}
