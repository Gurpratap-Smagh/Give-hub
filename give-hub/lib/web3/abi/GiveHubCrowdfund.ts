// ABI for CrossChainCrowdfund contract - generated from deployed contract
// NOTE: Keep this in sync with contracts/_archive_min_rollback/CrossChainCrowdfund.sol
export const CrossChainCrowdfundABI = [
  // Custom errors (for better revert decoding)
  { "inputs": [], "name": "ZeroAmount", "type": "error" },
  { "inputs": [], "name": "AmountZero", "type": "error" },
  { "inputs": [], "name": "InvalidCampaign", "type": "error" },
  { "inputs": [], "name": "CampaignInactive", "type": "error" },
  { "inputs": [], "name": "InvalidToken", "type": "error" },
  { "inputs": [], "name": "SwapFailed", "type": "error" },
  { "inputs": [], "name": "NotCreator", "type": "error" },
  { "inputs": [], "name": "RouterNotSet", "type": "error" },
  // Read functions
  {
    "inputs": [],
    "name": "WZETA",
    "outputs": [ { "internalType": "address", "name": "", "type": "address" } ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "name": "creators",
    "outputs": [
      { "internalType": "address", "name": "preferredZRC20", "type": "address" },
      { "internalType": "bool", "name": "exists", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "name": "campaigns",
    "outputs": [
      { "internalType": "address", "name": "creator", "type": "address" },
      { "internalType": "address", "name": "preferredZRC20", "type": "address" },
      { "internalType": "bool", "name": "active", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "campaignId", "type": "uint256" }],
    "name": "getCampaignBalance",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "nextCampaignId",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "nextContributionId",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "router",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  // Write functions
  {
    "inputs": [{ "internalType": "address", "name": "preferredZRC20", "type": "address" }],
    "name": "createCampaign",
    "outputs": [{ "internalType": "uint256", "name": "campaignId", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "campaignId", "type": "uint256" },
      { "internalType": "string", "name": "donorName", "type": "string" },
      { "internalType": "string", "name": "note", "type": "string" }
    ],
    "name": "donate",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "zrc20In", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "internalType": "uint256", "name": "campaignId", "type": "uint256" },
      { "internalType": "string", "name": "donorName", "type": "string" },
      { "internalType": "string", "name": "note", "type": "string" }
    ],
    "name": "donate",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "campaignId", "type": "uint256" }],
    "name": "pauseCampaign",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "campaignId", "type": "uint256" }],
    "name": "resumeCampaign",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "campaignId", "type": "uint256" }],
    "name": "withdrawCampaignFunds",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "address", "name": "_router", "type": "address" }],
    "name": "setUniswapRouter",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Universal entrypoint for donations
  {
    "inputs": [
      {
        "components": [
          { "internalType": "bytes", "name": "origin", "type": "bytes" },
          { "internalType": "address", "name": "sender", "type": "address" },
          { "internalType": "uint256", "name": "chainID", "type": "uint256" }
        ],
        "internalType": "struct MessageContext",
        "name": "ctx",
        "type": "tuple"
      },
      { "internalType": "address", "name": "zrc20", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "internalType": "bytes", "name": "message", "type": "bytes" }
    ],
    "name": "onCall",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  // Events
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "campaignId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "creator", "type": "address" },
      { "indexed": false, "internalType": "address", "name": "preferredZRC20", "type": "address" }
    ],
    "name": "CampaignCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "uint256", "name": "campaignId", "type": "uint256" },
      { "indexed": true, "internalType": "address", "name": "donor", "type": "address" },
      { "indexed": true, "internalType": "uint256", "name": "contributionId", "type": "uint256" },
      { "indexed": false, "internalType": "address", "name": "originalToken", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "originalAmount", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "convertedAmount", "type": "uint256" },
      { "indexed": false, "internalType": "string", "name": "originChain", "type": "string" },
      { "indexed": false, "internalType": "string", "name": "donorName", "type": "string" },
      { "indexed": false, "internalType": "string", "name": "note", "type": "string" }
    ],
    "name": "ContributionReceived",
    "type": "event"
  },
  { "anonymous": false, "inputs": [
      { "indexed": false, "internalType": "address", "name": "tokenIn", "type": "address" },
      { "indexed": false, "internalType": "address", "name": "tokenOut", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amountIn", "type": "uint256" },
      { "indexed": false, "internalType": "uint256", "name": "amountOut", "type": "uint256" }
    ],
    "name": "SwapExecuted",
    "type": "event"
  },
  { "anonymous": false, "inputs": [
      { "indexed": true, "internalType": "address", "name": "tokenIn", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "tokenOut", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amountIn", "type": "uint256" },
      { "indexed": false, "internalType": "string", "name": "reason", "type": "string" }
    ],
    "name": "SwapFailed",
    "type": "event"
  },
  { "anonymous": false, "inputs": [
      { "indexed": true, "internalType": "address", "name": "creator", "type": "address" },
      { "indexed": false, "internalType": "uint256", "name": "amountWZETA", "type": "uint256" },
      { "indexed": false, "internalType": "address", "name": "requestedToken", "type": "address" }
    ],
    "name": "PaidInWZETA",
    "type": "event"
  },
] as const;

// Legacy export for compatibility
export const GiveHubCrowdfundABI = CrossChainCrowdfundABI;
export default CrossChainCrowdfundABI;
