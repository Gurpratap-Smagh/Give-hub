// Central DB module
// Exports `db` (MongoDB adapter) and re-exports common types
// Mock DB support removed; always uses the real MongoDB adapter

// IMPORTANT: Use the unified Campaign type from '@/lib/utils/types' across the app
import type { Campaign } from '@/lib/utils/types';
import type { User, Creator, Donation } from './types';

// Mock/conditional DB logic removed

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
  await import('../mongodb/database')
).mongoDb as unknown as DBAdapter;

// Re-export types
export type { User, Creator, Donation } from './types';
export type { UserRole } from './types';
export type { Campaign } from '@/lib/utils/types';
