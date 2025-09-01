'use client';

import { ethers, BrowserProvider, Contract, parseEther, parseUnits } from 'ethers';

// Chain configuration
export const CHAINS = {
  SEPOLIA: {
    chainId: '0xaa36a7',
    chainName: 'Ethereum Sepolia',
    nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia.drpc.org'],
    blockExplorerUrls: ['https://sepolia.etherscan.io/'],
  },
  ZETA_ATHENS: {
    chainId: '0x1b59', // 7001
    chainName: 'ZetaChain Athens Testnet',
    nativeCurrency: { name: 'ZETA', symbol: 'ZETA', decimals: 18 },
    rpcUrls: [process.env.NEXT_PUBLIC_ZETA_RPC_URL || 'https://zetachain-testnet.g.alchemy.com/v2/w7aPAiyoYb5dp_tCmL1ZAU5kAlEnZDXw'],
    blockExplorerUrls: ['https://athens.explorer.zetachain.com/'],
  }
} as const;

// Gateway ABI - exactly as specified in ZetaChain docs
const GATEWAY_ABI = [
  // For native payments (ETH, etc.)
  'function depositAndCall(address receiver, bytes message, (address,bool,address,bytes,uint256) revertOptions) payable returns (bytes32)',
  // For ERC-20 payments
  'function depositAndCall(address receiver, uint256 amount, address asset, bytes message, (address,bool,address,bytes,uint256) revertOptions) returns (bytes32)',
] as const;

const ERC20_ABI = [
  'function approve(address spender, uint256 value) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
] as const;

// ZetaChain contract ABI for direct donations
const CROWDFUND_ABI = [
  'function donateNative(uint256 campaignId, string calldata donorName, string calldata note) payable',
  'function donateZRC20(address token, uint256 amount, uint256 campaignId, string calldata donorName, string calldata note)',
] as const;

export type RevertOptions = [string, boolean, string, string, bigint];

export interface PaymentParams {
  campaignId: number;
  donorName: string;
  note: string;
  amount: string;
  onStatusUpdate?: (status: string) => void;
}

export interface CrossChainPaymentParams extends PaymentParams {
  sourceChain: 'sepolia';
  tokenAddress?: string; // For ERC-20, omit for native
}

export interface DirectZetaPaymentParams extends PaymentParams {
  tokenAddress?: string; // For ZRC-20, omit for native ZETA
}

/**
 * Build revert options tuple for gateway calls
 */
function buildRevertOptions(senderAddress: string): RevertOptions {
  return [
    senderAddress, // revertAddress
    true,          // callOnRevert
    senderAddress, // onRevertGasPayer
    '0x',          // revertMessage
    300000n        // onRevertGasLimit
  ];
}

/**
 * Encode message for Universal Contract onCall
 * Message format: abi.encode(uint256 campaignId, string donorName, string note)
 */
function buildInnerDonateNative(campaignId: number, donorName: string, note: string): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256','string','string'],
    [campaignId, donorName, note]
  );
}


/** Outer wrapper expected by onCall: (string action, bytes inner) */
function encodeGatewayMessage(action: 'donate_native' | 'donate_token', inner: string): string {
  return ethers.AbiCoder.defaultAbiCoder().encode(['string','bytes'], [action, inner]);
}

/**
 * Switch wallet to specified chain
 */
async function switchToChain(chainConfig: typeof CHAINS.SEPOLIA | typeof CHAINS.ZETA_ATHENS): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Wallet not available');
  }

  const ethereum = (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
  if (!ethereum) {
    throw new Error('No wallet found');
  }

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chainConfig.chainId }],
    });
  } catch (error: unknown) {
    const err = error as { code?: number };
    // Chain not added to wallet
    if (err.code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [chainConfig],
      });
    } else {
      throw error;
    }
  }
}

/**
 * Get connected wallet provider and signer
 */
async function getWalletProvider(): Promise<{ provider: BrowserProvider; signer: ethers.Signer; address: string }> {
  if (typeof window === 'undefined') {
    throw new Error('Wallet not available');
  }

  const ethereum = (window as unknown as { ethereum?: ethers.Eip1193Provider }).ethereum;
  if (!ethereum) {
    throw new Error('No wallet found');
  }

  const provider = new BrowserProvider(ethereum);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  return { provider, signer, address };
}

/**
 * Cross-chain payment: Source chain (Sepolia) → ZetaChain
 */
