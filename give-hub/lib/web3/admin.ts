/**
 * Admin functions for testing contract token management
 */

import { ethers } from "ethers";
import { getContract } from "./client";

// WZETA ABI for deposit functionality
const WZETA_ABI = [
  "function deposit() external payable",
  "function withdraw(uint256 amount) external",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
];

/**
 * Test function to add a new token to the contract's allowlist
 * @param tokenAddress - Address of the token to add
 * @param allowedIn - Whether the token can be used for donations
 * @param allowedOut - Whether the token can be used for payouts
 * @param label - Optional label for the token (e.g., "USDT.BSC")
 */
export async function testAddToken(
  tokenAddress: string, 
  allowedIn: boolean = true, 
  allowedOut: boolean = true,
  label?: string
): Promise<void> {
  try {
    const contract = await getContract();
    
    console.log(`Testing token addition for ${tokenAddress}`);
    
    // Add as allowed input token if requested
    if (allowedIn) {
      console.log("Setting as allowed input token...");
      const txIn = await contract.setAllowedInToken(tokenAddress, true);
      await txIn.wait();
      console.log("✅ Added as allowed input token");
    }
    
    // Add as allowed output token if requested
    if (allowedOut) {
      console.log("Setting as allowed output token...");
      const txOut = await contract.setAllowedOutToken(tokenAddress, true);
      await txOut.wait();
      console.log("✅ Added as allowed output token");
    }
    
    // Set label if provided
    if (label) {
      console.log("Setting token label...");
      const txLabel = await contract.setTokenLabel(tokenAddress, label);
      await txLabel.wait();
      console.log(`✅ Set token label to "${label}"`);
    }
    
    // Verify the token was added
    const isAllowedIn = await contract.allowedInTokens(tokenAddress);
    const isAllowedOut = await contract.allowedOutTokens(tokenAddress);
    const tokenLabel = await contract.tokenLabel(tokenAddress);
    
    console.log("Verification results:");
    console.log(`  - Allowed for donations: ${isAllowedIn}`);
    console.log(`  - Allowed for payouts: ${isAllowedOut}`);
    console.log(`  - Token label: "${tokenLabel}"`);
    
  } catch (error) {
    console.error("Failed to add token:", error);
    throw error;
  }
}

/**
 * Get WZETA contract instance for deposit/withdraw operations
 */
export async function getWZETAContract(signerOrProvider?: ethers.Signer | ethers.Provider): Promise<ethers.Contract> {
  const wzetaAddress = process.env.NEXT_PUBLIC_WZETA_ADDRESS;
  if (!wzetaAddress) {
    throw new Error("WZETA address not configured in environment");
  }
  
  if (!signerOrProvider) {
    const contract = await getContract();
    signerOrProvider = contract.runner as ethers.Signer;
  }
  
  return new ethers.Contract(wzetaAddress, WZETA_ABI, signerOrProvider);
}

/**
 * Deposit native ZETA to get WZETA tokens
 * @param amount - Amount of ZETA to deposit (in wei)
 */
export async function depositZETAToWZETA(amount: bigint): Promise<ethers.ContractTransactionResponse> {
  try {
    const wzetaContract = await getWZETAContract();
    console.log(`Depositing ${ethers.formatEther(amount)} ZETA to WZETA`);
    
    const tx = await wzetaContract.deposit({ value: amount });
    console.log("Deposit transaction sent:", tx.hash);
    
    await tx.wait();
    console.log("✅ ZETA deposited to WZETA successfully");
    
    return tx;
  } catch (error) {
    console.error("Failed to deposit ZETA to WZETA:", error);
    throw error;
  }
}

/**
 * Get WZETA balance for an address
 */
export async function getWZETABalance(address: string): Promise<bigint> {
  const wzetaContract = await getWZETAContract();
  return await wzetaContract.balanceOf(address);
}

/**
 * Approve WZETA spending for the crowdfund contract
 * @param amount - Amount to approve (in wei)
 */
export async function approveWZETASpending(amount: bigint): Promise<ethers.ContractTransactionResponse> {
  try {
    const wzetaContract = await getWZETAContract();
    const crowdfundContract = await getContract();
    
    console.log(`Approving ${ethers.formatEther(amount)} WZETA spending for crowdfund contract`);
    
    const tx = await wzetaContract.approve(await crowdfundContract.getAddress(), amount);
    console.log("Approval transaction sent:", tx.hash);
    
    await tx.wait();
    console.log("✅ WZETA spending approved successfully");
    
    return tx;
  } catch (error) {
    console.error("Failed to approve WZETA spending:", error);
    throw error;
  }
}

/**
 * Example function to test adding a hypothetical new token
 * This demonstrates how easy it is to add tokens to the system
 */
export async function testAddExampleToken(): Promise<void> {
  // Example: Adding a hypothetical USDT token on ZetaChain
  const exampleTokenAddress = "0x1234567890123456789012345678901234567890"; // Replace with actual token address
  
  await testAddToken(
    exampleTokenAddress,
    true,  // Allow as input (for donations)
    true,  // Allow as output (for payouts)
    "USDT.ZetaChain"  // Label for the token
  );
}
