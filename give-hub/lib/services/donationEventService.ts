'use client';

import { ethers } from 'ethers';
import { toUSD } from '@/lib/prices/converter';
import { getTokenByAddress } from '@/lib/tokens/catalog';

const CONTRIBUTION_ABI = [
  'event ContributionReceived(uint256 indexed campaignId, address indexed donor, uint256 indexed contributionId, address originalToken, uint256 originalAmount, uint256 convertedAmount, string originChain, string donorName, string note)'
];

// Pre-computed topic to avoid potential issues with ethers.Interface.getEventTopic()
// This matches: keccak256('ContributionReceived(uint256,address,uint256,address,uint256,uint256,string,string,string)')
const CONTRIBUTION_RECEIVED_TOPIC = '0xc651bb5718cda0929dca50389be20dbd9410697ae1db9cd889366f95d8bd0a7e';

export function getContributionReceivedTopic() {
  // Try to calculate dynamically, fall back to pre-computed value
  try {
    const iface = new ethers.Interface(CONTRIBUTION_ABI);
    if (typeof (iface as any).getEventTopic === 'function') {
      return (iface as any).getEventTopic('ContributionReceived');
    }
  } catch (err) {
    console.warn('[getContributionReceivedTopic] Failed to compute event topic dynamically:', err);
  }
  return CONTRIBUTION_RECEIVED_TOPIC;
}

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

interface DonationEventServiceConfig {
  rpcUrl: string;
  contractAddress: string;
  pollInterval?: number;
  lookbackBlocks?: number;
}

export class DonationEventService {
  private provider: ethers.JsonRpcProvider | ethers.WebSocketProvider | null = null;
  private pollProvider: ethers.JsonRpcProvider | null = null; // HTTP provider used for polling if WS lacks some RPC methods
  private contractInterface: ethers.Interface;
  private contractAddress: string;
  private listeners: Map<string, Set<(donation: LiveDonation) => void>> = new Map();
  private seenDonations: Set<string> = new Set();
  private isConnected: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastProcessedBlock: number = 0;
  private pollIntervalMs: number;
  private lookbackBlocks: number;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = Number(process.env.NEXT_PUBLIC_DONATION_MAX_RECONNECTS || process.env.DONATION_MAX_RECONNECTS || 12);
  private wsLogListener: ((log: any) => void) | null = null;
  private isScanningBackwards: boolean = false;
  private DEEP_SCAN_LIMIT = 500000; // 1. Limit scan to 500k blocks

  async connect(): Promise<void> {
  if (this.isConnected) return;

  try {
    const httpUrl = process.env.NEXT_PUBLIC_ZETA_RPC_URL;
    this.pollProvider = new ethers.JsonRpcProvider(httpUrl);
    this.provider = this.pollProvider; 

    const currentBlock = await this.pollProvider.getBlockNumber();
    this.isConnected = true;
    
    // Fix: Instead of searching from block 1, we find the safe limit
    // BlockPI lowest height is usually currentBlock - 100k
    const safeLowestBlock = Math.max(0, currentBlock - 500000); 

    // 1. Start Fast Polling (For Multi-user Live Sync)
    this.startLivePolling();

    // 2. Start Background Script (For History Backfill)
    this.runDeepScan(currentBlock, safeLowestBlock).catch(e => console.error("History Sync Error:", e));

  } catch (error) {
    this.scheduleReconnect();
  }
  }

