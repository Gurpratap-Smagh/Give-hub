// lib/web3/connect.ts
import { ethers } from 'ethers';

// Guard against multiple simultaneous wallet connection requests
let connecting = false;

/**
 * Safely connects to the user's wallet with protection against double requests
 * Prevents -32002 "Already processing eth_requestAccounts" errors
 * 
 * @returns Provider and signer if connection successful
 */
export async function connectWallet() {
  if (connecting) {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔌 Wallet connection already in progress, skipping duplicate request');
    }
    return null;
  }
  
  connecting = true;
  try {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      throw new Error("No wallet detected. Please install MetaMask or another Web3 wallet.");
    }
    
    // Request account access
    await ethereum.request({ method: "eth_requestAccounts" });
    
    // Create provider and signer
    const provider = new ethers.BrowserProvider(ethereum);
    const signer = await provider.getSigner();
    
    return { provider, signer };
  } catch (error: any) {
    if (error.code === -32002 && process.env.NODE_ENV === 'development') {
      console.warn('Wallet connection already in progress in another context');
    }
    throw error;
  } finally {
    connecting = false;
  }
}

/**
 * Returns connection status for UI components
 */
export function isConnecting() {
  return connecting;
}

/**
 * Ensures the wallet is connected to the specified chain
 * 
 * @param chainId Target chain ID
 * @returns True if successful
 */
export async function ensureWalletOnChain(chainId: number): Promise<boolean> {
  if (connecting) {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔌 Wallet connection already in progress, skipping chain switch');
    }
    return false;
  }
  
  connecting = true;
  try {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      throw new Error("No wallet detected");
    }
    
    // Check current chain
    const currentChainIdHex = await ethereum.request({ method: 'eth_chainId' });
    const currentChainId = parseInt(currentChainIdHex, 16);
    
    if (currentChainId === chainId) {
      return true;
    }
    
    // Switch to target chain
    try {
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });
      return true;
    } catch (switchError: any) {
      // Chain doesn't exist, add it
      if (switchError.code === 4902) {
        // This would be where you'd add the chain if needed
        // For now, just throw the error
        throw new Error(`Chain ${chainId} not available in wallet`);
      }
      throw switchError;
    }
  } finally {
    connecting = false;
  }
}
