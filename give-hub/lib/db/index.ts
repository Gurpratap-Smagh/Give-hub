// Central DB toggle module
// Exports `db` and re-exports common types
// By default uses the mock JSON DB; set USE_MONGODB=true (or use_mongodb / NEXT_PUBLIC_USE_MONGODB) to switch to Mongo adapter

import type { User, Creator, Campaign, Donation } from '@/_dev/mock-db/database';

function envTrue(v?: string) {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

const useMongo = envTrue(process.env.USE_MONGODB)
  || envTrue(process.env.use_mongodb)
  || envTrue(process.env.NEXT_PUBLIC_USE_MONGODB);

// Minimal DB adapter interface shared by both implementations
export interface DBAdapter {
  // Users
  findUserByEmail(email: string): Promise<User | Creator | null> | (User | Creator | null);
  findUserByUsername(username: string): Promise<User | Creator | null> | (User | Creator | null);
  findUserById(id: string): Promise<User | Creator | null> | (User | Creator | null);
  createUser(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> | User;
  createCreator(creatorData: Omit<Creator, 'id' | 'createdAt' | 'updatedAt'>): Promise<Creator> | Creator;
  updateUser(id: string, update: Partial<User | Creator>): Promise<User | Creator | null> | (User | Creator | null);
  deleteUser(id: string): Promise<boolean> | boolean;
  // Campaigns
  getAllCampaigns(): Promise<Campaign[]> | Campaign[];
  findCampaignById(id: string): Promise<Campaign | null> | (Campaign | null);
  createCampaign(data: Omit<Campaign, 'id'>): Promise<Campaign> | Campaign;
  updateCampaign(id: string, data: Partial<Campaign>): Promise<Campaign | null> | (Campaign | null);
  searchCampaigns(query: Partial<Campaign> & { q?: string }): Promise<Campaign[]> | Campaign[];
  // Advanced/search helpers
  searchCampaignsAdvanced(
    query: Partial<Campaign> & { q?: string },
    options?: { limit?: number; skip?: number; sort?: { [key: string]: 1 | -1 } }
  ): Promise<{ campaigns: Campaign[]; total: number }> | { campaigns: Campaign[]; total: number };
  // Donations
  getDonationsByCampaign(campaignId: string): Promise<Donation[]> | Donation[];
  getAllDonations(): Promise<Donation[]> | Donation[];
  createDonation(data: Omit<Donation, 'timestamp'> & { timestamp?: Date }): Promise<Donation> | Donation;
  // Misc helpers
  getUserStats(userId: string): Promise<CreatorStats | UserStats | null> | (CreatorStats | UserStats | null);
  getVerifiedCreators(): Promise<Creator[]> | Creator[];
  getRecentUsers(limit?: number): Promise<(User | Creator)[]> | (User | Creator)[];
}

export type CreatorStats = {
  totalCampaigns: number;
  totalRaised: number;
  verificationStatus: 'pending' | 'verified' | 'rejected' | string;
};

export type UserStats = {
  totalDonations: number;
  totalDonated: number;
  preferredChains: string[];
};

export const db: DBAdapter = (
  useMongo
    ? (await import('../mongodb/database')).mongoDb
    : (await import('@/_dev/mock-db/database')).db
) as unknown as DBAdapter;

export type { UserRole, User, Creator, Campaign, Donation } from '@/_dev/mock-db/database';