  constructor(config?: Partial<DonationEventServiceConfig>) {
    this.contractInterface = new ethers.Interface(CONTRIBUTION_ABI);
    // Prefer explicit config, then modern env vars used by the app
    this.contractAddress = config?.contractAddress
      || process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT
      || process.env.NEXT_PUBLIC_CROWDFUND_ADDRESS
      || process.env.NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS
      || '';
    this.pollIntervalMs = config?.pollInterval || 2000; // Poll every 2 seconds
    this.lookbackBlocks = config?.lookbackBlocks || 100;
  }
  private startLivePolling(): void {
  // Poll every 3 seconds for the LATEST blocks only
  setInterval(async () => {
    try {
      const latest = await this.pollProvider!.getBlockNumber();
      // Only check the last 10 blocks (extremely fast, low RPC cost)
      await this.processBlocks(latest - 10, latest);
    } catch (err) {
      console.warn("Live poll skipped:", err.message);
    }
  }, 3000);
}
  private async runDeepScan(startFromBlock: number, safeLowestBlock: number): Promise<void> {
  if (this.isScanningBackwards) return;
  this.isScanningBackwards = true;

  const providerToUse = this.pollProvider || this.provider;
  const CHUNK_SIZE = 4500; // Safe for BlockPI's 5k limit
  
  let currentToBlock = startFromBlock;

  console.log(`[DonationEventService] Starting Deep Scan: ${startFromBlock} down to ${safeLowestBlock}`);

  while (currentToBlock > safeLowestBlock && this.isConnected) {
    // Calculate the start of the chunk, ensuring it doesn't go below the pruning floor
    let currentFromBlock = Math.max(safeLowestBlock, currentToBlock - CHUNK_SIZE);

    try {
      const filter = {
        address: this.contractAddress,
        topics: [getContributionReceivedTopic()],
        fromBlock: currentFromBlock,
        toBlock: currentToBlock,
      };

      const logs = await providerToUse!.getLogs(filter);
      
      // Process logs in order
      for (const log of logs) {
        const donation = this.decodeDonation(log);
        
        // Use the Set to prevent showing a donation the user just made (duplicate signal)
        if (donation && !this.seenDonations.has(donation.id)) {
          this.seenDonations.add(donation.id);
          await this.processDonation(donation);
        }
      }

      // If we've reached the absolute floor, stop the loop
      if (currentFromBlock === safeLowestBlock) break;

      // Move the window backward for the next iteration
      currentToBlock = currentFromBlock - 1;
      
      // Small pause to avoid RPC rate limiting/throttling
      await new Promise(resolve => setTimeout(resolve, 150));

    } catch (error) {
      console.error(`[DonationEventService] Deep Scan error at block ${currentToBlock}:`, error);
      // If the RPC fails, wait longer before retrying to let the node recover
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`[DonationEventService] Deep Scan Completed successfully.`);
  this.isScanningBackwards = false;
}

  private setupLiveListener(): void {
    if (!this.provider || !this.contractAddress) return;

    const filter = {
      address: this.contractAddress,
      topics: [getContributionReceivedTopic()]
    };

    // When a new donation is detected by WS or Polling
    const handleNewLog = async (log: ethers.Log) => {
      const donation = this.decodeDonation(log);
      // Ensure no duplication with the Deep Scan thread
      if (donation && !this.seenDonations.has(donation.id)) {
        this.seenDonations.add(donation.id);
        console.log('[DonationEventService] Live donation detected!', donation.txHash);
        await this.processDonation(donation);
      }
    };

    this.provider.on(filter as any, handleNewLog);
  }

  private startPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(async () => {
      const providerToUse = this.pollProvider || this.provider;
      if (!providerToUse || !this.isConnected) return;
      
      try {
        const currentBlock = await providerToUse.getBlockNumber();
        
        if (currentBlock > this.lastProcessedBlock) {
          // Process new blocks
          await this.processBlocks(this.lastProcessedBlock + 1, currentBlock);
          this.lastProcessedBlock = currentBlock;
        }
      } catch (error) {
        console.error('[DonationEventService] Polling error:', error);
        // Don't disconnect immediately, just log the error
        // Network might be temporarily unavailable
      }
    }, this.pollIntervalMs);
  }

