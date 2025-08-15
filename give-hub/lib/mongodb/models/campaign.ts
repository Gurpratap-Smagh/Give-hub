import { Schema, model, models } from 'mongoose';

const ContractOwnershipSchema = new Schema({
  verified: { type: Boolean, default: false },
  contractAddress: { type: String },
  blockchainProof: { type: String },
}, { _id: false });

const DonationSchema = new Schema({
  name: { type: String, required: true },
  amount: { type: Number, required: true },
  chain: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const CampaignSchema = new Schema({
  id: { type: String, index: true, unique: true },
  title: { type: String, required: true, index: 'text' },
  goal: { type: Number, required: true },
  raised: { type: Number, default: 0 },
  chains: { type: [String], required: true },
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

export const CampaignModel = models.Campaign || model('Campaign', CampaignSchema);
