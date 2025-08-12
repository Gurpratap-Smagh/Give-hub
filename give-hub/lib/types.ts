/**
 * FILE: lib/types.ts
 * PURPOSE: Central type definitions for GiveHub dApp data models
 * ACCESS: Import types across components, pages, and API routes
 * MIGRATION NOTES:
 * - These types map directly to MongoDB collections
 * - Campaign.id becomes MongoDB _id (ObjectId converted to string)
 * - Add indexes: campaigns({ id: 1 } unique, { createdAt: -1 }), donations({ campaignId: 1, timestamp: -1 })
 * TODO:
 * - Add User type for authentication (email, walletAddress, createdAt, campaigns[])
 * - Add validation schemas with zod for API routes
 * - Consider adding blockchain-specific fields (txHash, blockNumber, gasUsed)
 */

// REGION: Core Data Models

/**
 * Campaign data model - maps to MongoDB campaigns collection
 * @description Fundraising campaign with multi-chain support
 */
export interface Campaign {
  /** Unique identifier - maps to MongoDB _id */
  id: string;
  /** Campaign title for display */
  title: string;
  /** Target fundraising amount in USD */
  goal: number;
  /** Current amount raised in USD - reconciled from on-chain data */
  raised: number;
  /** Supported blockchain networks for donations */
  chains: ("Ethereum" | "Solana" | "Bitcoin")[];
  /** Full campaign description with markdown support */
  description: string;
  /** Optional campaign category (preset or custom when using Other) */
  category?: string;
  /** Campaign creator wallet address - added in MongoDB migration */
  creatorAddress?: string;
  /** Creation timestamp - added in MongoDB migration */
  createdAt?: Date;
  /** Campaign status - added in MongoDB migration */
  status?: "active" | "completed" | "paused";
}

/**
 * Donation record - maps to MongoDB donations collection
 * @description Individual donation transaction record
 */
export interface Donation {
  /** Associated campaign ID */
  campaignId: string;
  /** Donor display name (optional, can be "Anonymous") */
  name: string;
  /** Donation amount in USD */
  amount: number;
  /** Blockchain network used for donation */
  chain: "Ethereum" | "Solana" | "Bitcoin";
  /** Donation timestamp */
  timestamp: Date;
  /** Transaction hash - added in contract migration */
  txHash?: string;
  /** Donor wallet address - added in contract migration */
  donorAddress?: string;
  /** Optional memo/message from donor */
  memo?: string;
}

/**
 * User account - to be added in MongoDB migration
 * @description User profile and authentication data
 */
export interface User {
  /** Unique user identifier */
  id: string;
  /** User email address */
  email: string;
  /** Primary wallet address */
  walletAddress: string;
  /** Display name */
  displayName?: string;
  /** Account creation timestamp */
  createdAt: Date;
  /** Campaigns created by this user */
  campaignIds: string[];
  /** Total amount donated */
  totalDonated?: number;
}

// REGION: UI State Types

/**
 * Chain selection for multi-chain operations
 */
export type SupportedChain = "Ethereum" | "Solana" | "Bitcoin";

/**
 * Donation form state
 */
export interface DonationFormData {
  amount: number;
  chain: SupportedChain;
  donorName: string;
  memo?: string;
}

/**
 * Campaign creation form state
 */
export interface CampaignFormData {
  title: string;
  description: string;
  goal: number;
  chains: SupportedChain[];
}

// REGION: API Response Types

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * Campaign list response with pagination
 */
export interface CampaignsResponse {
  campaigns: Campaign[];
  total: number;
  page: number;
  limit: number;
}

// REGION: Contract Integration Types

/**
 * Blockchain transaction result
 */
export interface TransactionResult {
  txHash: string;
  blockNumber?: number;
  gasUsed?: string;
  status: "pending" | "confirmed" | "failed";
}

/**
 * Contract function parameters for donations
 */
export interface DonateParams {
  campaignId: string;
  amount: bigint;
  chain: SupportedChain;
  memo?: string;
}

// REGION: AI Integration Types

/**
 * AI intent parsing result
 */
export interface ParsedIntent {
  intent: "donate" | "create" | "edit" | "query";
  confidence: number;
  args: Record<string, unknown>;
  validation: {
    isValid: boolean;
    errors: string[];
  };
}
