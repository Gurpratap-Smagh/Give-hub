export const DONATION_ABI = [
  // Standardized event matching CrossChainCrowdfund contract
  "event ContributionReceived(uint256 indexed campaignId, address indexed donor, uint256 indexed contributionId, address originalToken, uint256 originalAmount, uint256 convertedAmount, string originChain, string donorName, string note)",
  
  // Campaign management
  "event CampaignCreated(uint256 indexed campaignId, address indexed creator, address preferredZRC20)",
  
  // Core donation functions
  "function donate(uint256 campaignId, string donorName, string note) external payable",
  "function donate(address token, uint256 amount, uint256 campaignId, string donorName, string note) external",
  
  // Campaign functions  
  "function createCampaign(address preferredZRC20) external returns (uint256 campaignId)",
  "function updateCampaignPayoutToken(uint256 campaignId, address newToken) external",
  
  // Universal entry (gateway -> contract) exists on the contract but is never called by the frontend.
  // Intentionally omitted here to avoid brittle tuple type mismatches for MessageContext.
  
  // View functions
  "function campaigns(uint256) external view returns (address creator, address preferredZRC20, bool active)",
  "function contributions(uint256) external view returns (uint256 campaignId, address donor, address originalToken, address zrc20Received, uint256 originalAmount, uint256 convertedAmount, uint256 originChainId, uint64 timestamp, string originChainName)",
  "function nextCampaignId() external view returns (uint256)",
  "function nextContributionId() external view returns (uint256)",
  "function getCampaignInfo(uint256 campaignId) external view returns (tuple(uint256 campaignId, address creator, address preferredZRC20, bool active) info)",
  "function getAllSyncedCampaigns(uint256 startId, uint256 limit) external view returns (tuple(uint256 campaignId, address creator, address preferredZRC20, bool active)[] infos, uint256 nextStart)",
  
  // System contracts
  "function WZETA() external view returns (address)",
  "function ethZRC20() external view returns (address)",
  "function btcZRC20() external view returns (address)", 
  "function usdcZRC20() external view returns (address)",
  
  // Router admin
  "function setUniswapRouter(address _router) external",
  "function router() external view returns (address)"
] as const;

// Type for the ContributionReceived event
export interface ContributionReceivedEvent {
  campaignId: bigint;
  donor: string;
  contributionId: bigint;
  originalToken: string;
  originalAmount: bigint;
  convertedAmount: bigint;
  originChain: string;
  donorName: string;
  note: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
}

// Type for donation form data
export interface DonationFormData {
  donorName: string;
  note: string;
  campaignId: number;
  token: string;
  amount: string;
}

// Type for campaign data
export interface CampaignData {
  creator: string;
  preferredZRC20: string;
  active: boolean;
}
