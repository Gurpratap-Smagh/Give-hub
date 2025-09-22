// Token Donation Test Script
// This file demonstrates how to test both ZETA and WZETA donation paths

import { ethers } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

// ABI definitions
const WZETA_ABI = [
  'function deposit() payable',
  'function balanceOf(address account) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function decimals() view returns (uint8)',
];

const CROWDFUND_ABI = [
  // Native payable path
  'function donate(uint256 campaignId, string donorName, string note) payable',
  // ZRC-20 path
  'function donateToCampaign(uint256 campaignId, address token, uint256 amount, string donorName, string note)',
  // View functions
  'function getCampaignBalance(uint256 campaignId) view returns (uint256)',
  'function WZETA() view returns (address)',
];

// Environment variables
const CAMPAIGN_ID = 1; // Replace with your campaign ID
const DONOR_NAME = 'Test Donor';
const NOTE = 'Test donation';
const RPC_URL = process.env.NEXT_PUBLIC_ZETA_RPC_URL || 'https://zetachain-athens-evm.blockpi.network/v1/rpc/public';
const PRIVATE_KEY = process.env.TEST_PRIVATE_KEY; // Your private key for testing
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT;
const WZETA_ADDRESS = process.env.NEXT_PUBLIC_WZETA_ADDRESS;

if (!PRIVATE_KEY) {
  console.error('Please set TEST_PRIVATE_KEY in your .env file');
  process.exit(1);
}

if (!CONTRACT_ADDRESS) {
  console.error('Please set NEXT_PUBLIC_CROSSCHAIN_CONTRACT in your .env file');
  process.exit(1);
}

if (!WZETA_ADDRESS) {
  console.error('Please set NEXT_PUBLIC_WZETA_ADDRESS in your .env file');
  process.exit(1);
}

async function main() {
  console.log('Starting token donation tests...');
  
  // Set up provider and wallet
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY!, provider);
  console.log(`Using wallet: ${wallet.address}`);
  
  // Get contract instances
  const crowdfund = new ethers.Contract(CONTRACT_ADDRESS!, CROWDFUND_ABI, wallet);
  const wzetaAddr = WZETA_ADDRESS! || await crowdfund.WZETA();
  const wzeta = new ethers.Contract(wzetaAddr, WZETA_ABI, wallet);
  
  // Get initial balances
  const campaignBalanceBefore = await crowdfund.getCampaignBalance(CAMPAIGN_ID);
  const donationAmount = ethers.parseEther('0.01'); // 0.01 ZETA/WZETA for testing
  
  console.log(`Initial campaign balance: ${ethers.formatEther(campaignBalanceBefore)} WZETA`);
  console.log(`Test donation amount: ${ethers.formatEther(donationAmount)} ZETA/WZETA`);
  
  // Test 1: Donate with native ZETA
  console.log('\n=== TEST 1: Donate with native ZETA ===');
  try {
    console.log('Step 1: Deposit ZETA to WZETA');
    const depositTx = await wzeta.deposit({ value: donationAmount });
    await depositTx.wait();
    console.log(`ZETA wrapped to WZETA successfully: ${depositTx.hash}`);
    
    console.log('Step 2: Approve WZETA for spending by contract');
    const approveTx = await wzeta.approve(CONTRACT_ADDRESS, donationAmount);
    await approveTx.wait();
    console.log(`WZETA approved successfully: ${approveTx.hash}`);
    
    console.log('Step 3: Donate using ZRC-20 path');
    const donateTx = await crowdfund.donateToCampaign(
      CAMPAIGN_ID,
      wzetaAddr,
      donationAmount,
      DONOR_NAME,
      NOTE
    );
    await donateTx.wait();
    console.log(`Donation with wrapped ZETA successful: ${donateTx.hash}`);
  } catch (error) {
    console.error('Error in native ZETA donation path:', error);
  }
  
  // Test 2: Donate with WZETA directly
  console.log('\n=== TEST 2: Donate with WZETA directly ===');
  try {
    console.log('Donating with WZETA using native payable method');
    const donateTx = await crowdfund.donate(
      CAMPAIGN_ID,
      DONOR_NAME,
      NOTE,
      { value: donationAmount }
    );
    await donateTx.wait();
    console.log(`Donation with WZETA successful: ${donateTx.hash}`);
  } catch (error) {
    console.error('Error in WZETA donation path:', error);
  }
  
  // Check final balance
  const campaignBalanceAfter = await crowdfund.getCampaignBalance(CAMPAIGN_ID);
  console.log(`\nFinal campaign balance: ${ethers.formatEther(campaignBalanceAfter)} WZETA`);
  console.log(`Change in balance: ${ethers.formatEther(campaignBalanceAfter - campaignBalanceBefore)} WZETA`);
}

// Execute the test
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
