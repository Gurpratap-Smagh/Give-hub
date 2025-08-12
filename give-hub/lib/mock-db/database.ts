/**
 * FILE: lib/mock-db/database.ts
 * PURPOSE: JSON-based mock database manager - REPLACE WITH MONGODB IN PRODUCTION
 * ACCESS: Import db from this file in auth components and API routes
 * MIGRATION NOTES:
 * - Replace file operations with MongoDB connection and operations
 * - Replace JSON files with MongoDB collections
 * - Keep the same interface for easy migration
 * - This entire directory should be DELETED after MongoDB integration
 */

import fs from 'fs';
import path from 'path';

// Type definitions (will be moved to separate types file in production)
export type UserRole = "user" | "creator";

export interface User {
  id: string;
  username: string;
  email: string;
  password: string; // In production: bcrypt hashed password
  role: UserRole;
  createdAt: string; // ISO string for JSON compatibility
  updatedAt: string; // ISO string for JSON compatibility
  // Profile picture - base64 encoded image or URL
  profilePicture?: string;
  // Basic profile fields used in Profile page
  bio?: string;
  location?: string;
  website?: string;
  // Web3 wallet addresses placeholder (by chain)
  walletAddresses?: {
    Ethereum?: string;
    Solana?: string;
    Bitcoin?: string;
  };
  // User-specific fields
  donatedCampaigns?: string[]; // Campaign IDs user has donated to
  totalDonated?: number;
  preferredChains?: ("Ethereum" | "Solana" | "Bitcoin")[];
}

export interface Creator extends User {
  role: "creator";
  // Creator-specific fields
  createdCampaigns: string[]; // Campaign IDs created by this creator
  totalRaised: number;
  verificationStatus: "pending" | "verified" | "rejected";
  bio?: string;
  website?: string;
  socialLinks?: {
    twitter?: string;
    linkedin?: string;
    github?: string;
  };
}

export interface Campaign {
  id: string;
  title: string;
  goal: number;
  raised: number;
  chains: ("Ethereum" | "Solana" | "Bitcoin")[];
  description: string;
  /** Optional campaign category (e.g., education, healthcare, other-custom) */
  category?: string;
  /** Campaign creator ID - maps to User/Creator */
  creatorId: string;
  /** Campaign image - base64 encoded image or URL */
  image?: string;
  /** Placeholder for smart contract ownership verification in production */
  contractOwnership?: {
    verified: boolean;
    contractAddress?: string;
    blockchainProof?: string;
  };
}

// Database interface (uses ISO strings for JSON compatibility)
export interface DonationDB {
  campaignId: string;
  name: string;
  amount: number;
  chain: "Ethereum" | "Solana" | "Bitcoin";
  timestamp: string; // ISO string for JSON compatibility
}

// Public interface (uses Date objects for backward compatibility)
export interface Donation {
  campaignId: string;
  name: string;
  amount: number;
  chain: "Ethereum" | "Solana" | "Bitcoin";
  timestamp: Date;
}

// Database file paths
const DB_DIR = path.join(process.cwd(), 'lib', 'mock-db');
const USERS_FILE = path.join(DB_DIR, 'users.json');
const CAMPAIGNS_FILE = path.join(DB_DIR, 'campaigns.json');
const DONATIONS_FILE = path.join(DB_DIR, 'donations.json');

// Database interfaces
interface UsersDB {
  users: (User | Creator)[];
}

interface CampaignsDB {
  campaigns: Campaign[];
}

interface DonationsDB {
  donations: DonationDB[];
}

