export const DONATION_ABI = [
  // Events
  "event DonationMade(string name, string note, uint256 amount, uint256 indexed campaignId, address token)",
  
  // Core functions
  "function donate(string calldata name, string calldata note, uint256 campaignId, address token, uint256 amount) external payable",
  
  // Batch donation
  "function batchDonate((string name, string note, uint256 campaignId, address token, uint256 amount)[] calldata donations) external payable",
  
  // View functions
  "function getBalance(address token) external view returns (uint256)",
  "function platformFeeBps() external view returns (uint256)",
  "function feeRecipient() external view returns (address)",
  "function paused() external view returns (bool)",
  "function owner() external view returns (address)",
  
  // Admin functions
  "function setPlatformFee(uint256 newFeeBps) external",
  "function setFeeRecipient(address newRecipient) external",
  "function setPaused(bool _paused) external",
  "function emergencyWithdraw(address token, uint256 amount) external",
  "function withdrawForCampaign(uint256 campaignId, address token, uint256 amount, address recipient) external"
] as const;

// Type for the DonationMade event
export interface DonationMadeEvent {
  name: string;
  note: string;
  amount: bigint;
  campaignId: bigint;
  token: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
}

// Type for donation form data
export interface DonationFormData {
  name: string;
  note: string;
  campaignId: number;
  token: string;
  amount: string;
}

// Type for batch donation data
export interface BatchDonationData {
  name: string;
  note: string;
  campaignId: number;
  token: string;
  amount: string;
}
