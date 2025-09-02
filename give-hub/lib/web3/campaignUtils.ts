"use client";

import { ethers } from "ethers";
import { getCampaignInfo, getContract, getReadOnlyProvider } from "./client";

// Event signature constants for verification
const CAMPAIGN_CREATED_EVENT_SIGNATURE = "CampaignCreated(uint256,address,address)";

const contractAddress =
  process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT ||
  process.env.NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS ||
  process.env.NEXT_PUBLIC_DONATION_CONTRACT ||
  '';

/**
 * Checks if a campaign exists on the blockchain by verifying CampaignCreated event
 * 
 * @param campaignId The campaign ID to check
 * @returns Promise<boolean> True if the campaign exists on-chain, false otherwise
 */
export async function isCampaignSynced(campaignId: string | number): Promise<boolean> {
  try {
    // Convert the campaignId to a bigint
    const id = BigInt(campaignId);
    
    // First check direct campaign struct data
    const campaignInfo = await getCampaignInfo(String(id));
    if (campaignInfo && campaignInfo.creator !== ethers.ZeroAddress) {
      return true;
    }
    
    // Double check by looking for events (more reliable)
    const events = await getCampaignCreatedEvents([String(campaignId)]);
    return events[String(campaignId)] || false;
  } catch (error) {
    console.error("Error checking if campaign is synced:", error);
    return false;
  }
}

/**
 * Get campaign created events for the given campaign IDs
 * 
 * @param campaignIds Array of campaign IDs to check
 * @returns Promise<Record<string, boolean>> Map of campaignId -> exists
 */
async function getCampaignCreatedEvents(
  campaignIds: string[]
): Promise<Record<string, boolean>> {
  try {
    const result: Record<string, boolean> = {};
    const provider = await getReadOnlyProvider();
    
    // Create filter for CampaignCreated events
    const topic0 = ethers.id(CAMPAIGN_CREATED_EVENT_SIGNATURE);
    
    // Find if any of these campaigns have been created
    const lookbackBlocks = 50000; // Look back up to ~1 week
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - lookbackBlocks);
    
    // For each campaignId, create a specific topic1 and query
    const promises = campaignIds.map(async (campaignId) => {
      try {
        const topic1 = ethers.zeroPadValue(ethers.toBeHex(BigInt(campaignId)), 32);
        const logs = await provider.getLogs({
          address: contractAddress,
          fromBlock,
          toBlock: latestBlock,
          topics: [topic0, topic1],
        });
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
  } catch (error) {
    console.error("Error getting campaign created events:", error);
    return {};
  }
}

/**
 * Bulk check which campaigns from a list are synced on-chain using both contract state and events
 * 
 * @param campaignIds Array of campaign IDs to check
 * @returns Promise<Record<string, boolean>> Map of campaignId -> synced status
 */
export async function batchCheckCampaignSyncStatus(
  campaignIds: (string | number)[]
): Promise<Record<string, boolean>> {
  try {
    if (!campaignIds.length) return {};
    
    // Convert all IDs to strings for consistency
    const strIds = campaignIds.map(id => String(id));
    
    // 1. First check via contract direct data
    const contract = await getContract(undefined, true);
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
      const eventResults = await getCampaignCreatedEvents(unverifiedIds);
      
      // Merge results - a campaign is verified if either contract check OR event check passed
      Object.keys(eventResults).forEach(id => {
        if (eventResults[id]) {
          contractCheckResults[id] = true;
        }
      });
    }
    
    console.log('Final campaign verification results:', contractCheckResults);
    return contractCheckResults;
  } catch (error) {
    console.error("Error batch checking campaign sync status:", error);
    // Return empty result if there's an error
    return {};
  }
}
