// lib/services/donationEventListener.js
// Backend Node.js service to listen for ContributionReceived events and update MongoDB

const { ethers } = require('ethers');
const { MongoClient } = require('mongodb');

// Contract ABI for ContributionReceived event
const CONTRIBUTION_ABI = [
  'event ContributionReceived(uint256 indexed campaignId, address indexed donor, uint256 indexed contributionId, address originalToken, uint256 originalAmount, uint256 convertedAmount, string originChain, string donorName, string note)'
];

// Event topic hash for ContributionReceived
const CONTRIBUTION_RECEIVED_TOPIC = '0x92172ddc68276b600f2040b170301801a80f74b036dcd97aa9c3293d4463b971';

// Price table for USD conversion (sync with frontend converter.ts)
const TO_USD = {
  ETH: 5000,
  zETH: 5000,
  USDC: 1,
  ZETA: 10,
  WZETA: 10,
  sBTC: 60000,
};

// Token metadata for symbol lookup
const TOKEN_METADATA = {
  '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee': { symbol: 'ZETA', decimals: 18 },
  '0x05ba149a7bd6dc1f937fa9046a9e05c05f3b18b0': { symbol: 'ETH', decimals: 18 },
  '0xcc683a782f4b30c138787cb5576a86af66fdc31d': { symbol: 'USDC', decimals: 6 },
  '0x5f0b1a82749cb4e2278ec87f8bf6b618dc71a8bf': { symbol: 'WZETA', decimals: 18 },
};

function getTokenMeta(address) {
  const lowerAddr = address.toLowerCase();
  return TOKEN_METADATA[lowerAddr] || { symbol: 'TOKEN', decimals: 18 };
}

function toUSD(amount, symbol) {
  const a = typeof amount === 'string' ? parseFloat(amount) : amount;
  const px = TO_USD[symbol] || 0;
  return a * px;
}

class DonationEventListener {
  constructor() {
    this.provider = null;
    this.mongoClient = null;
    this.db = null;
    this.contractInterface = new ethers.Interface(CONTRIBUTION_ABI);
    this.isRunning = false;
    this.seenEvents = new Set();
    
    // Environment variables
    this.rpcUrl = process.env.NEXT_PUBLIC_ZETA_RPC_URL || process.env.NEXT_PUBLIC_ZETA_RPC_HTTP;
    this.wsUrl = process.env.NEXT_PUBLIC_ZETA_RPC_WS;
    this.contractAddress = process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT;
    this.mongoUri = process.env.MONGODB_URI;
    this.mongoDb = process.env.MONGODB_DB || 'Give-hub';
    
    console.log('[DonationListener] Initialized with config:', {
      rpcUrl: this.rpcUrl ? 'configured' : 'missing',
      wsUrl: this.wsUrl ? 'configured' : 'missing',
      contractAddress: this.contractAddress || 'missing',
      mongoUri: this.mongoUri ? 'configured' : 'missing',
      mongoDb: this.mongoDb
    });
  }

  async start() {
    if (this.isRunning) {
      console.log('[DonationListener] Already running');
      return;
    }

    console.log('[DonationListener] Starting service...');
    
    try {
      // Connect to MongoDB
      await this.connectMongo();
      
      // Setup blockchain connection
      await this.setupProvider();
      
      // Start listening
      await this.startListening();
      
      this.isRunning = true;
      console.log('[DonationListener] Service started successfully');
      
    } catch (error) {
      console.error('[DonationListener] Failed to start:', error);
      await this.stop();
      throw error;
    }
  }

  async stop() {
    console.log('[DonationListener] Stopping service...');
    
    this.isRunning = false;
    
    if (this.provider) {
      try {
        this.provider.removeAllListeners();
        if ('destroy' in this.provider && typeof this.provider.destroy === 'function') {
          this.provider.destroy();
        }
      } catch (err) {
        console.warn('[DonationListener] Error cleaning up provider:', err);
      }
      this.provider = null;
    }
    
    if (this.mongoClient) {
      try {
        await this.mongoClient.close();
      } catch (err) {
        console.warn('[DonationListener] Error closing MongoDB:', err);
      }
      this.mongoClient = null;
      this.db = null;
    }
    
    console.log('[DonationListener] Service stopped');
  }

  async connectMongo() {
    if (!this.mongoUri) {
      throw new Error('MongoDB URI not configured');
    }

    console.log('[DonationListener] Connecting to MongoDB...');
    this.mongoClient = new MongoClient(this.mongoUri);
    await this.mongoClient.connect();
    this.db = this.mongoClient.db(this.mongoDb);
    console.log('[DonationListener] MongoDB connected');
  }

