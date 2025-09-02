'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import { getTokenByAddress as getTokenMeta } from "@/lib/tokens/catalog";

const CROWDFUND_ABI = [
  "event ContributionReceived(uint256 indexed campaignId, address indexed donor, uint256 indexed contributionId, address originalToken, uint256 originalAmount, uint256 convertedAmount, string originChain, string donorName, string note)",
  "event CampaignCreated(uint256 indexed campaignId, address indexed creator, address preferredZRC20)"
];

const rpcUrl = process.env.NEXT_PUBLIC_ZETA_RPC_URL || process.env.NEXT_PUBLIC_ZETA_RPC_HTTP || '';
const contractAddress = process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT || '';

export type LiveDonationEvent = {
  id: string; // txHash-logIndex
  blockNumber: number;
  txHash: string;
  logIndex: number;
  campaignId: string;
  donor: string;
  contributionId: string;
  originalToken: string;
  originalAmount: string;
  convertedAmount: string;
  originChain: string;
  donorName: string;
  note: string;
  timestamp: Date;
};

export type LiveCampaignEvent = {
  id: string; // txHash-logIndex
  blockNumber: number;
  txHash: string;
  logIndex: number;
  campaignId: string;
  creator: string;
  preferredZRC20: string;
  timestamp: Date;
};

const DEFAULT_DECIMALS = 18;
const ZERO = "0x0000000000000000000000000000000000000000";

function getDecimals(addrLower: string) {
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
}

function toTopic1IfNumeric(id: string | number | undefined | null) {
  if (id === undefined || id === null) return null;
  const s = String(id).trim();
  if (!/^\d+$/.test(s)) return null;
  return ethers.zeroPadValue(ethers.toBeHex(BigInt(s)), 32);
}