// File system operations (will be replaced with MongoDB operations)
class MockDatabase {
  // TODO: Replace with MongoDB connection
  private readFile<T>(filePath: string): T {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      throw new Error(`Database read error: ${filePath}`);
    }
  }

  // TODO: Replace with MongoDB operations
  private writeFile<T>(filePath: string, data: T): void {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`Error writing file ${filePath}:`, error);
      throw new Error(`Database write error: ${filePath}`);
    }
  }

  // User operations - TODO: Replace with MongoDB User collection operations
  findUserByEmail(email: string): User | Creator | null {
    const db = this.readFile<UsersDB>(USERS_FILE);
    return db.users.find(user => user.email === email) || null;
  }

  findUserByUsername(username: string): User | Creator | null {
    const db = this.readFile<UsersDB>(USERS_FILE);
    return db.users.find(user => user.username === username) || null;
  }

  findUserById(id: string): User | Creator | null {
    const db = this.readFile<UsersDB>(USERS_FILE);
    return db.users.find(user => user.id === id) || null;
  }

  createUser(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): User {
    const db = this.readFile<UsersDB>(USERS_FILE);
    const newUser: User = {
      ...userData,
      id: `user_${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      walletAddresses: {},
      donatedCampaigns: [],
      totalDonated: 0,
      preferredChains: []
    };
    db.users.push(newUser);
    this.writeFile(USERS_FILE, db);
    return newUser;
  }

  createCreator(creatorData: Omit<Creator, 'id' | 'createdAt' | 'updatedAt'>): Creator {
    const db = this.readFile<UsersDB>(USERS_FILE);
    const newCreator: Creator = {
      ...creatorData,
      id: `creator_${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdCampaigns: [],
      totalRaised: 0,
      verificationStatus: "pending"
    };
    db.users.push(newCreator);
    this.writeFile(USERS_FILE, db);
    return newCreator;
  }

  updateUser(id: string, updateData: Partial<User | Creator>): User | Creator | null {
    const db = this.readFile<UsersDB>(USERS_FILE);
    const userIndex = db.users.findIndex(user => user.id === id);
    if (userIndex === -1) return null;
    
    db.users[userIndex] = {
      ...db.users[userIndex],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    this.writeFile(USERS_FILE, db);
    return db.users[userIndex];
  }

  deleteUser(id: string): boolean {
    const db = this.readFile<UsersDB>(USERS_FILE);
    const userIndex = db.users.findIndex(user => user.id === id);
    if (userIndex === -1) return false;
    
    db.users.splice(userIndex, 1);
    this.writeFile(USERS_FILE, db);
    return true;
  }

  // Campaign operations - TODO: Replace with MongoDB Campaign collection operations
  getAllCampaigns(): Campaign[] {
    const db = this.readFile<CampaignsDB>(CAMPAIGNS_FILE);
    return db.campaigns;
  }

  findCampaignById(id: string): Campaign | null {
    const db = this.readFile<CampaignsDB>(CAMPAIGNS_FILE);
    return db.campaigns.find(campaign => campaign.id === id) || null;
  }

  createCampaign(campaignData: Omit<Campaign, 'id'>): Campaign {
    const db = this.readFile<CampaignsDB>(CAMPAIGNS_FILE);
    const newCampaign: Campaign = {
      ...campaignData,
      id: `campaign_${Date.now()}`
    };
    db.campaigns.push(newCampaign);
    this.writeFile(CAMPAIGNS_FILE, db);
    return newCampaign;
  }

  updateCampaign(id: string, updateData: Partial<Campaign>): Campaign | null {
    const db = this.readFile<CampaignsDB>(CAMPAIGNS_FILE);
    const campaignIndex = db.campaigns.findIndex(campaign => campaign.id === id);
    if (campaignIndex === -1) return null;
    
    db.campaigns[campaignIndex] = {
      ...db.campaigns[campaignIndex],
      ...updateData
    };
    this.writeFile(CAMPAIGNS_FILE, db);
    return db.campaigns[campaignIndex];
  }

  /**
   * Search campaigns by any schema element.
   * - For string fields: case-insensitive substring match
   * - For number fields: exact match
   * - For array fields: match if the array includes the provided value
   * - Special 'q' field performs text search over title, description, category
   */
  searchCampaigns(query: Partial<Campaign> & { q?: string }): Campaign[] {
    const db = this.readFile<CampaignsDB>(CAMPAIGNS_FILE);
    const { q, ...filters } = query || {};
    const qLower = q?.toString().toLowerCase();

    return db.campaigns.filter((c) => {
      // Text search across common string fields
      if (qLower) {
        const haystack = [c.title, c.description, c.category || '']
          .join(' ') 
          .toLowerCase();
        if (!haystack.includes(qLower)) return false;
      }

      // Structured filters by field
      for (const [key, value] of Object.entries(filters)) {
        const k = key as keyof Campaign;
        const v = value as unknown;
        const field = c[k] as unknown;

        if (v == null) continue;

        if (typeof field === 'string') {
          const target = v.toString().toLowerCase();
          if (!field.toLowerCase().includes(target)) return false;
        } else if (typeof field === 'number') {
          if (Number(v) !== field) return false;
        } else if (Array.isArray(field)) {
          // Accept string or array filter; any match qualifies
          if (Array.isArray(v)) {
            const any = v.some((item) => field.includes(item as never));
            if (!any) return false;
          } else {
            if (!field.includes(v as never)) return false;
          }
        } else if (typeof field === 'object' && field !== null) {
          // No nested objects in current schema; skip
          continue;
        }
      }

      return true;
    });
  }

  // Donation operations - TODO: Replace with MongoDB Donation collection operations
  getDonationsByCampaign(campaignId: string): Donation[] {
    const db = this.readFile<DonationsDB>(DONATIONS_FILE);
    return db.donations
      .filter(donation => donation.campaignId === campaignId)
      .map(donation => ({
        ...donation,
        timestamp: new Date(donation.timestamp)
      }));
  }

  getAllDonations(): Donation[] {
    const db = this.readFile<DonationsDB>(DONATIONS_FILE);
    return db.donations.map(donation => ({
      ...donation,
      timestamp: new Date(donation.timestamp)
    }));
  }

  createDonation(donationData: Omit<Donation, 'timestamp'> & { timestamp?: Date }): Donation {
    const db = this.readFile<DonationsDB>(DONATIONS_FILE);
    const dbDonation: DonationDB = {
      ...donationData,
      timestamp: (donationData.timestamp || new Date()).toISOString()
    };
    db.donations.push(dbDonation);
    this.writeFile(DONATIONS_FILE, db);
    return {
      ...dbDonation,
      timestamp: new Date(dbDonation.timestamp)
    };
  }

  // Helper functions - TODO: Replace with MongoDB aggregation queries
  getUserStats(userId: string) {
    const user = this.findUserById(userId);
    if (!user) return null;

    if (user.role === "creator") {
      const creator = user as Creator;
      return {
        totalCampaigns: creator.createdCampaigns.length,
        totalRaised: creator.totalRaised,
        verificationStatus: creator.verificationStatus
      };
    } else {
      return {
        totalDonations: user.donatedCampaigns?.length || 0,
        totalDonated: user.totalDonated || 0,
        preferredChains: user.preferredChains || []
      };
    }
  }

  getVerifiedCreators(): Creator[] {
    const db = this.readFile<UsersDB>(USERS_FILE);
    return db.users.filter(user => 
      user.role === "creator" && 
      (user as Creator).verificationStatus === "verified"
    ) as Creator[];
  }

  getRecentUsers(limit: number = 10): (User | Creator)[] {
    const db = this.readFile<UsersDB>(USERS_FILE);
    return db.users
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }
}

// Export singleton instance - TODO: Replace with MongoDB connection
export const db = new MockDatabase();

// Export types for use in other files
export type { UsersDB, CampaignsDB, DonationsDB };
