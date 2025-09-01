// DB module unified types (replacing prior mock DB types)

export type UserRole = 'user' | 'creator' | string;

export interface User {
  id: string;
  username?: string;
  email: string;
  password?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  profilePicture?: string;
  bio?: string;
  location?: string;
  website?: string;
  walletAddresses?: Array<{ chain: string; address: string }> | Record<string, string> | unknown;
  donatedCampaigns?: string[];
  totalDonated?: number;
  preferredChains?: string[];
}

export interface Creator extends User {
  role: 'creator' | string;
  createdCampaigns?: string[];
  totalRaised?: number;
  verificationStatus?: 'pending' | 'verified' | 'rejected' | string;
  socialLinks?: Record<string, string>;
}

// Donation records are embedded on Campaign in Mongo; shape used across the app
export interface Donation {
  campaignId: string;
  name: string;
  amount: number;
  chain: string;
  timestamp: Date;
}
