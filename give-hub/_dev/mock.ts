import { MockDatabase } from './mock-db/database';
import type { Campaign, Donation } from './types';

const db = MockDatabase.getInstance();

function getAllCampaigns(): Campaign[] {
  return db.getAllCampaigns();
}

function findCampaignById(id: string): Campaign | undefined {
  return db.findCampaignById(id);
}

function createCampaign(data: Omit<Campaign, 'id' | 'createdAt' | 'updatedAt' | 'donations'>): Campaign {
  return db.createCampaign(data);
}

function createDonation(data: Omit<Donation, 'id' | 'timestamp'>): Donation {
  return db.createDonation(data);
}

const mock = { 
  getAllCampaigns,
  findCampaignById,
  createCampaign,
  createDonation
};

export default mock;