export function useLiveDonations(
  targetCampaignId?: string | number,
  options?: { enabled?: boolean }
) {
  const [donations, setDonations] = useState<LiveDonationEvent[]>([]);
  const [campaigns, setCampaigns] = useState<LiveCampaignEvent[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [error, setError] = useState<string | null>(null);
  
  const seenDonations = useRef<Set<string>>(new Set());
  const seenCampaigns = useRef<Set<string>>(new Set());

  const iface = useMemo(() => new ethers.Interface(CROWDFUND_ABI), []);
  const donationTopic0 = useMemo(
    () => ethers.id("ContributionReceived(uint256,address,uint256,address,uint256,uint256,string,string,string)"),
    []
  );
  const campaignTopic0 = useMemo(
    () => ethers.id("CampaignCreated(uint256,address,address)"),
    []
  );
  const topic1 = useMemo(() => toTopic1IfNumeric(targetCampaignId), [targetCampaignId]);

  const enabled = useMemo(() => options?.enabled !== false, [options?.enabled]);
  const expectedCidStr = useMemo(() => {
    const s = targetCampaignId == null ? undefined : String(targetCampaignId).trim();
    return s && /^\d+$/.test(s) ? s : undefined;
  }, [targetCampaignId]);

  const decodeDonationLog = useCallback((log: ethers.Log): LiveDonationEvent => {
    const parsed = iface.parseLog(log);
    if (!parsed) {
      throw new Error("Failed to parse ContributionReceived event");
    }

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
      timestamp: new Date(),
    };
  }, [iface]);

  const decodeCampaignLog = useCallback((log: ethers.Log): LiveCampaignEvent => {
    const parsed = iface.parseLog(log);
    if (!parsed) {
      throw new Error("Failed to parse CampaignCreated event");
    }

    const args = parsed.args as readonly unknown[];
    const campaignId = args[0] as bigint;
    const creator = args[1] as string;
    const preferredZRC20 = args[2] as string;

    const id = `${log.transactionHash}-${log.index}`;

    return {
      id,
      blockNumber: log.blockNumber!,
      txHash: log.transactionHash!,
      logIndex: log.index!,
      campaignId: campaignId.toString(),
      creator,
      preferredZRC20,
      timestamp: new Date(),
    };
  }, [iface]);

  // WebSocket-based event listening with polling fallback
  useEffect(() => {
    if (!enabled || !rpcUrl || !contractAddress) {
      return;
    }

    let isActive = true;
    let provider: ethers.WebSocketProvider | ethers.JsonRpcProvider | null = null;
    let pollInterval: NodeJS.Timeout | null = null;
    let lastBlockNumber = 0;

    // WebSocket disabled due to BlockPI RPC incompatibility with eth_blockNumber

    const setupEventListeners = async () => {
      try {
        if (!isActive) return;

        // Always use HTTP polling since WebSocket is disabled
        console.log('[useLiveDonations] Using HTTP polling');
        await setupPolling();

      } catch (err) {
        console.error('[useLiveDonations] WebSocket setup failed, falling back to polling:', err);
        if (isActive) {
          await setupPolling();
        }
      }
    };

    const setupPolling = async () => {
      try {
        provider = new ethers.JsonRpcProvider(rpcUrl);
        const currentBlock = await provider.getBlockNumber();
        
        if (!isActive) return;
        setConnectionStatus('connected');
        lastBlockNumber = currentBlock - 100; // Start from 100 blocks back

        const poll = async () => {
          try {
            if (!isActive || !provider) return;
            
            const currentBlock = await provider.getBlockNumber();
            
            // Only check for new events if we have a newer block
            if (currentBlock > lastBlockNumber) {
              await fetchHistoricalEvents(provider, lastBlockNumber + 1, currentBlock);
              lastBlockNumber = currentBlock;
            }

          } catch (err) {
            console.error('[useLiveDonations] Polling error:', err);
            setError('Failed to connect to blockchain');
            setConnectionStatus('disconnected');
          }
        };

        // Initial poll
        await poll();

        // Set up polling interval (every 3 seconds for better responsiveness)
        pollInterval = setInterval(() => {
          if (isActive) poll();
        }, 3000);

      } catch (err) {
        console.error('[useLiveDonations] HTTP provider setup failed:', err);
        setError('Failed to connect to blockchain');
        setConnectionStatus('disconnected');
      }
    };

    const fetchHistoricalEvents = async (
      provider: ethers.Provider, 
      fromBlock: number, 
      toBlock: number
    ) => {
      try {
        const donationFilter = {
          address: contractAddress,
          topics: topic1 ? [donationTopic0, topic1] : [donationTopic0],
          fromBlock,
          toBlock
        };

        const campaignFilter = {
          address: contractAddress,
          topics: [campaignTopic0],
          fromBlock,
          toBlock
        };

        const [donationLogs, campaignLogs] = await Promise.all([
          provider.getLogs(donationFilter),
          provider.getLogs(campaignFilter)
        ]);

        // Process donation events
        for (const log of donationLogs) {
          try {
            const decoded = decodeDonationLog(log);
            
            // Filter by campaign ID if specified
            if (expectedCidStr && decoded.campaignId !== expectedCidStr) continue;
            
            // Avoid duplicates
            if (seenDonations.current.has(decoded.id)) continue;
            seenDonations.current.add(decoded.id);

            console.log('[useLiveDonations] Historical donation:', decoded);
            
            setDonations(prev => {
              const next = [decoded, ...prev];
              return next.slice(0, 100);
            });
          } catch (err) {
            console.error('[useLiveDonations] Failed to decode donation event:', err);
          }
        }

        // Process campaign events
        for (const log of campaignLogs) {
          try {
            const decoded = decodeCampaignLog(log);
            
            // Avoid duplicates
            if (seenCampaigns.current.has(decoded.id)) continue;
            seenCampaigns.current.add(decoded.id);

            console.log('[useLiveDonations] Historical campaign:', decoded);
            
            setCampaigns(prev => {
              const next = [decoded, ...prev];
              return next.slice(0, 100);
            });
          } catch (err) {
            console.error('[useLiveDonations] Failed to decode campaign event:', err);
          }
        }

      } catch (logErr) {
        console.error('[useLiveDonations] Failed to fetch historical logs:', logErr);
      }
    };

    setupEventListeners();

    return () => {
      isActive = false;
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      if (provider) {
        if ('removeAllListeners' in provider) {
          provider.removeAllListeners();
        }
        if ('destroy' in provider) {
          provider.destroy();
        }
      }
      setConnectionStatus('disconnected');
    };
  }, [enabled, donationTopic0, campaignTopic0, topic1, expectedCidStr, decodeDonationLog, decodeCampaignLog]);

  return {
    donations,
    campaigns,
    connectionStatus,
    error,
    isConnected: connectionStatus === 'connected'
  };
}
