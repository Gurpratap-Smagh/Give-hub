// Minimal ABI for client-side interactions
export const GIVEHUB_ABI = [
  // write functions
  {
    type: 'function',
    name: 'createCampaign',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'title', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'category', type: 'string' },
      { name: 'goal', type: 'uint256' },
      { name: 'deadline', type: 'uint64' },
      { name: 'imageHash', type: 'string' },
    ],
    outputs: [{ name: 'campaignId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'updateCampaign',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'campaignId', type: 'uint256' },
      { name: 'title', type: 'string' },
      { name: 'description', type: 'string' },
      { name: 'active', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'donate',
    stateMutability: 'payable',
    inputs: [
      { name: 'campaignId', type: 'uint256' },
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'donorName', type: 'string' },
      { name: 'message', type: 'string' },
    ],
    outputs: [],
  },
] as const;
