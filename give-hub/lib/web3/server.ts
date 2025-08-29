/**
 * Server-side web3 utility functions
 * This file contains server-compatible blockchain interaction code
 * Designed for use in API routes and server components
 */

import { ethers } from "ethers";
import CrossChainCrowdfundABI from '@/abis/CrossChainCrowdfund.json';

/**
 * Helper to get deployment configuration for contract interaction
 * Uses the same env variables as the donation feature
 */
function getDeploymentConfig() {
  const address = (
    process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT ||
    process.env.NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS ||
    process.env.NEXT_PUBLIC_DONATION_CONTRACT ||
    ''
  );
  
  const chainId = (
    process.env.NEXT_PUBLIC_ZETA_CHAIN_ID ||
    '7001' // Default to ZetaChain Athens
  );
  
  const rpcUrl = (
    process.env.NEXT_PUBLIC_ZETA_RPC_URL ||
    process.env.NEXT_PUBLIC_RPC_URL ||
    'https://zetachain-athens-evm.blockpi.network/v1/rpc/public'
  );
  
  const chainName = process.env.NEXT_PUBLIC_ZETA_CHAIN_NAME || 'ZetaChain Athens';
  
  return {
    address,
    chainId: Number(chainId),
    rpcUrl,
    chainName
  };
}

/**
 * Fetch all synced campaign IDs from the contract using the view function
 * Iterates with pagination to collect all existing campaigns.
 * Returns a Set of string IDs for easy membership checks.
 */
export async function serverGetAllSyncedCampaignIds(limitPerPage: number = 100): Promise<Set<string>> {
  const contract = await getServerContract();
  const ids = new Set<string>();

  // Ensure sane limit
  const limit = Math.min(Math.max(1, limitPerPage), 100);

  let nextStart: bigint | number = 1n;
  while (true) {
    // getAllSyncedCampaigns(uint256 startId, uint256 limit) returns (CampaignInfo[] infos, uint256 nextStart)
    const result = await contract.getAllSyncedCampaigns(nextStart, limit);
    // Ethers v6 returns both tuple array and named properties; normalize via indexing
    const infos = result[0] as Array<{ campaignId: bigint }>;
    const next = result[1] as bigint;

    for (const info of infos) {
      // info.campaignId is BigInt-compatible
      const id = typeof info.campaignId === 'bigint' ? info.campaignId : BigInt(info.campaignId);
      ids.add(id.toString());
    }

    if (!next || next === 0n) break;
    nextStart = next;
  }

  return ids;
}

/**
 * Get ethers provider for blockchain interaction
 * Uses the same pattern as live donations
 */
export async function getServerProvider(): Promise<ethers.JsonRpcProvider> {
  const { rpcUrl } = getDeploymentConfig();
  
  // Initialize provider
  return new ethers.JsonRpcProvider(rpcUrl);
}

/**
 * Get contract deployment info from environment
 */
export async function getServerDeployment() {
  const config = getDeploymentConfig();
  // Return deployment config
  return config;
}

/**
 * Get contract instance for read-only operations
 * Uses the same pattern as getCampaignDonations in lib/web3/client.ts
 */
export async function getServerContract(): Promise<ethers.Contract> {
  const provider = await getServerProvider();
  const { address } = await getServerDeployment();
  
  if (!address) {
    throw new Error('Contract address not configured in environment variables');
  }
  
  return new ethers.Contract(address, CrossChainCrowdfundABI, provider);
}

// Event signature for verification
const CAMPAIGN_CREATED_EVENT_SIGNATURE = "CampaignCreated(uint256,address,address)";

/**
 * Server-compatible function to check campaigns existence on-chain
 * This is the server-side equivalent of batchCheckCampaignSyncStatus
 */
export async function serverCheckCampaignSyncStatus(
  campaignIds: (string | number)[]
): Promise<Record<string, boolean>> {
  try {
    if (!campaignIds.length) return {};
    
    // Convert all IDs to strings for consistency
    const strIds = campaignIds.map(id => String(id));
    
    // 1. First check via contract direct data
    const contract = await getServerContract();
    const contractCheckResults: Record<string, boolean> = {};
    
    // Process in batches to avoid overloading the RPC
    const batchSize = 10;
    for (let i = 0; i < strIds.length; i += batchSize) {
      const batch = strIds.slice(i, i + batchSize);
      const promises = batch.map(async (id) => {
        try {
          const bigintId = BigInt(id);
          const campaign = await contract.campaigns(bigintId);
          return { id, synced: campaign.creator !== ethers.ZeroAddress };
        } catch {
          return { id, synced: false };
        }
      });
      
      const results = await Promise.all(promises);
      results.forEach(({ id, synced }) => {
        contractCheckResults[id] = synced;
      });
    }
    
    // 2. For any campaigns not found in direct contract data, check events
    const unverifiedIds = strIds.filter(id => !contractCheckResults[id]);
    if (unverifiedIds.length > 0) {
      const eventResults = await getServerCampaignCreatedEvents(unverifiedIds);
      
      // Merge results - a campaign is verified if either contract check OR event check passed
      Object.keys(eventResults).forEach(id => {
        if (eventResults[id]) {
          contractCheckResults[id] = true;
        }
      });
    }
    
    // Return final verification results
    return contractCheckResults;
  } catch {
    // Error during verification, return empty map
    // Return empty result if there's an error
    return {};
  }
}

/**
 * Server-side function to check for campaign creation events
 */
async function getServerCampaignCreatedEvents(
  campaignIds: string[]
): Promise<Record<string, boolean>> {
  try {
    const result: Record<string, boolean> = {};
    const provider = await getServerProvider();
    
    // Create filter for CampaignCreated events
    const topic0 = ethers.id(CAMPAIGN_CREATED_EVENT_SIGNATURE);
    
    // Find if any of these campaigns have been created
    // Using the same chunking approach as useDonationEvents hook for RPC stability
    const lookbackBlocks = 50000; // Look back up to ~1 week
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - lookbackBlocks);
    const { address } = await getServerDeployment();
    
    // For each campaignId, create a specific topic1 and query
    const promises = campaignIds.map(async (campaignId) => {
      try {
        // Format the campaignId as a topic (32-byte hex)
        const topic1 = ethers.zeroPadValue(ethers.toBeHex(BigInt(campaignId)), 32);
        
        // Query in chunks to avoid RPC timeouts (similar to useDonationEvents)
        const CHUNK_SIZE = 300;
        let logs: ethers.Log[] = [];
        
        for (let chunk = fromBlock; chunk <= latestBlock; chunk += CHUNK_SIZE) {
          const chunkEnd = Math.min(chunk + CHUNK_SIZE - 1, latestBlock);
          const chunkLogs = await provider.getLogs({
            address,
            fromBlock: chunk,
            toBlock: chunkEnd,
            topics: [topic0, topic1],
          });
          logs = [...logs, ...chunkLogs];
        }

        return { id: campaignId, exists: logs.length > 0 };
      } catch {
        return { id: campaignId, exists: false };
      }
    });
    
    const results = await Promise.all(promises);
    results.forEach(({ id, exists }) => {
      result[id] = exists;
    });
    
    return result;
  } catch {
    // Error looking up events, return empty map
    return {};
  }
}
