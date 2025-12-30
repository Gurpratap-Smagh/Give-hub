/**
 * Network Switcher Utility
 * Handles MetaMask network switching with proper error handling
 */

import { ethers } from 'ethers';

export interface NetworkConfig {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  nativeToken: string;
  nativeDecimals: number;
  explorerUrl?: string;
}

export const NETWORKS: Record<string, NetworkConfig> = {
  zetachain: {
    chainId: 7001,
    chainName: 'ZetaChain Athens',
    rpcUrl: process.env.NEXT_PUBLIC_ZETA_RPC_URL || 'https://rpc.athens.zetachain.com',
    nativeToken: 'ZETA',
    nativeDecimals: 18,
    explorerUrl: 'https://athens.explorer.zetachain.com'
  },
  sepolia: {
    chainId: 11155111,
    chainName: 'Ethereum Sepolia',
    rpcUrl: 'https://sepolia.infura.io/v3/YOUR_PROJECT_ID',
    nativeToken: 'ETH',
    nativeDecimals: 18,
    explorerUrl: 'https://sepolia.etherscan.io'
  },
  bitcoin: {
    chainId: 18332,
    chainName: 'Bitcoin Testnet',
    rpcUrl: 'https://testnet.blockchair.com/bitcoin',
    nativeToken: 'BTC',
    nativeDecimals: 8,
    explorerUrl: 'https://testnet.blockchair.com/bitcoin'
  },
  solana: {
    chainId: 901,
    chainName: 'Solana Devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    nativeToken: 'SOL',
    nativeDecimals: 9
  }
};

export async function switchNetwork(chainIdOrKey: number | string): Promise<void> {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed');
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const network = typeof chainIdOrKey === 'string' 
    ? NETWORKS[chainIdOrKey.toLowerCase()] 
    : Object.values(NETWORKS).find(n => n.chainId === chainIdOrKey);

  if (!network) {
    throw new Error(`Unknown network: ${chainIdOrKey}`);
  }

  const hexChainId = `0x${network.chainId.toString(16)}`;

  try {
    // Try to switch to the network
    await provider.send('wallet_switchEthereumChain', [{ chainId: hexChainId }]);
  } catch (error: any) {
    // Error code 4902 means the network doesn't exist in the wallet
    if (error.code === 4902) {
      await addNetwork(network);
    } else {
      throw error;
    }
  }
}

export async function addNetwork(network: NetworkConfig): Promise<void> {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed');
  }

  const provider = new ethers.BrowserProvider(window.ethereum);

  const params = {
    chainId: `0x${network.chainId.toString(16)}`,
    chainName: network.chainName,
    rpcUrls: [network.rpcUrl],
    nativeCurrency: {
      name: network.nativeToken,
      symbol: network.nativeToken,
      decimals: network.nativeDecimals
    },
    ...(network.explorerUrl && { blockExplorerUrls: [network.explorerUrl] })
  };

  await provider.send('wallet_addEthereumChain', [params]);
}

export async function getCurrentChainId(): Promise<number> {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed');
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();
  return Number(network.chainId);
}

export function getNetworkName(chainId: number): string {
  const network = Object.values(NETWORKS).find(n => n.chainId === chainId);
  return network?.chainName || `Chain ${chainId}`;
}

export function getNetworkByChainId(chainId: number): NetworkConfig | undefined {
  return Object.values(NETWORKS).find(n => n.chainId === chainId);
}
