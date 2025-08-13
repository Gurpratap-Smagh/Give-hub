/**
 * MOCK Smart Contract Service
 * 
 * This file simulates interactions with a smart contract on a blockchain.
 * In a real application, this would be replaced with a library like ethers.js or web3.js
 * to interact with a deployed smart contract on a network like Ethereum or Solana.
 */

import { Campaign, Donation } from './types';

// Mock function to simulate fetching campaign data from a smart contract
export async function getCampaignFromContract(campaignId: string): Promise<Partial<Campaign> | null> {
  console.log(`[Contract Mock] Fetching campaign ${campaignId} from the blockchain.`);

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1200));

  // In a real scenario, you would call a 'view' function on your smart contract.
  // For now, we'll return some mock data.
  const mockContractData = {
    totalRaised: 12500.50,
    contributorCount: 150,
    isActive: true,
  };

  console.log(`[Contract Mock] Fetched data for campaign ${campaignId}.`);
  return mockContractData;
}

// Mock function to simulate making a donation through a smart contract
export async function makeDonationOnContract(donation: Donation): Promise<{ transactionHash: string; blockNumber: number }> {
  console.log(`[Contract Mock] Processing donation of ${donation.amount} for campaign ${donation.campaignId}.`);

  // Simulate a transaction being sent to the blockchain
  await new Promise(resolve => setTimeout(resolve, 2500));

  // In a real scenario, this would involve sending a transaction and waiting for it to be mined.
  const mockTransactionReceipt = {
    transactionHash: `0x${[...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`,
    blockNumber: Math.floor(Math.random() * 1000000) + 15000000,
  };

  console.log(`[Contract Mock] Donation processed. TxHash: ${mockTransactionReceipt.transactionHash}`);
  return mockTransactionReceipt;
}

// Mock function to verify ownership of a campaign via a smart contract
export async function verifyCampaignOwnership(campaignId: string, userWalletAddress: string): Promise<boolean> {
  console.log(`[Contract Mock] Verifying ownership of campaign ${campaignId} for wallet ${userWalletAddress}.`);

  // Simulate a call to the contract to check the owner of a campaign token/record.
  await new Promise(resolve => setTimeout(resolve, 700));

  // For this mock, we'll just return true. In a real app, this would be a critical security check.
  const isOwner = true;

  console.log(`[Contract Mock] Ownership verified: ${isOwner}`);
  return isOwner;
}
