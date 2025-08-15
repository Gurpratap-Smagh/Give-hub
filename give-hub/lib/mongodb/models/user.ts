import { Schema, model, models } from 'mongoose';

const SocialLinksSchema = new Schema({
  twitter: { type: String },
  linkedin: { type: String },
  github: { type: String },
}, { _id: false });

const WalletAddressesSchema = new Schema({
  Ethereum: { type: String },
  Solana: { type: String },
  Bitcoin: { type: String },
}, { _id: false });

const UserSchema = new Schema({
  id: { type: String, index: true, unique: true },
  username: { type: String, required: true, index: true, unique: true },
  email: { type: String, required: true, index: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'creator'], required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  profilePicture: { type: String },
  bio: { type: String },
  location: { type: String },
  website: { type: String },
  walletAddresses: { type: WalletAddressesSchema, default: {} },
  donatedCampaigns: { type: [String], default: [] },
  totalDonated: { type: Number, default: 0 },
  preferredChains: { type: [String], default: [] },
  // Creator-only fields
  createdCampaigns: { type: [String], default: [] },
  totalRaised: { type: Number, default: 0 },
  verificationStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },
  socialLinks: { type: SocialLinksSchema, default: {} },
}, { collection: 'users' });

UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });

export const UserModel = models.User || model('User', UserSchema);
