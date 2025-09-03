'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { toUSD } from '@/lib/prices/converter';
import { getTokenByAddress } from '@/lib/tokens/catalog';

// Contract ABI for ContributionReceived event
const CONTRIBUTION_ABI = [
  'event ContributionReceived(uint256 indexed campaignId, address indexed donor, uint256 indexed contributionId, address originalToken, uint256 originalAmount, uint256 convertedAmount, string originChain, string donorName, string note)'
];

export const CONTRIBUTION_RECEIVED_TOPIC = '0x92172ddc68276b600f2040b170301801a80f74b036dcd97aa9c3293d4463b971';

export interface LiveDonation {
  id: string;
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

export function useLiveDonationsNew(campaignId?: string | number): UseLiveDonationsReturn {
  const [donations, setDonations] = useState<LiveDonation[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const providerRef = useRef<ethers.JsonRpcProvider | null>(null);
  const seenDonations = useRef<Set<string>>(new Set());
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastBlockRef = useRef<number>(0);
  const mountedRef = useRef(true);

  // Environment variables
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
      console.error('[LiveDonations] Error decoding donation event:', err);
      return null;
    }
  }, [contractInterface]);

  // Handle incoming events
  const handleEvent = useCallback((log: ethers.Log) => {
    if (!mountedRef.current) return;
    
    const donation = decodeDonation(log);
    if (!donation) return;

    // Skip if already seen
    if (seenDonations.current.has(donation.id)) return;
    seenDonations.current.add(donation.id);

    // Filter by campaign if specified
    if (campaignId && donation.campaignId !== String(campaignId)) return;

    console.log('[LiveDonations] New donation:', {
      id: donation.id,
      campaignId: donation.campaignId,
      donor: donation.donorName,
      amount: donation.originalAmount,
      symbol: donation.tokenSymbol,
      usd: donation.usdValue
    });

    setDonations(prev => {
      const updated = [donation, ...prev].slice(0, 100);
      return updated;
    });
  }, [decodeDonation, campaignId]);

  // HTTP polling function
  const pollForEvents = useCallback(async () => {
    if (!providerRef.current || !mountedRef.current) return;

    try {
      const provider = providerRef.current;
      // Use eth_getBlockByNumber instead of eth_blockNumber for ZetaChain
      let latestBlock: number;
      try {
        latestBlock = await provider.getBlockNumber();
      } catch (blockError) {
        console.warn('[LiveDonations] getBlockNumber failed, trying alternative:', blockError);
        // Try getting latest block directly
        const block = await provider.getBlock('latest');
        if (!block) throw new Error('Could not get latest block');
        latestBlock = block.number;
      }
      
      if (latestBlock > lastBlockRef.current) {
        const fromBlock = lastBlockRef.current + 1;
        const toBlock = latestBlock;
        
        console.log(`[LiveDonations] Polling blocks ${fromBlock} to ${toBlock}`);
        
        const filter = {
          address: contractAddress,
          topics: campaignTopic1 ? [CONTRIBUTION_RECEIVED_TOPIC, campaignTopic1] : [CONTRIBUTION_RECEIVED_TOPIC],
          fromBlock,
          toBlock
        };

        const logs = await provider.getLogs(filter);
        
        if (logs.length > 0) {
          console.log(`[LiveDonations] Found ${logs.length} new events`);
          logs.forEach(handleEvent);
        }
        
        lastBlockRef.current = latestBlock;
      }
      
      // Update connection status to connected if we successfully polled
      if (connectionStatus !== 'connected') {
        setConnectionStatus('connected');
        setError(null);
      }
      
    } catch (err) {
      console.error('[LiveDonations] Polling error:', err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setConnectionStatus('disconnected');
      }
    }
  }, [contractAddress, campaignTopic1, handleEvent, connectionStatus]);

  // Setup connection and start polling
  const setupConnection = useCallback(async () => {
    if (!contractAddress || !httpUrl) {
      throw new Error('Missing contract address or RPC URL');
    }

    console.log('[LiveDonations] Setting up HTTP connection...');
    
    // Create HTTP provider with custom configuration for ZetaChain
    const provider = new ethers.JsonRpcProvider(httpUrl, {
      name: 'zetachain-athens',
      chainId: 7001
    });
    
    // Test connection with fallback methods
    let blockNumber: number;
    try {
      blockNumber = await provider.getBlockNumber();
    } catch (err) {
      console.warn('[LiveDonations] getBlockNumber failed, trying getBlock:', err);
      const block = await provider.getBlock('latest');
      if (!block) throw new Error('Could not connect to ZetaChain RPC');
      blockNumber = block.number;
    }
    console.log(`[LiveDonations] Connected to ZetaChain block ${blockNumber}`);
    
    providerRef.current = provider;
    
    // Initialize from recent blocks
    lastBlockRef.current = Math.max(0, blockNumber - 50);
    
    // Start polling
    setConnectionStatus('connected');
    setError(null);
    
    // Do initial backfill
    await pollForEvents();
    
    // Set up regular polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    
    pollIntervalRef.current = setInterval(() => {
      if (mountedRef.current) {
        pollForEvents();
      }
    }, 3000);
    
    console.log('[LiveDonations] HTTP polling started');
    
  }, [contractAddress, httpUrl, pollForEvents]);

  // Retry function
  const retry = useCallback(() => {
    console.log('[LiveDonations] Retrying connection...');
    setError(null);
    setConnectionStatus('connecting');
    setRetryCount(prev => prev + 1);
  }, []);

  // Main effect for connection management
  useEffect(() => {
    if (!contractAddress || !httpUrl) {
      setError(new Error('Missing configuration: contract address or RPC URL'));
      return;
    }

    mountedRef.current = true;

    const connect = async () => {
      if (!mountedRef.current) return;
      
      setIsLoading(true);
      setConnectionStatus('connecting');

      try {
        await setupConnection();
      } catch (err) {
        if (mountedRef.current) {
          console.error('[LiveDonations] Setup failed:', err);
          setError(err instanceof Error ? err : new Error(String(err)));
          setConnectionStatus('disconnected');
          
          // Auto-retry after delay
          setTimeout(() => {
            if (mountedRef.current) retry();
          }, 5000);
        }
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    };

    connect();

    return () => {
      mountedRef.current = false;
      
      // Clean up polling
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      
      // Clean up provider
      if (providerRef.current) {
        try {
          providerRef.current.removeAllListeners();
        } catch (err) {
          console.warn('[LiveDonations] Cleanup error:', err);
        }
        providerRef.current = null;
      }
    };
  }, [contractAddress, httpUrl, retryCount, setupConnection, retry]);

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
