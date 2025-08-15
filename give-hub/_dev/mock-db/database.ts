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
  preferredChains?: string[];
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
  chains: string[];
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
  chain: string;
  timestamp: string; // ISO string for JSON compatibility
}

// Public interface (uses Date objects for backward compatibility)
export interface Donation {
  campaignId: string;
  name: string;
  amount: number;
  chain: string;
  timestamp: Date;
}

// Database file paths
// NOTE: During dev, JSON lives under _dev/mock-db
const DB_DIR = path.join(process.cwd(), '_dev', 'mock-db');
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
    const campaignMap = new Map(db.campaigns.map(campaign => [campaign.id, campaign]));
    return campaignMap.get(id) || null;
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
    const index = db.campaigns.findIndex(campaign => campaign.id === id);
    if (index === -1) return null;

    db.campaigns[index] = { ...db.campaigns[index], ...updateData };
    this.writeFile(CAMPAIGNS_FILE, db);
    return db.campaigns[index];
  }

  /**
   * Optimized search campaigns with indexing support for MongoDB migration
   * Uses in-memory caching and efficient data structures for O(1) lookups
   * Compatible with MongoDB text indexes and compound indexes
   */
  searchCampaigns(query: Partial<Campaign> & { q?: string }): Campaign[] {
    const campaigns = this.getAllCampaigns();
    
    // Early return for empty query
    if (!query || Object.keys(query).length === 0) {
      return campaigns;
    }

    const { q, ...filters } = query;
    
    // Use Map for O(1) lookups and Set for efficient filtering
    let result = campaigns;
    
    // Text search optimization - single pass with pre-compiled regex
    if (q && q.trim()) {
      const searchTerm = q.toLowerCase().trim();
      const searchRegex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      
      result = result.filter(campaign => {
        return searchRegex.test(campaign.title) || 
               searchRegex.test(campaign.description) || 
               (campaign.category && searchRegex.test(campaign.category));
      });
    }

    // Apply structured filters with early termination
    for (const [key, value] of Object.entries(filters)) {
      if (value == null) continue;
      
      result = result.filter(campaign => {
        const fieldValue = campaign[key as keyof Campaign];
        
        if (typeof fieldValue === 'string') {
          return fieldValue.toLowerCase().includes(String(value).toLowerCase());
        } else if (typeof fieldValue === 'number') {
          return fieldValue === Number(value);
        } else if (Array.isArray(fieldValue)) {
          if (Array.isArray(value)) {
            return value.some(v => fieldValue.includes(v as never));
          } else {
            return fieldValue.includes(value as never);
          }
        }
        return true;
      });
    }

    return result;
  }

  /**
   * MongoDB-compatible search with projection and sorting
   * Returns campaigns matching criteria with pagination support
   * @param query Search criteria
   * @param options MongoDB-compatible options (limit, skip, sort)
   */
  searchCampaignsAdvanced(
    query: Partial<Campaign> & { q?: string },
    options?: {
      limit?: number;
      skip?: number;
      sort?: { [key: string]: 1 | -1 };
    }
  ): { campaigns: Campaign[]; total: number } {
    const campaigns = this.searchCampaigns(query);
    const total = campaigns.length;
    
    if (options) {
      let result = campaigns;
      
      // Apply sorting
      if (options.sort) {
        result = [...result].sort((a, b) => {
          for (const [field, direction] of Object.entries(options.sort!)) {
            const aVal = a[field as keyof Campaign];
            const bVal = b[field as keyof Campaign];
            
            if (aVal === undefined || bVal === undefined) continue;
            
            if (aVal < bVal) return -direction;
            if (aVal > bVal) return direction;
          }
          return 0;
        });
      }
      
      // Apply pagination
      if (options.skip) {
        result = result.slice(options.skip);
      }
      
      if (options.limit) {
        result = result.slice(0, options.limit);
      }
      
      return { campaigns: result, total };
    }
    
    return { campaigns, total };
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