export async function payFromSourceChain(params: CrossChainPaymentParams): Promise<string> {
  const { campaignId, donorName, note, amount, sourceChain, tokenAddress, onStatusUpdate } = params;
  
  onStatusUpdate?.(`Switching to ${sourceChain === 'sepolia' ? 'Ethereum Sepolia' : sourceChain}...`);

  // Always use Sepolia gateway for cross-chain
  const gatewayAddress = process.env.NEXT_PUBLIC_GATEWAY_SEPOLIA || '';
  const receiverAddress = process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT || '';
  
  // Switch to source chain
  if (sourceChain === 'sepolia') {
    await switchToChain(CHAINS.SEPOLIA);
  } else {
    throw new Error(`Unsupported source chain: ${sourceChain}`);
  }

  const { signer, address } = await getWalletProvider();
  
  // Create gateway contract instance
  const gateway = new Contract(gatewayAddress, GATEWAY_ABI, signer);
  
  // Encode message for Universal Contract
  const revertOptions = buildRevertOptions(address);

  // Check for native token: undefined, special address, or ETH symbol
  const isNativeToken = !tokenAddress || 
    tokenAddress === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' || 
    tokenAddress.toLowerCase() === 'eth';
  if (isNativeToken) {
    onStatusUpdate?.('Confirming native ETH payment...');
    const value = parseEther(amount);
    const inner = buildInnerDonateNative(campaignId, donorName, note);
    const message = encodeGatewayMessage('donate_native', inner);
    
    const tx = await gateway[
      'depositAndCall(address,bytes,(address,bool,address,bytes,uint256))'
    ](
      receiverAddress,
      message,
      revertOptions,
      { value }
    );
    await tx.wait();
    return tx.hash;
  } else {
    // ERC-20 payment
    onStatusUpdate?.('Preparing ERC-20 payment...');
    
    try {
      console.log('Creating token contract with address:', tokenAddress);
      const token = new Contract(tokenAddress, ERC20_ABI, signer);
      
      console.log('Calling decimals() on token contract...');
      const decimals = await token.decimals();
      console.log('Token decimals:', decimals);
      
      const tokenAmount = parseUnits(amount, decimals);
      
      // Check and approve if needed
      const allowance = await token.allowance(address, gatewayAddress);
      if (allowance < tokenAmount) {
        onStatusUpdate?.('Approving token spending...');
        const approveTx = await token.approve(gatewayAddress, tokenAmount);
        await approveTx.wait();
      }
      
      onStatusUpdate?.('Confirming ERC-20 payment...');
      // Build message payload for token donation
      const inner = buildInnerDonateNative(campaignId, donorName, note);
      const message = encodeGatewayMessage('donate_token', inner);
      const tx = await gateway.depositAndCall(
        receiverAddress,
        tokenAmount,
        tokenAddress,
        message,
        revertOptions
      );
      
      onStatusUpdate?.('Transaction submitted, waiting for confirmation...');
      await tx.wait();
      
      return tx.hash;
    } catch (error) {
      console.error('Error in ERC-20 payment:', error);
      throw error;
    }
  }
}

/**
 * Direct payment on ZetaChain
 */
export async function payDirectlyOnZeta(params: DirectZetaPaymentParams): Promise<string> {
  const { campaignId, donorName, note, amount, tokenAddress, onStatusUpdate } = params;

  const contractAddress = process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT;
  if (!contractAddress) {
    throw new Error('Missing contract address');
  }

  onStatusUpdate?.('Switching to ZetaChain...');
  await switchToChain(CHAINS.ZETA_ATHENS);

  const { signer } = await getWalletProvider();
  
  // Create contract instance
  const contract = new Contract(contractAddress, CROWDFUND_ABI, signer);

  const isNativeToken = !tokenAddress || tokenAddress === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
  if (isNativeToken) {
    // Native ZETA payment
    onStatusUpdate?.('Confirming native ZETA payment...');
    const value = parseEther(amount);
    
    const tx = await contract.donateNative(campaignId, donorName, note, { value });
    
    onStatusUpdate?.('Transaction submitted, waiting for confirmation...');
    await tx.wait();
    
    return tx.hash;
  } else {
    // ZRC-20 payment
    onStatusUpdate?.('Preparing ZRC-20 payment...');
    
    try {
      console.log('Creating token contract with address:', tokenAddress);
      const token = new Contract(tokenAddress, ERC20_ABI, signer);
      
      console.log('Calling decimals() on token contract...');
      const decimals = await token.decimals();
      console.log('Token decimals:', decimals);
      
      const tokenAmount = parseUnits(amount, decimals);
      
      // Approve contract to spend tokens
      onStatusUpdate?.('Approving token spending...');
      const approveTx = await token.approve(contractAddress, tokenAmount);
      await approveTx.wait();
      
      onStatusUpdate?.('Confirming ZRC-20 payment...');
      const tx = await contract.donateZRC20(tokenAddress, tokenAmount, campaignId, donorName, note);
      
      onStatusUpdate?.('Transaction submitted, waiting for confirmation...');
      await tx.wait();
      
      return tx.hash;
    } catch (error) {
      console.error('Error in ZRC-20 payment:', error);
      throw error;
    }
  }
}

/**
 * Smart payment router - determines best payment method
 */
export async function makePayment(params: {
  campaignId: number;
  donorName: string;
  note: string;
  amount: string;
  preferredChain: 'sepolia' | 'zeta';
  tokenAddress?: string;
  onStatusUpdate?: (status: string) => void;
}): Promise<string> {
  
  if (params.preferredChain === 'sepolia') {
    return payFromSourceChain({
      ...params,
      sourceChain: 'sepolia',
    });
  } else {
    return payDirectlyOnZeta(params);
  }
}
