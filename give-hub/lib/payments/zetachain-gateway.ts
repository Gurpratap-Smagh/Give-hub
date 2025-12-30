'use client';

import { ethers, BrowserProvider, Contract, parseEther, parseUnits } from 'ethers';
import type { WindowWithEthereum } from '../../types/ethereum';
// Import the ABI from the JSON file
import artifact from '../../abis/CrossChainCrowdfund.json';

// Type for the ABI from CrossChainCrowdfund.json
type ContractABI = Array<{
  type: string;
  name?: string;
  inputs?: Array<{ name: string; type: string; internalType: string }>;
  outputs?: Array<{ name: string; type: string; internalType: string }>;
  stateMutability?: string;
  anonymous?: boolean;
}>;

// Extract the ABI from the artifact
const abi = (artifact as { abi: ContractABI }).abi;

// Chain configuration
export const CHAINS = {
  SEPOLIA: {
    chainId: '0xaa36a7',
    chainName: 'Ethereum Sepolia',
    nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia.drpc.org'],
    blockExplorerUrls: ['https://sepolia.etherscan.io/'],
  },
  BSC_TESTNET: {
    chainId: '0x61', // 97
    chainName: 'BSC Testnet',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: ['https://data-seed-prebsc-1-1.binance.org:8545'],
    blockExplorerUrls: ['https://testnet.bscscan.com/'],
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
  'function contribute(uint256 campaignId, string calldata donorName, string calldata note) payable',
  'function contributeZRC20(address token, uint256 amount, uint256 campaignId, string calldata donorName, string calldata note)',
] as const;

export type RevertOptions = [string, boolean, string, string, bigint];

export interface PaymentParams {
  campaignId: number;
  donorName: string;
  note: string;
  amount: string;
  sourceChainId: number;
  tokenAddress?: string;
  preferredChain: string;
  onStatusUpdate?: (status: string) => void;
}

export interface CrossChainPaymentParams extends PaymentParams {
  sourceChain: 'sepolia';
  tokenAddress?: string; // For ERC-20, omit for native
}

export interface DirectZetaPaymentParams extends PaymentParams {
  tokenAddress?: string; // For ZRC-20, omit for native ZETA
  prefferedChain?: string;
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
function encodeGatewayMessage(action: 'contribute' | 'contribute_zrc20', inner: string): string {
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
    const message = encodeGatewayMessage('contribute', inner);
    
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
      const message = encodeGatewayMessage('contribute_zrc20', inner);
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
    const tx = await contract.donate(ethers.ZeroAddress, 0n, campaignId, donorName, note, { value });
    
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
      const tx = await contract.donate(tokenAddress, tokenAmount, campaignId, donorName, note);
      
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
type MakePaymentArgs = {
  campaignId: number;
  donorName: string;
  note: string;
  amount: string;                // decimal string
  sourceChainId: number;
  tokenAddress?: string;         // undefined => native token
  mode: 'zeta_native' | 'zeta_zrc20' | 'crosschain_sepolia';
  onStatusUpdate?: (s: string) => void;
  preferredChain?: string;
};

export async function makePayment(args: MakePaymentArgs): Promise<string> {
  const { campaignId, donorName, note, amount, sourceChainId, tokenAddress, mode, onStatusUpdate } = args;
  const say = (s: string) => onStatusUpdate?.(s);

  const CONTRACT = process.env.NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS!;
  if (!CONTRACT) throw new Error("Contract address missing (NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS)");

  const provider = new ethers.BrowserProvider((window as WindowWithEthereum).ethereum);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== sourceChainId) {
    await (window as WindowWithEthereum).ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: ethers.toBeHex(sourceChainId) }],
    });
  }
  const signer = await provider.getSigner();

  // Helpers
  async function parseAmount(addr?: string) {
    if (!addr) return ethers.parseUnits(amount, 18);
    // Normalize to EIP-55 to avoid "bad address checksum"
    const checksummed = ethers.getAddress(addr.toLowerCase());
    const erc20 = new ethers.Contract(checksummed, ERC20_ABI, signer);
    const dec: number = await erc20.decimals();
    return ethers.parseUnits(amount, dec);
  }


  // ZetaChain direct: native ZETA or any ZRC20 on ZetaChain
  if (mode === "zeta_native") {
    // Native ZETA on ZetaChain: call contract directly
    say("Preparing native ZETA donation on ZetaChain…");
    const contract = new ethers.Contract(CONTRACT, abi, signer);
    const value = await parseAmount(); // 18 decimals
    const tx = await contract.donateNative(campaignId, donorName, note, { value });
    say("Confirming on ZetaChain…");
    const r = await tx.wait();
    return r?.hash ?? tx.hash;
  } else if (mode === "zeta_zrc20") {
    // ZRC20 token on ZetaChain: approve + call contract directly
    if (!tokenAddress) throw new Error("Token address required for ZRC-20 donation");
    say("Approving ZRC-20 allowance on ZetaChain…");
    const tokenAddr = ethers.getAddress(tokenAddress.toLowerCase());
    const erc20 = new ethers.Contract(tokenAddr, ERC20_ABI, signer);

    const amt = await parseAmount(tokenAddress);
    const approveTx = await erc20.approve(CONTRACT, amt);
    await approveTx.wait();

    say("Sending ZRC-20 donation on ZetaChain…");
    const contract = new ethers.Contract(CONTRACT, abi, signer);
    const addr = ethers.getAddress(tokenAddress.toLowerCase());
    const tx = await contract.donate(addr, amt, campaignId, donorName, note);
    const r = await tx.wait();
    return r?.hash ?? tx.hash;
  }


  // All other chains/tokens: use Gateway contract (e.g., Sepolia, non-ZetaChain)
  if (mode === 'crosschain_sepolia') {
    // Only require GATEWAY env for non-ZetaChain payments
    // crosschain_sepolia: use Gateway on Sepolia and double-encode payload
    // Outer: (string action, bytes data)
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const GATEWAY = process.env.NEXT_PUBLIC_ZETA_GATEWAY_SEPOLIA;
    if (!GATEWAY) throw new Error("Gateway address missing (NEXT_PUBLIC_ZETA_GATEWAY_SEPOLIA)");
    const gateway = new ethers.Contract(GATEWAY, GATEWAY_ABI, signer);

    if (!tokenAddress) {
      // ETH native over Sepolia → action=donate_native, data=(campaignId, donorName, note)
      say("Building cross-chain payload for native ETH (Sepolia → ZetaChain)…");
      const inner = coder.encode(["uint256","string","string"], [campaignId, donorName, note]);
      const payload = coder.encode(["string","bytes"], ["contribute", inner]);
      const value = await parseAmount(); // 18 ETH

      say("Calling Gateway.depositAndCall (native)…");
      const tx = await gateway.depositAndCall(
        CONTRACT,
        payload,
        { revertAddress: ethers.ZeroAddress, callOnRevert: false, abortAddress: ethers.ZeroAddress, revertMessage: "0x", onRevertGasLimit: 0 },
        { value }
      );
      const r = await tx.wait();
      return r?.hash ?? tx.hash;
    } else {
      // ERC-20 (e.g., USDC on Sepolia) → action=donate_token, data=(token,address amount, campaignId, donorName, note)
      say("Approving Gateway to pull ERC-20 on Sepolia…");
      const amt = await parseAmount(tokenAddress);
      const erc20 = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      const a = await erc20.approve(GATEWAY, amt);
      await a.wait();

      say("Building cross-chain payload for ERC-20 (Sepolia → ZetaChain)…");
      const inner = coder.encode(["address","uint256","uint256","string","string"], [tokenAddress, amt, campaignId, donorName, note]);
      const payload = coder.encode(["string","bytes"], ["contribute_zrc20", inner]);

      say("Calling Gateway.depositAndCall (ERC-20)…");
      const tx = await gateway.depositAndCall(
        CONTRACT,
        tokenAddress,
        amt,
        payload,
        { revertAddress: ethers.ZeroAddress, callOnRevert: false, abortAddress: ethers.ZeroAddress, revertMessage: "0x", onRevertGasLimit: 0 }
      );
      const r = await tx.wait();
      return r?.hash ?? tx.hash;
    }
  }

  // Fallback for unknown mode
  throw new Error(`Unsupported payment mode: ${mode}`);
}

/**
 * Map chain ID to human-readable chain name
 * Supports EVM and non-EVM chains (Bitcoin, etc.)
 */
export function getChainName(chainId: number | string): string {
  const id = typeof chainId === 'string' ? parseInt(chainId, 10) : chainId;
  
  const chainNames: Record<number, string> = {
    1: 'Ethereum Mainnet',
    11155111: 'Ethereum Sepolia',
    80001: 'Polygon Mumbai',
    97: 'BSC Testnet',
    56: 'BSC Mainnet',
    7001: 'ZetaChain Athens',
    8332: 'Bitcoin Testnet', // Bitcoin testnet via ZetaChain
    0: 'Bitcoin', // Bitcoin mainnet alias
  };
  
  return chainNames[id] || `Unknown Chain (${id})`;
}