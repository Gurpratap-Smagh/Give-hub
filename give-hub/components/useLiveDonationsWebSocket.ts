'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { toUSD } from '@/lib/prices/converter';
import { getTokenByAddress } from '@/lib/tokens/catalog';

// Contract ABI for ContributionReceived event
const CONTRIBUTION_ABI = [
  'event ContributionReceived(uint256 indexed campaignId, address indexed donor, uint256 indexed contributionId, address originalToken, uint256 originalAmount, uint256 convertedAmount, string originChain, string donorName, string note)'
];

// Event topic hash for ContributionReceived
export const CONTRIBUTION_RECEIVED_TOPIC = '0x92172ddc68276b600f2040b170301801a80f74b036dcd97aa9c3293d4463b971';

export interface LiveDonation {
  id: string; // tx-logIndex
  txHash: string;
  blockNumber: number;
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
  usdValue: number;
  tokenSymbol: string;
  timestamp: Date;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface UseLiveDonationsReturn {
  donations: LiveDonation[];
  connectionStatus: ConnectionStatus;
  error: Error | null;
  retry: () => void;
  isLoading: boolean;
}

export function useLiveDonationsWebSocket(
  campaignId?: string | number
): UseLiveDonationsReturn {
  const [donations, setDonations] = useState<LiveDonation[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const providerRef = useRef<ethers.WebSocketProvider | ethers.JsonRpcProvider | null>(null);
  const seenDonations = useRef<Set<string>>(new Set());

  // Environment variables
  const wsUrl = process.env.NEXT_PUBLIC_ZETA_RPC_WS || '';
  const httpUrl = process.env.NEXT_PUBLIC_ZETA_RPC_URL || '';
  const contractAddress = process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT || '';

  // Create ethers interface for event decoding
  const contractInterface = useMemo(() => new ethers.Interface(CONTRIBUTION_ABI), []);

  // Convert campaignId to topic1 filter if numeric
  const campaignTopic1 = useMemo(() => {
    if (!campaignId) return null;
    const idStr = String(campaignId).trim();
    if (!/^\d+$/.test(idStr)) return null;
    return ethers.zeroPadValue(ethers.toBeHex(BigInt(idStr)), 32);
  }, [campaignId]);

  // Decode donation event from log
  const decodeDonation = useCallback((log: ethers.Log): LiveDonation | null => {
    try {
      const parsed = contractInterface.parseLog({
        topics: log.topics,
        data: log.data
      });

      if (!parsed || parsed.name !== 'ContributionReceived') return null;

      const args = parsed.args;
      const campaignIdBig = args[0] as bigint;
      const donor = args[1] as string;
      const contributionIdBig = args[2] as bigint;
      const originalToken = args[3] as string;
      const originalAmountBig = args[4] as bigint;
      const convertedAmountBig = args[5] as bigint;
      const originChain = args[6] as string;
      const donorName = args[7] as string;
      const note = args[8] as string;

      // Get token metadata for symbol and decimals
      const tokenMeta = getTokenByAddress(originalToken.toLowerCase());
      const decimals = tokenMeta?.decimals || 18;
      const tokenSymbol = tokenMeta?.symbol || 'TOKEN';
      
      const originalAmount = ethers.formatUnits(originalAmountBig, decimals);
      const convertedAmount = ethers.formatUnits(convertedAmountBig, decimals);
      
      // Calculate USD value
      const usdValue = toUSD(originalAmount, tokenSymbol);

      const id = `${log.transactionHash}-${log.index}`;

      return {
        id,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        logIndex: log.index,
        campaignId: campaignIdBig.toString(),
        donor,
        contributionId: contributionIdBig.toString(),
        originalToken: originalToken.toLowerCase(),
        originalAmount,
        convertedAmount,
        originChain,
        donorName,
        note,
        usdValue,
        tokenSymbol,
        timestamp: new Date()
      };
    } catch (err) {
      console.error('Error decoding donation event:', err);
      return null;
    }
  }, [contractInterface]);

  // Handle incoming events
  const handleEvent = useCallback((log: ethers.Log) => {
    const donation = decodeDonation(log);
    if (!donation) return;

    // Skip if already seen
    if (seenDonations.current.has(donation.id)) return;
    seenDonations.current.add(donation.id);

    // Filter by campaign if specified
    if (campaignId && donation.campaignId !== String(campaignId)) return;

    console.log('[LiveDonations] New donation:', donation);

    setDonations(prev => {
      const updated = [donation, ...prev];
      // Keep only last 100 donations
      return updated.slice(0, 100);
    });
  }, [decodeDonation, campaignId]);

  // Setup WebSocket connection
  const setupConnection = useCallback(async () => {
    if (!contractAddress) {
      throw new Error('Contract address not configured');
    }

    let provider: ethers.WebSocketProvider | ethers.JsonRpcProvider;

    try {
      // Try WebSocket first, fallback to HTTP polling if needed
      if (wsUrl) {
        console.log('[LiveDonations] Attempting WebSocket connection...');
        provider = new ethers.WebSocketProvider(wsUrl);
      } else {
        console.log('[LiveDonations] Using HTTP polling fallback...');
        provider = new ethers.JsonRpcProvider(httpUrl);
      }

      providerRef.current = provider;

      // Test connection
      await provider.getBlockNumber();
      
      setConnectionStatus('connected');
      setError(null);
      console.log('[LiveDonations] Connected successfully');

      // Set up event filter
      const filter = {
        address: contractAddress,
        topics: campaignTopic1 ? [CONTRIBUTION_RECEIVED_TOPIC, campaignTopic1] : [CONTRIBUTION_RECEIVED_TOPIC]
      };

      // Listen for new events
      provider.on(filter, handleEvent);

      // Handle connection errors
      provider.on('error', (err) => {
        console.error('[LiveDonations] Provider error:', err);
        setError(err);
        setConnectionStatus('disconnected');
      });

      // Handle network changes
      provider.on('network', (newNetwork, oldNetwork) => {
        if (oldNetwork) {
          console.log('[LiveDonations] Network changed, reconnecting...');
          setupConnection();
        }
      });

      return provider;

    } catch (err) {
      console.error('[LiveDonations] Connection failed:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setConnectionStatus('disconnected');
      throw err;
    }
  }, [wsUrl, httpUrl, contractAddress, campaignTopic1, handleEvent]);

  // Retry function
  const retry = useCallback(() => {
    setError(null);
    setConnectionStatus('connecting');
    setRetryCount(prev => prev + 1);
  }, []);

  // Main effect for connection management
  useEffect(() => {
    if (!contractAddress) {
      setError(new Error('Contract address not configured'));
      return;
    }

    let mounted = true;

    const connect = async () => {
      if (!mounted) return;
      
      setIsLoading(true);
      setConnectionStatus('connecting');

      try {
        await setupConnection();
      } catch (err) {
        if (mounted) {
          console.error('[LiveDonations] Setup failed:', err);
          // Auto-retry after delay
          setTimeout(() => {
            if (mounted) retry();
          }, 5000);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    connect();

    return () => {
      mounted = false;
      
      if (providerRef.current) {
        console.log('[LiveDonations] Cleaning up connection...');
        try {
          providerRef.current.removeAllListeners();
          if ('destroy' in providerRef.current && typeof providerRef.current.destroy === 'function') {
            providerRef.current.destroy();
          }
        } catch (err) {
          console.warn('[LiveDonations] Cleanup error:', err);
        }
        providerRef.current = null;
      }
    };
  }, [contractAddress, campaignTopic1, retryCount, setupConnection, retry]);

  // Reset donations when campaign changes
  useEffect(() => {
    setDonations([]);
    seenDonations.current.clear();
  }, [campaignId]);

  return {
    donations,
    connectionStatus,
    error,
    retry,
    isLoading
  };
}
