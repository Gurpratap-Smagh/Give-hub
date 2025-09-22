'use client';

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

export class DonationWebSocketService {
  private wsProvider: ethers.WebSocketProvider | null = null;
  private httpProvider: ethers.JsonRpcProvider | null = null;
  private contractInterface: ethers.Interface;
  private contractAddress: string;
  private listeners: Map<string, Set<(donation: LiveDonation) => void>> = new Map();
  private seenDonations: Set<string> = new Set();
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelay: number = 1000;
  private pollInterval: NodeJS.Timeout | null = null;
  private lastProcessedBlock: number = 0;
  private useWebSocket: boolean = false; // Default to HTTP polling for ZetaChain

  constructor() {
    this.contractInterface = new ethers.Interface(CONTRIBUTION_ABI);
    this.contractAddress = process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT || '';
    
    // Check if WebSocket URL is available
    const wsUrl = process.env.NEXT_PUBLIC_ZETA_WS_URL;
    const httpUrl = process.env.NEXT_PUBLIC_ZETA_RPC_URL;
    
    if (wsUrl && wsUrl.startsWith('wss://')) {
      this.useWebSocket = true;
      console.log('[DonationWS] WebSocket mode enabled');
    } else if (httpUrl) {
      this.useWebSocket = false;
      console.log('[DonationWS] HTTP polling mode enabled');
    }
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;

    try {
      if (this.useWebSocket) {
        await this.connectWebSocket();
      } else {
        await this.connectHttpPolling();
      }
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('[DonationWS] Connected successfully');
    } catch (error) {
      console.error('[DonationWS] Connection failed:', error);
      this.scheduleReconnect();
      throw error;
    }
  }

  private async connectWebSocket(): Promise<void> {
    const wsUrl = process.env.NEXT_PUBLIC_ZETA_WS_URL;
    if (!wsUrl) throw new Error('WebSocket URL not configured');

    // Create WebSocket provider
    this.wsProvider = new ethers.WebSocketProvider(wsUrl, {
      name: 'zetachain-athens',
      chainId: 7001
    });

    // Set up event listeners
    this.wsProvider.on('block', async (blockNumber) => {
      await this.processBlock(blockNumber);
    });

    // Test connection
    const blockNumber = await this.wsProvider.getBlockNumber();
    console.log(`[DonationWS] Connected to block ${blockNumber}`);
    
    // Backfill recent events
    await this.backfillEvents(Math.max(0, blockNumber - 100), blockNumber);
  }

  private async connectHttpPolling(): Promise<void> {
    const httpUrl = process.env.NEXT_PUBLIC_ZETA_RPC_URL;
    if (!httpUrl) throw new Error('HTTP RPC URL not configured');

    // Create HTTP provider
    this.httpProvider = new ethers.JsonRpcProvider(httpUrl, {
      name: 'zetachain-athens',
      chainId: 7001
    });

    // Test connection
    const blockNumber = await this.httpProvider.getBlockNumber();
    console.log(`[DonationWS] Connected via HTTP to block ${blockNumber}`);
    
    this.lastProcessedBlock = Math.max(0, blockNumber - 100);
    
    // Backfill recent events
    await this.backfillEvents(this.lastProcessedBlock, blockNumber);
    
    // Start polling
    this.startPolling();
  }

  private startPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    this.pollInterval = setInterval(async () => {
      if (!this.httpProvider || !this.isConnected) return;
      
      try {
        const currentBlock = await this.httpProvider.getBlockNumber();
        if (currentBlock > this.lastProcessedBlock) {
          await this.processBlocks(this.lastProcessedBlock + 1, currentBlock);
          this.lastProcessedBlock = currentBlock;
        }
      } catch (error) {
        console.error('[DonationWS] Polling error:', error);
      }
    }, 2000); // Poll every 2 seconds
  }

  private async processBlock(blockNumber: number): Promise<void> {
    if (!this.wsProvider) return;
    await this.processBlocks(blockNumber, blockNumber);
  }

  private async processBlocks(fromBlock: number, toBlock: number): Promise<void> {
    const provider = this.wsProvider || this.httpProvider;
    if (!provider || !this.contractAddress) return;

    try {
      const filter = {
        address: this.contractAddress,
        topics: [CONTRIBUTION_RECEIVED_TOPIC],
        fromBlock,
        toBlock
      };

      const logs = await provider.getLogs(filter);
      
      for (const log of logs) {
        const donation = this.decodeDonation(log);
        if (donation && !this.seenDonations.has(donation.id)) {
          this.seenDonations.add(donation.id);
          await this.processDonation(donation);
        }
      }
    } catch (error) {
      console.error('[DonationWS] Error processing blocks:', error);
    }
  }

  private async backfillEvents(fromBlock: number, toBlock: number): Promise<void> {
    console.log(`[DonationWS] Backfilling events from block ${fromBlock} to ${toBlock}`);
    await this.processBlocks(fromBlock, toBlock);
  }

  private decodeDonation(log: ethers.Log): LiveDonation | null {
    try {
      const parsed = this.contractInterface.parseLog({
        topics: log.topics,
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
      const usdValue = toUSD(formattedAmount, tokenSymbol);

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
      console.error('[DonationWS] Error decoding donation:', error);
      return null;
    }
  }

  private async processDonation(donation: LiveDonation): Promise<void> {
    console.log('[DonationWS] Processing donation:', {
      campaignId: donation.campaignId,
      donor: donation.donorName,
      amount: donation.originalAmount,
      symbol: donation.tokenSymbol,
      usd: donation.usdValue
    });

    // Update MongoDB with the donation
    await this.updateCampaignRaised(donation);

    // Notify all listeners for this campaign
    const listeners = this.listeners.get(donation.campaignId) || new Set();
    const globalListeners = this.listeners.get('*') || new Set();
    
    [...listeners, ...globalListeners].forEach(listener => {
      try {
        listener(donation);
      } catch (error) {
        console.error('[DonationWS] Listener error:', error);
      }
    });
  }

  private async updateCampaignRaised(donation: LiveDonation): Promise<void> {
    try {
      // Use the update-raised API endpoint for atomic updates
      const response = await fetch(`/api/campaigns/${donation.campaignId}/update-raised`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: donation.usdValue })
      });

      if (!response.ok) {
        console.error('[DonationWS] Failed to update campaign raised amount:', await response.text());
      } else {
        console.log('[DonationWS] Campaign raised amount updated successfully');
      }

      // Also record the donation details
      await fetch(`/api/campaigns/${donation.campaignId}/donations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: donation.usdValue,
          chain: donation.originChain,
          donorName: donation.donorName,
          tokenSymbol: donation.tokenSymbol,
          txId: donation.txHash,
          timestamp: donation.timestamp
        })
      });
    } catch (error) {
      console.error('[DonationWS] Error updating MongoDB:', error);
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
      console.error('[DonationWS] Max reconnect attempts reached');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;
    
    console.log(`[DonationWS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
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
    
    if (this.wsProvider) {
      this.wsProvider.removeAllListeners();
      this.wsProvider.destroy();
      this.wsProvider = null;
    }
    
    if (this.httpProvider) {
      this.httpProvider.removeAllListeners();
      this.httpProvider = null;
    }
    
    this.listeners.clear();
    console.log('[DonationWS] Disconnected');
  }
}

// Singleton instance
let instance: DonationWebSocketService | null = null;

export function getDonationWebSocketService(): DonationWebSocketService {
  if (!instance) {
    instance = new DonationWebSocketService();
  }
  return instance;
}
