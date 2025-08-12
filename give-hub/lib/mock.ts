/**
 * FILE: lib/mock.ts
 * PURPOSE: TEMPORARY campaign and donation operations using JSON mock database - REPLACE IN PRODUCTION
 * ACCESS: Import Campaign, Donation types and operations in components and pages
 * MIGRATION NOTES:
 * - Replace JSON file operations with MongoDB connection and operations
 * - Replace db.* calls with actual MongoDB operations
 * - Keep the same interface for easy migration
 * - This entire file should be DELETED after MongoDB integration
 */

import { db, Campaign, Donation } from './mock-db/database';

// Re-export types for backward compatibility
export type { Campaign, Donation };

// TEMP: Mock campaign operations - REPLACE WITH MONGODB OPERATIONS
export const mockCampaigns: Campaign[] = db.getAllCampaigns();

// TEMP: Mock donation operations - REPLACE WITH MONGODB OPERATIONS
export const mockDonations: Donation[] = db.getAllDonations();

// Campaign operations
export const mockCampaignOperations = {
  // TODO: Replace with MongoDB Campaign.find()
  getAllCampaigns: (): Campaign[] => {
    return db.getAllCampaigns();
  },

  // TODO: Replace with MongoDB Campaign.findById(id)
  findCampaignById: (id: string): Campaign | null => {
    return db.findCampaignById(id);
  },

  // TODO: Replace with MongoDB new Campaign(campaignData).save()
  createCampaign: (campaignData: Omit<Campaign, 'id'>): Campaign => {
    return db.createCampaign(campaignData);
  },

  // TODO: Replace with MongoDB Campaign.findByIdAndUpdate(id, updateData)
  updateCampaign: (id: string, updateData: Partial<Campaign>): Campaign | null => {
    return db.updateCampaign(id, updateData);
  }
};

// Donation operations
export const mockDonationOperations = {
  // TODO: Replace with MongoDB Donation.find({ campaignId })
  getDonationsByCampaign: (campaignId: string): Donation[] => {
    return db.getDonationsByCampaign(campaignId);
  },

  // TODO: Replace with MongoDB Donation.find()
  getAllDonations: (): Donation[] => {
    return db.getAllDonations();
  },

  // TODO: Replace with MongoDB new Donation(donationData).save()
  createDonation: (donationData: Omit<Donation, 'timestamp'> & { timestamp?: Date }): Donation => {
    return db.createDonation(donationData);
  }
};

// TEMP: Helper functions - REPLACE WITH MONGODB AGGREGATIONS/QUERIES
export const mockCampaignHelpers = {
  // TODO: Replace with MongoDB aggregation or sort by updatedAt/createdAt
  getRecentCampaigns: (limit: number = 6): Campaign[] => {
    return db.getAllCampaigns().slice(0, limit);
  },
  // TODO: Replace with MongoDB query for featured campaigns
  getFeaturedCampaigns: (limit: number = 3): Campaign[] => {
    return db.getAllCampaigns().slice(0, limit);
  },
  // TODO: Replace with MongoDB pagination with skip/limit
  paginateCampaigns: (
    page: number = 1,
    pageSize: number = 12
  ): { items: Campaign[]; total: number; page: number; pageSize: number } => {
    const all = db.getAllCampaigns();
    const total = all.length;
    const start = (page - 1) * pageSize;
    const items = all.slice(start, start + pageSize);
    return { items, total, page, pageSize };
  }
};

// Export for easy replacement during MongoDB migration
const mockData = {
  mockCampaigns,
  mockDonations,
  mockCampaignOperations,
  mockDonationOperations,
  mockCampaignHelpers
};

export default mockData;
