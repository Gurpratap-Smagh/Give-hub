import { ethers } from 'ethers';

// Gateway contract addresses for different chains
export const GATEWAY_ADDRESSES = {
  // Mainnet
  ethereum: '0x0000000000000000000000000000000000000000', // TODO: Add mainnet address
  bsc: '0x0000000000000000000000000000000000000000', // TODO: Add BSC address
  polygon: '0x0000000000000000000000000000000000000000', // TODO: Add Polygon address
  
  // Testnet
  sepolia: '0x6c533f7fe93fae114d0954697069df33c9b74fd7', // Sepolia testnet gateway
  'bsc-testnet': '0x0000000000000000000000000000000000000000', // TODO: Add BSC testnet
  'polygon-mumbai': '0x0000000000000000000000000000000000000000', // TODO: Add Mumbai
  
  // ZetaChain
  zetachain: '0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf', // ZetaChain Athens testnet gateway
};

// Chain IDs
export const CHAIN_IDS = {
  ethereum: 1,
  sepolia: 11155111,
  bsc: 56,
  'bsc-testnet': 97,
  polygon: 137,
  'polygon-mumbai': 80001,
  zetachain: 7001,
  solana: 901, // Custom ID for Solana
  bitcoin: 18332, // Bitcoin testnet
};

// ZRC20 token addresses on ZetaChain
export const ZRC20_ADDRESSES = {
  // Testnet ZRC20 tokens
  'zrc20-eth-sepolia': '0x0000000000000000000000000000000000000000', // TODO: Add actual address
  'zrc20-btc': '0x65a45c57636f9BcCeD4fe193A602008578BcA90b', // BTC ZRC20
  'zrc20-bnb': '0xd97B1de3619ed2c6BEb3860147E30cA8A7dC9891', // BNB ZRC20
  'zrc20-zeta': '0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf', // ZETA token
};

// Gateway ABI for deposit and call
const GATEWAY_ABI = [
  'function deposit(address receiver, uint256 amount, address asset, bytes memory message) external payable',
  'function depositAndCall(address receiver, uint256 amount, address asset, bytes memory message) external payable',
  'function call(address receiver, bytes memory message) external payable',
];

export interface DepositParams {
  campaignId: number;
  donorName: string;
  note: string;
  targetChain: string;
  payoutAddress: string;
  payoutToken: string;
}

export class GatewayService {
  private provider: ethers.Provider | null = null;
  private signer: ethers.Signer | null = null;
  private universalContractAddress: string;

  constructor(universalContractAddress: string) {
    this.universalContractAddress = universalContractAddress;
  }

  /**
   * Initialize the service with a provider and signer
   */
  async initialize(provider: ethers.Provider, signer: ethers.Signer) {
    this.provider = provider;
    this.signer = signer;
  }

  /**
   * Deposit tokens from any supported chain to a campaign
   */
  async depositToCampaign(
    sourceChain: string,
    tokenAddress: string,
    amount: string,
    params: DepositParams
  ): Promise<ethers.TransactionResponse> {
    if (!this.provider || !this.signer) {
      throw new Error('Gateway service not initialized');
    }

    const gatewayAddress = GATEWAY_ADDRESSES[sourceChain as keyof typeof GATEWAY_ADDRESSES];
    if (!gatewayAddress) {
      throw new Error(`Gateway not available for chain: ${sourceChain}`);
    }

    const gateway = new ethers.Contract(gatewayAddress, GATEWAY_ABI, this.signer);

    // Encode the message for the universal contract
    const message = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'string', 'string'],
      [params.campaignId, params.donorName, params.note]
    );

    // Check if it's a native token deposit
    const isNativeToken = tokenAddress === ethers.ZeroAddress;

    if (isNativeToken) {
      // Native token deposit (ETH, BNB, etc.)
      return await gateway.depositAndCall(
        this.universalContractAddress,
        0, // Amount is in msg.value for native tokens
        ethers.ZeroAddress, // Native token indicator
        message,
        { value: ethers.parseEther(amount) }
      );
    } else {
      // ERC20 token deposit
      // First approve the gateway to spend tokens
      const token = new ethers.Contract(
        tokenAddress,
        ['function approve(address spender, uint256 amount) external returns (bool)'],
        this.signer
      );
      
      const decimals = await this.getTokenDecimals(tokenAddress);
      const parsedAmount = ethers.parseUnits(amount, decimals);
      
      await token.approve(gatewayAddress, parsedAmount);
      
      return await gateway.depositAndCall(
        this.universalContractAddress,
        parsedAmount,
        tokenAddress,
        message
      );
    }
  }

  /**
   * Get the estimated gas fee for a cross-chain transaction
   */
  async estimateGasFee(
    sourceChain: string,
    targetChain: string,
    tokenAmount: string
  ): Promise<string> {
    // This is a simplified estimation
    // In production, you'd query the actual gas oracle
    const baseGas = {
      ethereum: '0.001',
      sepolia: '0.0001',
      bsc: '0.0005',
      polygon: '0.0001',
      solana: '0.00001',
      bitcoin: '0.0001',
      zetachain: '0.0001'
    };

    const sourceFee = baseGas[sourceChain as keyof typeof baseGas] || '0.001';
    const targetFee = baseGas[targetChain as keyof typeof baseGas] || '0.001';
    
    return (parseFloat(sourceFee) + parseFloat(targetFee)).toString();
  }

  /**
   * Get token decimals
   */
  private async getTokenDecimals(tokenAddress: string): Promise<number> {
    if (!this.provider) return 18;
    
    try {
      const token = new ethers.Contract(
        tokenAddress,
        ['function decimals() view returns (uint8)'],
        this.provider
      );
      return await token.decimals();
    } catch {
      return 18; // Default to 18 decimals
    }
  }

  /**
   * Check if a chain supports the Gateway
   */
  isChainSupported(chain: string): boolean {
    return chain in GATEWAY_ADDRESSES;
  }

  /**
   * Get the ZRC20 token address for a given chain's native token
   */
  getZRC20Address(chain: string): string | null {
    const mapping: Record<string, string> = {
      bitcoin: ZRC20_ADDRESSES['zrc20-btc'],
      bsc: ZRC20_ADDRESSES['zrc20-bnb'],
      sepolia: ZRC20_ADDRESSES['zrc20-eth-sepolia'],
      zetachain: ZRC20_ADDRESSES['zrc20-zeta'],
    };
    
    return mapping[chain] || null;
  }
}

// Singleton instance
let gatewayService: GatewayService | null = null;

export function getGatewayService(universalContractAddress?: string): GatewayService {
  if (!gatewayService) {
    if (!universalContractAddress) {
      throw new Error('Universal contract address required for first initialization');
    }
    gatewayService = new GatewayService(universalContractAddress);
  }
  return gatewayService;
}