  async setupProvider() {
    if (!this.contractAddress) {
      throw new Error('Contract address not configured');
    }

    // Try WebSocket first, fallback to HTTP
    if (this.wsUrl) {
      try {
        console.log('[DonationListener] Attempting WebSocket connection...');
        this.provider = new ethers.WebSocketProvider(this.wsUrl);
        await this.provider.getBlockNumber(); // Test connection
        console.log('[DonationListener] WebSocket connected');
        return;
      } catch (error) {
        console.warn('[DonationListener] WebSocket failed, falling back to HTTP:', error);
      }
    }

    if (this.rpcUrl) {
      console.log('[DonationListener] Using HTTP provider...');
      this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
      await this.provider.getBlockNumber(); // Test connection
      console.log('[DonationListener] HTTP provider connected');
    } else {
      throw new Error('No RPC URL configured');
    }
  }

  async startListening() {
    console.log('[DonationListener] Setting up event listeners...');
    
    const filter = {
      address: this.contractAddress,
      topics: [CONTRIBUTION_RECEIVED_TOPIC]
    };

    // Listen for new events
    this.provider.on(filter, (log) => {
      this.handleEvent(log).catch(error => {
        console.error('[DonationListener] Error handling event:', error);
      });
    });

    // Also do initial backfill of recent events
    await this.backfillRecentEvents();
    
    console.log('[DonationListener] Event listeners active');
  }

  async backfillRecentEvents() {
    try {
      console.log('[DonationListener] Backfilling recent events...');
      
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 1000); // Last 1000 blocks
      
      const logs = await this.provider.getLogs({
        address: this.contractAddress,
        topics: [CONTRIBUTION_RECEIVED_TOPIC],
        fromBlock,
        toBlock: currentBlock
      });

      console.log(`[DonationListener] Found ${logs.length} recent events`);

      for (const log of logs) {
        await this.handleEvent(log, true); // true = isBackfill
      }
      
      console.log('[DonationListener] Backfill complete');
    } catch (error) {
      console.error('[DonationListener] Backfill failed:', error);
    }
  }

  async handleEvent(log, isBackfill = false) {
    try {
      const eventId = `${log.transactionHash}-${log.index}`;
      
      // Skip if already processed
      if (this.seenEvents.has(eventId)) {
        return;
      }
      this.seenEvents.add(eventId);

      // Decode event
      const decoded = this.decodeEvent(log);
      if (!decoded) return;

      console.log(`[DonationListener] ${isBackfill ? 'Backfill' : 'New'} donation:`, {
        campaignId: decoded.campaignId,
        donor: decoded.donorName,
        amount: decoded.originalAmount,
        symbol: decoded.tokenSymbol,
        usdValue: decoded.usdValue
      });

      // Update MongoDB
      await this.updateCampaignRaised(decoded.campaignId, decoded.usdValue);
      
    } catch (error) {
      console.error('[DonationListener] Error processing event:', error);
    }
  }

  decodeEvent(log) {
    try {
      const parsed = this.contractInterface.parseLog({
        topics: log.topics,
        data: log.data
      });

      if (!parsed || parsed.name !== 'ContributionReceived') {
        return null;
      }

      const args = parsed.args;
      const campaignId = args[0].toString();
      const donor = args[1];
      const contributionId = args[2].toString();
      const originalToken = args[3].toLowerCase();
      const originalAmountBig = args[4];
      const convertedAmountBig = args[5];
      const originChain = args[6];
      const donorName = args[7];
      const note = args[8];

      // Get token metadata
      const tokenMeta = getTokenMeta(originalToken);
      const originalAmount = ethers.formatUnits(originalAmountBig, tokenMeta.decimals);
      const convertedAmount = ethers.formatUnits(convertedAmountBig, tokenMeta.decimals);
      
      // Calculate USD value
      const usdValue = toUSD(originalAmount, tokenMeta.symbol);

      return {
        campaignId,
        donor,
        contributionId,
        originalToken,
        originalAmount,
        convertedAmount,
        originChain,
        donorName,
        note,
        tokenSymbol: tokenMeta.symbol,
        usdValue,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber
      };
    } catch (error) {
      console.error('[DonationListener] Error decoding event:', error);
      return null;
    }
  }

  async updateCampaignRaised(campaignId, usdValue) {
    if (!this.db) {
      console.error('[DonationListener] Database not connected');
      return;
    }

    try {
      console.log(`[DonationListener] Updating campaign ${campaignId} raised by $${usdValue}`);
      
      const result = await this.db.collection('campaigns').updateOne(
        { campaignId: campaignId },
        { 
          $inc: { raised: usdValue },
          $set: { lastUpdated: new Date() }
        }
      );

      if (result.matchedCount === 0) {
        console.warn(`[DonationListener] Campaign ${campaignId} not found in database`);
      } else {
        console.log(`[DonationListener] Campaign ${campaignId} updated successfully`);
      }
      
    } catch (error) {
      console.error('[DonationListener] Error updating campaign:', error);
    }
  }
}

// Export for use as module
module.exports = { DonationEventListener };

// CLI execution
if (require.main === module) {
  const listener = new DonationEventListener();
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[DonationListener] Received SIGINT, shutting down...');
    await listener.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('\n[DonationListener] Received SIGTERM, shutting down...');
    await listener.stop();
    process.exit(0);
  });
  
  // Start the service
  listener.start().catch(error => {
    console.error('[DonationListener] Fatal error:', error);
    process.exit(1);
  });
}
