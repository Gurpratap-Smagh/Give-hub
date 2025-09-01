import { Schema, model, models } from 'mongoose';

const ContractOwnershipSchema = new Schema({
  verified: { type: Boolean, default: false },
  contractAddress: { type: String },
  blockchainProof: { type: String },
}, { _id: false });

// On-chain mapping schema (chainId, contract address, on-chain campaignId)
const OnChainSchema = new Schema({
  chainId: { type: Number, required: true, index: true },
  contract: { type: String, required: true, index: true },
  campaignId: { type: String, required: true, index: true },
}, { _id: false });

const DonationSchema = new Schema({
  name: { type: String, required: true },
  amount: { type: Number, required: true },
  chain: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  // Optional on-chain metadata
  txHash: { type: String },
}, { _id: false });

const CampaignSchema = new Schema({
  id: { type: String, index: true, unique: true },
  // On-chain linkage fields
  onchainId: { type: Number, index: true, sparse: true },
  // New: store full on-chain mapping provided by API
  onChain: { type: OnChainSchema, required: false },
  uuid: { type: String, index: true, unique: true, sparse: true }, // bytes32 hex string
  creatorAddress: { type: String, index: true }, // EVM address
  active: { type: Boolean, default: true, index: true },
  title: { type: String, required: true },
  goal: { type: Number, required: true },
  raised: { type: Number, default: 0 },
  chains: { type: [String], default: [] },
  description: { type: String, required: true },
  category: { type: String },
  creatorId: { type: String, required: true, index: true },
  image: { type: String },
  contractOwnership: { type: ContractOwnershipSchema, default: { verified: false } },
  verified: { type: Boolean, default: false },
  contractAddress: { type: String },
  blockchainProof: { type: String },
  donations: { type: [DonationSchema], default: [] },
}, { collection: 'campaigns', timestamps: true });

CampaignSchema.index({ title: 'text', description: 'text', category: 'text' });
// Ensure uniqueness for on-chain mapping when present (sparse avoids conflicts when onChain is missing)
CampaignSchema.index({ 'onChain.chainId': 1, 'onChain.contract': 1, 'onChain.campaignId': 1 }, { unique: true, sparse: true });

export const CampaignModel = models.Campaign || model('Campaign', CampaignSchema);