  private async processBlocks(fromBlock: number, toBlock: number): Promise<void> {
    const providerToUse = this.pollProvider || this.provider;
    if (!providerToUse || !this.contractAddress) return;

    const CHUNK_SIZE = 4000; // Max block range allowed by some RPC providers
    let allLogs: ethers.Log[] = [];

    try {
      for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
        const end = Math.min(start + CHUNK_SIZE - 1, toBlock);
        
        const filter = {
          address: this.contractAddress,
          topics: [getContributionReceivedTopic()],
          fromBlock: start,
          toBlock: end,
        };

        const logs = await providerToUse.getLogs(filter);
        allLogs = allLogs.concat(logs);
      }
      
      for (const log of allLogs) {
        const donation = this.decodeDonation(log);
        if (donation && !this.seenDonations.has(donation.id)) {
          this.seenDonations.add(donation.id);
          
          console.log('[DonationEventService] New donation detected:', {
            campaignId: donation.campaignId,
            donor: donation.donorName,
            amount: donation.originalAmount,
            symbol: donation.tokenSymbol,
            usd: donation.usdValue,
            txHash: donation.txHash
          });

          // Process the donation
          await this.processDonation(donation);
        }
      }
    } catch (error) {
      console.error('[DonationEventService] Error processing blocks:', error);
    }
  }

  private decodeDonation(log: ethers.Log): LiveDonation | null {
    try {
      const parsed = this.contractInterface.parseLog({
        topics: log.topics as string[],
        data: log.data
      });

      if (!parsed || parsed.name !== 'ContributionReceived') return null;

      const args = parsed.args;
      const campaignId = args[0].toString();
      const donor = args[1] as string;
      const contributionId = args[2].toString();
      const originalToken = args[3] as string;
      const originalAmount = args[4] as bigint;
      const convertedAmount = args[5] as bigint;
      const originChain = args[6] as string;
      const donorName = args[7] as string;
      const note = args[8] as string;

      // Get token metadata
      const tokenMeta = getTokenByAddress(originalToken.toLowerCase());
      const decimals = tokenMeta?.decimals || 18;
      let tokenSymbol = tokenMeta?.symbol || 'TOKEN';
      
      const formattedAmount = ethers.formatUnits(originalAmount, decimals);
      const formattedConverted = ethers.formatUnits(convertedAmount, decimals);
      
      // Normalize symbol for price lookup:
      // - Remove chain suffix (e.g., "USDC.zeta" -> "USDC")
      // - Map common aliases (e.g., "zETH" -> "ETH" for price lookup)
      const baseSymbol = tokenSymbol.split('.')[0];
      const priceSymbol = baseSymbol === 'zETH' ? 'ETH' : baseSymbol;
      
      // Calculate USD value with the normalized symbol
      const usdValue = toUSD(parseFloat(formattedAmount), priceSymbol);
      
      // Validate USD value
      if (!Number.isFinite(usdValue) || usdValue < 0) {
        console.warn(`[DonationEventService] Invalid USD value calculated: ${usdValue} for ${formattedAmount} ${priceSymbol}`);
      }

      return {
        id: `${log.transactionHash}-${log.index}`,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        logIndex: log.index,
        campaignId,
        donor,
        contributionId,
        originalToken: originalToken.toLowerCase(),
        originalAmount: formattedAmount,
        convertedAmount: formattedConverted,
        originChain,
        donorName,
        note,
        usdValue,
        tokenSymbol,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('[DonationEventService] Error decoding donation:', error);
      return null;
    }
  }

  private async processDonation(donation: LiveDonation): Promise<void> {
    // Update MongoDB with retry logic
    await this.updateCampaignInMongoDB(donation);

    // Notify all listeners for this campaign
    const listeners = this.listeners.get(donation.campaignId) || new Set();
    const globalListeners = this.listeners.get('*') || new Set();
    
    [...listeners, ...globalListeners].forEach(listener => {
      try {
        listener(donation);
      } catch (error) {
        console.error('[DonationEventService] Listener error:', error);
      }
    });
  }

  private async updateCampaignInMongoDB(donation: LiveDonation, retries = 3): Promise<void> {
    // Ensure usdValue is a valid number
    let usdAmount = Number(donation.usdValue);
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      console.warn(`[DonationEventService] Invalid USD amount: ${donation.usdValue}, using fallback conversion`, {
        originalAmount: donation.originalAmount,
        symbol: donation.tokenSymbol,
      });
      // Fallback: try to convert using the original amount and symbol again
      usdAmount = toUSD(parseFloat(donation.originalAmount), donation.tokenSymbol);
    }
    
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
      console.error(`[DonationEventService] Could not calculate valid USD amount for donation:`, {
        originalAmount: donation.originalAmount,
        symbol: donation.tokenSymbol,
        txHash: donation.txHash,
      });
      return; // Skip this donation if we can't get a valid amount
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Record donation details and atomically increment raised amount inside the API route
        const donationResponse = await fetch(`/api/campaigns/${donation.campaignId}/donations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: usdAmount, // Ensure this is a number, not a string
            chain: donation.originChain,
            donorName: donation.donorName || 'Anonymous',
            tokenSymbol: 'USD', // Ensure backend treats amount as USD and skips reconversion
            txId: donation.txHash,
            timestamp: donation.timestamp.toISOString()
          })
        });

        if (!donationResponse.ok) {
          const errorText = await donationResponse.text();
          throw new Error(`[DonationEventService] Failed to record donation (and increment raised): ${errorText}`);
        }

        console.log('[DonationEventService] Successfully recorded donation:', {
          campaignId: donation.campaignId,
          amount: usdAmount,
          txHash: donation.txHash,
        });
        
        return; // Success
      } catch (error) {
        console.error(`[DonationEventService] MongoDB update attempt ${attempt}/${retries} failed:`, error);
        if (attempt === retries) {
          console.error('[DonationEventService] All retry attempts failed for MongoDB update');
        } else {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
  }

  subscribe(campaignId: string, callback: (donation: LiveDonation) => void): () => void {
    if (!this.listeners.has(campaignId)) {
      this.listeners.set(campaignId, new Set());
    }
    
    this.listeners.get(campaignId)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(campaignId);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.listeners.delete(campaignId);
        }
      }
    };
  }

  private scheduleReconnect(): void {
    const maxAttempts = Number(process.env.NEXT_PUBLIC_DONATION_MAX_RECONNECTS || process.env.DONATION_MAX_RECONNECTS || this.maxReconnectAttempts || 12);
    if (this.reconnectAttempts >= maxAttempts) {
      console.error('[DonationEventService] Max reconnect attempts reached');
      // Reset attempts slowly so it can try again later instead of permanently stopping
      this.reconnectAttempts = 0;
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    console.log(`[DonationEventService] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${maxAttempts})`);
    
    setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }

  disconnect(): void {
    this.isConnected = false;
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    
    if (this.provider) {
      try {
        this.provider.removeAllListeners();
      } catch (e) {
        console.error('[DonationEventService] Error removing listeners on provider:', e);
      }
      this.provider = null;
    }

    if (this.pollProvider) {
      try {
        this.pollProvider.removeAllListeners();
      } catch (e) {
        console.error('[DonationEventService] Error removing listeners on poll provider:', e);
      }
      this.pollProvider = null;
    }

    // Reset WS listener reference
    this.wsLogListener = null;
    
    this.listeners.clear();
    console.log('[DonationEventService] Disconnected');
  }

  // Get connection status
  getStatus() {
    return {
      isConnected: this.isConnected,
      lastProcessedBlock: this.lastProcessedBlock,
      seenDonations: this.seenDonations.size
    };
  }
}

// Singleton instance
let instance: DonationEventService | null = null;

export function getDonationEventService(): DonationEventService {
  if (!instance) {
    instance = new DonationEventService();
  }
  return instance;
}
