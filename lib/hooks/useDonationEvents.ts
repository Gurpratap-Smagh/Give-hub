// lib/hooks/useDonationEvents.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import { useAvailableTokens } from "@/lib/hooks/useAvailableTokens";

const DONATION_ABI = [
  "event ContributionReceived(uint256 indexed campaignId, address indexed donor, uint256 indexed contributionId, address originalToken, uint256 originalAmount, uint256 convertedAmount, string originChain, string donorName, string note)"
];

type UseDonationEventsOptions = {
  campaignId?: number | string;
  limit?: number;
  autoConnect?: boolean;
  pollInterval?: number; // ms
};

type LiveDonation = {
  id: string;
  name?: string | null;
  note?: string | null;
  amount: string;
  campaignId: number;
  token: string;
  symbol: string;
  decimals: number;
  amountFormatted: string;
  usdValue: null;
  usdFormatted: null;
  timestamp: number;
  transactionHash: string;
  blockNumber: number;
  icon?: string;
};

export const useDonationEvents = (options: UseDonationEventsOptions = {}) => {
  const { campaignId, limit = 50, autoConnect = true, pollInterval = 8000 } = options;

  const [donations, setDonations] = useState<LiveDonation[]>([]);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalReceived, setTotalReceived] = useState(0);

  const { getTokenByAddress, getNativeToken } = useAvailableTokens();

  const rpcUrl = process.env.NEXT_PUBLIC_ZETA_RPC_HTTP!;
  const contractAddress = process.env.NEXT_PUBLIC_DONATION_CONTRACT!;

  const providerRef = useRef<ethers.JsonRpcProvider | null>(null);
  const contractRef = useRef<ethers.Contract | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastBlockRef = useRef<number | null>(null);
  const warmupWindow = 300; // backfill ~300 blocks on first load
  const MAX_RANGE = 450; // stay under 500 blocks per request to avoid RPC errors

  const expectedCidStr = useMemo(() => {
    if (campaignId === undefined || campaignId === null) return undefined;
    const s = String(campaignId).trim();
    return /^\d+$/.test(s) ? s : undefined;
  }, [campaignId]);

  const formatAmount = (raw: bigint, decimals: number) => {
    const asStr = ethers.formatUnits(raw, decimals);
    const num = Number(asStr);
    return { asStr, asNum: isFinite(num) ? num : 0 };
  };

  const processEvent = useCallback((parsed: ethers.LogDescription, log: ethers.Log): LiveDonation => {
    const {
      campaignId: evCampaignId,
      donorName,
      note,
      originalToken,
      convertedAmount,
      originChain
    } = parsed.args as any;

    const tokenAddr = String(originalToken).toLowerCase();
    const tokenInfo = tokenAddr === ethers.ZeroAddress.toLowerCase()
      ? getNativeToken()
      : getTokenByAddress(tokenAddr);

    // Prefer chain-specific label for zero-address when originChain indicates Sepolia
    const isSepoliaNative = tokenAddr === ethers.ZeroAddress.toLowerCase() && /sepolia/i.test(String(originChain || ""));
    const symbol = isSepoliaNative ? "zETH.SEPOLIA" : (tokenInfo?.symbol || "TOKEN");
    const decimals = tokenInfo?.decimals ?? 18;
    const icon = tokenInfo?.icon;

    const { asStr: convStr, asNum: convNum } = formatAmount(convertedAmount, decimals);
    const amountFormatted = `${Number(convStr).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    })} ${symbol}`;

    return {
      id: `${log.transactionHash}-${log.index}`,
      name: donorName ?? null,
      note: note ?? null,
      amount: convStr,
      campaignId: Number(evCampaignId),
      token: tokenAddr,
      symbol,
      decimals,
      amountFormatted,
      usdValue: null,
      usdFormatted: null,
      timestamp: Date.now(),
      transactionHash: log.transactionHash!,
      blockNumber: log.blockNumber!,
      icon,
    };
  }, [getNativeToken, getTokenByAddress]);

  const poll = useCallback(async () => {
    try {
      const provider = providerRef.current;
      if (!provider) return;

      const iface = new ethers.Interface(DONATION_ABI);
      const topic0 = iface.getEvent("ContributionReceived").topicHash;
      
      // Build topic1 only if campaignId is numeric
      const topic1 = expectedCidStr
        ? ethers.zeroPadValue(ethers.toBeHex(BigInt(expectedCidStr)), 32)
        : null;
      
      const latest = await provider.getBlockNumber();
      let from = (lastBlockRef.current ?? Math.max(0, latest - warmupWindow)) + 1;
      if (from > latest) return;

      // Process logs in chunks, respecting RPC range limits
      while (from <= latest) {
        const chunkSize = Math.min(MAX_RANGE, latest - from + 1);
        const to = from + chunkSize - 1;
        let logs: ethers.Log[] = [];

        try {
          logs = await provider.getLogs({
            address: contractAddress,
            fromBlock: from,
            toBlock: to,
            topics: topic1 ? [topic0, topic1] : [topic0],
          });
        } catch (e: any) {
          const msg = String(e?.message || "");
          
          // Handle rate limiting / range errors
          if (msg.includes("-32600") || msg.includes("400") || msg.includes("range too large")) {
            await new Promise(r => setTimeout(r, 500));
            // Reduce chunk size and retry once
            const smallerTo = Math.min(to, from + 200);
            try {
              logs = await provider.getLogs({
                address: contractAddress,
                fromBlock: from,
                toBlock: smallerTo,
                topics: topic1 ? [topic0, topic1] : [topic0],
              });
              lastBlockRef.current = smallerTo;
              from = smallerTo + 1;
              continue;
            } catch (retryErr) {
              console.error("Retry failed, skipping chunk:", retryErr);
              from = to + 1;
              continue;
            }
          }
          
          // If RPC suggests a safe range, adopt it
          const rangeMatch = msg.match(/\[(0x[0-9a-fA-F]+),\s*(0x[0-9a-fA-F]+)\]/);
          if (rangeMatch) {
            const sugFrom = Number(rangeMatch[1]);
            const sugTo = Number(rangeMatch[2]);
            logs = await provider.getLogs({
              address: contractAddress,
              fromBlock: sugFrom,
              toBlock: sugTo,
              topics: topic1 ? [topic0, topic1] : [topic0],
            });
            lastBlockRef.current = sugTo;
            from = sugTo + 1;
            continue;
          }
          
          // Skip this chunk on other errors
          console.error("Skipping log chunk:", msg);
          from = to + 1;
          continue;
        }

        if (logs.length) {
          const decoded = logs
            .map((log) => {
              try {
                const parsed = iface.parseLog(log);
                return parsed ? { parsed, log } : null;
              } catch {
                return null;
              }
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
            .map(({ parsed, log }) => processEvent(parsed, log))
            .filter(d => {
              // Only enforce campaign filter if not using topic1
              if (!topic1 && expectedCidStr && String(d.campaignId) !== expectedCidStr) return false;
              if (seen.current.has(d.id)) return false;
              seen.current.add(d.id);
              return true;
            })
            .sort((a, b) => {
              // Sort by block number, then log index
              const blockDiff = b.blockNumber - a.blockNumber;
              if (blockDiff !== 0) return blockDiff;
              return b.transactionHash.localeCompare(a.transactionHash);
            });

          if (decoded.length) {
            setDonations(prev => {
              const next = [...decoded, ...prev];
              return next.slice(0, limit);
            });
            setTotalReceived(prev => prev + decoded.reduce((a, d) => a + Number(d.amount), 0));
          }
        }

        lastBlockRef.current = to;
        from = to + 1;
      }
    } catch (err: any) {
      const msg = String(err?.message || "");
      if (!msg.includes("eth_subscribe") && !msg.includes("provider destroyed")) {
        console.error("Donation events polling error:", err);
        setError("⚠ Could not load recent donations.");
      }
    }
  }, [contractAddress, expectedCidStr, limit, processEvent]);

  const connect = useCallback(async () => {
    if (providerRef.current) return;
    setConnecting(true);
    try {
      providerRef.current = new ethers.JsonRpcProvider(rpcUrl, {
        name: "zetachain-athens",
        chainId: Number(process.env.NEXT_PUBLIC_ZETA_CHAIN_ID || 7001),
      });
      contractRef.current = new ethers.Contract(contractAddress, DONATION_ABI, providerRef.current);
      
      // Set initial lastBlockRef to latest - warmupWindow
      const latest = await providerRef.current.getBlockNumber();
      lastBlockRef.current = Math.max(0, latest - warmupWindow);
      
      setConnected(true);
      setConnecting(false);

      timerRef.current = setInterval(poll, pollInterval);
      await poll(); // run immediately
    } catch (err: any) {
      setError(err.message || "Failed to connect");
      setConnected(false);
      setConnecting(false);
    }
  }, [rpcUrl, contractAddress, poll, pollInterval]);

  const disconnect = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    providerRef.current = null;
    contractRef.current = null;
    setConnected(false);
    setConnecting(false);
  }, []);

  useEffect(() => {
    if (autoConnect) connect();
    return () => disconnect();
  }, [autoConnect, connect, disconnect]);

  return {
    donations,
    connected,
    connecting,
    error,
    totalReceived,
    connect,
    disconnect,
    clearDonations: () => { setDonations([]); setTotalReceived(0); seen.current.clear(); },
  };
};
