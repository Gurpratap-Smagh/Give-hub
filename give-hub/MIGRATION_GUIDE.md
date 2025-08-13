# GiveHub Migration Guide

This document outlines the three-phase migration plan for transitioning GiveHub from a mock system to a production-ready platform with MongoDB, Smart Contracts, and AI integration.

## Current Architecture

GiveHub currently uses a JSON-based mock database system with the following components:
- **Mock Database**: JSON files in `lib/mock-db/` for users, campaigns, and donations
- **Mock Authentication**: JWT tokens with bcrypt password hashing
- **Mock Payments**: Simulated payment processing with local state updates
- **Search System**: Optimized parameter-based search with MongoDB-compatible indexing, text search, and advanced filtering with pagination support

## Phase 1: MongoDB Migration

### Overview
Replace the JSON-based mock database with MongoDB for persistent, scalable data storage.

### Migration Steps

#### 1.1 Database Setup
```bash
# Install MongoDB dependencies
npm install mongodb mongoose @types/mongodb

# Set up MongoDB connection
# Update .env.local with MongoDB connection string
MONGODB_URI=mongodb://localhost:27017/givehub
# or MongoDB Atlas: mongodb+srv://username:password@cluster.mongodb.net/givehub
```

#### 1.2 Schema Migration
- **Replace**: `lib/mock-db/database.ts` → `lib/db/mongodb.ts`
- **Create**: Mongoose schemas in `lib/db/schemas/`
  - `user.schema.ts` - User and Creator models
  - `campaign.schema.ts` - Campaign model with embedded donations
  - `donation.schema.ts` - Donation transaction records

#### 1.3 API Migration
**Files to Update:**
- `app/api/auth/*/route.ts` - Replace `db.findUserByEmail()` with MongoDB queries
- `app/api/campaigns/*/route.ts` - Replace `db.searchCampaigns()` with MongoDB text indexes and aggregation pipelines
- `app/api/payments/route.ts` - Replace `db.createDonation()` with MongoDB transactions
- `app/api/profile/route.ts` - Replace user update operations
- **New**: `lib/db/search-index.ts` - MongoDB text indexes and compound indexes for optimized search

**Key Changes:**
```typescript
// Before (Mock)
const user = db.findUserByEmail(email)
const campaigns = db.searchCampaigns({ q: 'search term' })

// After (MongoDB)
const user = await User.findOne({ email })
const campaigns = await Campaign.find({
  $or: [
    { title: { $regex: searchTerm, $options: 'i' } },
    { description: { $regex: searchTerm, $options: 'i' } },
    { category: { $regex: searchTerm, $options: 'i' } }
  ]
}).limit(limit).skip(skip)

// With MongoDB text indexes
const campaigns = await Campaign.find(
  { $text: { $search: searchTerm } },
  { score: { $meta: 'textScore' } }
).sort({ score: { $meta: 'textScore' } })
```

#### 1.4 Search Migration
- **Update**: `app/page.tsx` to use the new `searchCampaignsAdvanced` method with pagination
- **Implement**: Server-side pagination and sorting controls
- **Create**: MongoDB text indexes on `title`, `description`, and `category` fields for efficient search

## Phase 2: Smart Contract & Web3 Integration

### Overview
Replace mock payment and campaign logic with real smart contract interactions on Ethereum or Solana.

### Migration Steps

#### 2.1 Wallet Integration
- **Implement**: Wallet connection (MetaMask, Phantom) using libraries like `web3-react` or `wagmi`
- **Update**: `lib/auth-context.tsx` to manage wallet connection state

#### 2.2 Smart Contract Integration
**Components to Update:**
- `lib/contracts.ts` - Replace mock contract functions with real Web3.js/ethers.js integration
- `app/api/campaigns/[id]/route.ts` - Fetch real campaign data from blockchain
- `app/api/donate/route.ts` - Process actual blockchain transactions
- **New**: `lib/db/blockchain-sync.ts` - Sync blockchain data with MongoDB for hybrid search

**Migration Steps:**
1. **Deploy Smart Contracts** to Ethereum/Solana
2. **Update Contract Functions**:
   ```typescript
   // Before (Mock)
   export async function getCampaignData(campaignId: string) {
     return mockData
   }
   
   // After (Smart Contracts)
   export async function getCampaignData(campaignId: string) {
     const contract = new ethers.Contract(contractAddress, abi, provider)
     const campaignData = await contract.getCampaign(campaignId)
     
     // Sync with MongoDB for search optimization
     await Campaign.findOneAndUpdate(
       { id: campaignId },
       { $set: { ...campaignData, lastSynced: new Date() } }
     )
     
     return campaignData
   }
   ```

## Phase 3: AI Integration

### Overview
Integrate real AI models for features like campaign description generation and personalized recommendations.

### Migration Steps

#### 3.1 AI Service Integration
- **Replace**: `lib/ai.ts` with calls to a real AI service (e.g., OpenAI, Hugging Face)
- **Update**: `.env.local` with AI service API keys

#### 3.2 Feature Implementation
- **Campaign Generation**: Update `app/create/page.tsx` to use the real AI service for generating campaign descriptions
- **Personalized Recommendations**: Create a new API endpoint (`app/api/recommendations/route.ts`) to provide personalized campaign recommendations based on user data and AI models
