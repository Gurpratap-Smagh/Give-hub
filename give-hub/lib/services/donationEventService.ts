'use client';

import { ethers } from 'ethers';
import { toUSD } from '@/lib/prices/converter';
import { getTokenByAddress } from '@/lib/tokens/catalog';

const CONTRIBUTION_ABI = [
  'event ContributionReceived(uint256 indexed campaignId, address indexed donor, uint256 indexed contributionId, address originalToken, uint256 originalAmount, uint256 convertedAmount, string originChain, string donorName, string note)'
];

export const CONTRIBUTION_RECEIVED_TOPIC = ethers.id('ContributionReceived(uint256,address,uint256,address,uint256,uint256,string,string,string)');

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
  private provider: ethers.JsonRpcProvider | null = null;
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
  private maxReconnectAttempts: number = 5;

  constructor(config?: Partial<DonationEventServiceConfig>) {
    this.contractInterface = new ethers.Interface(CONTRIBUTION_ABI);
    this.contractAddress = config?.contractAddress || process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT || '';
    this.pollIntervalMs = config?.pollInterval || 2000; // Poll every 2 seconds
    this.lookbackBlocks = config?.lookbackBlocks || 100;
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    try {
      const rpcUrl = process.env.NEXT_PUBLIC_ZETA_RPC_URL || process.env.NEXT_PUBLIC_ZETA_RPC_HTTP;
      if (!rpcUrl) {
        throw new Error('RPC URL not configured');
      }

      // Create provider with retry logic
      this.provider = new ethers.JsonRpcProvider(rpcUrl, {
        name: 'zetachain-athens',
        chainId: 7001
      });

      // Test connection
      const blockNumber = await this.provider.getBlockNumber();
      console.log(`[DonationEventService] Connected to block ${blockNumber}`);
      
      this.lastProcessedBlock = Math.max(0, blockNumber - this.lookbackBlocks);
      
      // Backfill recent events
      await this.processBlocks(this.lastProcessedBlock, blockNumber);
      
      // Start polling
      this.startPolling();
      
      this.isConnected = true;
      this.reconnectAttempts = 0;
    } catch (error) {
      console.error('[DonationEventService] Connection failed:', error);
      this.scheduleReconnect();
      throw error;
    }
  }

  private startPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(async () => {
      if (!this.provider || !this.isConnected) return;
      
      try {
        const currentBlock = await this.provider.getBlockNumber();
        
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
    if (!this.provider || !this.contractAddress) return;

    const CHUNK_SIZE = 4000; // Max block range allowed by some RPC providers
    let allLogs: ethers.Log[] = [];

    try {
      for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
        const end = Math.min(start + CHUNK_SIZE - 1, toBlock);
        
        const filter = {
          address: this.contractAddress,
          topics: [CONTRIBUTION_RECEIVED_TOPIC],
          fromBlock: start,
          toBlock: end,
        };

        const logs = await this.provider.getLogs(filter);
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
      const tokenSymbol = tokenMeta?.symbol || 'TOKEN';
      
      const formattedAmount = ethers.formatUnits(originalAmount, decimals);
      const formattedConverted = ethers.formatUnits(convertedAmount, decimals);
      
      // Calculate USD value
      const usdValue = toUSD(parseFloat(formattedAmount), tokenSymbol);

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
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Record donation details and atomically increment raised amount inside the API route
        const donationResponse = await fetch(`/api/campaigns/${donation.campaignId}/donations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: donation.usdValue, // Pass USD amount
            chain: donation.originChain,
            donorName: donation.donorName,
            tokenSymbol: 'USD', // Ensure backend treats amount as USD and skips reconversion
            txId: donation.txHash,
            timestamp: donation.timestamp
          })
        });

        if (!donationResponse.ok) {
          const errorText = await donationResponse.text();
          throw new Error(`[DonationEventService] Failed to record donation (and increment raised): ${errorText}`);
        }

        return; // Success
      } catch (error) {
        console.error(`[DonationEventService] MongoDB update attempt ${attempt} failed:`, error);
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
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[DonationEventService] Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    console.log(`[DonationEventService] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
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
      this.provider.removeAllListeners();
      this.provider = null;
    }
    
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
