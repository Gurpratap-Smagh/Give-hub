# GiveHub Migration Guide

## Overview
This guide provides step-by-step instructions for migrating from the JSON mock database to production-ready storage systems: AI agent storage, Metachain integration, or MongoDB.

## Status: Only the "Big 3" left
The template is migration-ready. The remaining work is limited to swapping the data layer for the following "Big 3":

- AI Agent (knowledge store/query + optional generation hooks)
- Metachain transactions (on-chain reads/writes for donations and proofs)
- MongoDB (primary database)

All swap points are centralized and referenced below. No repository structure changes are required.

## Current Architecture
- **Mock Database**: JSON files in `_dev/mock-db/`
- **Authentication**: JWT tokens with HTTP-only cookies
- **API Routes**: RESTful endpoints in `app/api/`
- **Frontend**: Next.js 15 with Server Components

## Swap Points Map (Group by concern)

1) Data access layer (DB)
- Primary facade: `lib/mock-db/database.ts` (currently JSON-based)
- Usage pattern: All API routes import a `db`-like interface and call methods such as `getAllCampaigns()`, `findUserById()`, `createCampaign()`, `updateCampaign()`, `searchCampaigns()`
- Swap action: Replace the implementation of `db` with MongoDB or AI-backed versions while preserving the same method signatures

2) Authentication (already production-ready libs in place)
- JWT: `lib/auth.ts` (uses `jsonwebtoken`), bcrypt installed and wired
- API usage: `app/api/auth/*`, `app/api/profile/route.ts`
- No structural changes required for migrations below

3) Transactions and on-chain reads (Metachain)
- Smart contract client location: `lib/metachain/` (scaffold in this guide)
- Integration points: donation create/read flows in API and any on-chain proof hooks used by campaign components
- Swap action: Route donation write/read to Metachain client and persist resulting tx metadata via selected DB (MongoDB or AI)

4) Search
- Current: phrase-based, parameter-specific in `app/page.tsx`, with optimized helpers in `lib/mock-db/database.ts`
- Swap action: For MongoDB, use text/compound indexes; for AI Agent, route queries through client adapter preserving the same search function signature

5) Media (unchanged here)
- Profile and campaign images currently base64 in JSON; when moving to production, switch to cloud storage (S3/Cloudinary) by swapping only the storage calls while keeping API contract unchanged

## Migration Paths

### 1. MongoDB Migration (Recommended)

#### Step 1: Install Dependencies
```bash
npm install mongodb mongoose
npm install --save-dev @types/mongoose
```

#### Step 2: Create MongoDB Schema
Create `lib/mongodb/models/`:

```typescript
// lib/mongodb/models/user.ts
import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'creator'], default: 'user' },
  profilePicture: { type: String },
  createdCampaigns: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' }],
  createdAt: { type: Date, default: Date.now }
});

export const User = mongoose.models.User || mongoose.model('User', UserSchema);
```

#### Step 3: Replace Database Operations
Replace `lib/mock-db/database.ts` with MongoDB operations:

```typescript
// lib/mongodb/database.ts
import { User } from './models/user';
import { Campaign } from './models/campaign';
import { Donation } from './models/donation';

export const db = {
  // User operations
  findUserById: async (id: string) => User.findById(id),
  findUserByEmail: async (email: string) => User.findOne({ email }),
  findUserByUsername: async (username: string) => User.findOne({ username }),
  createUser: async (userData: any) => User.create(userData),
  
  // Campaign operations
  getAllCampaigns: async () => Campaign.find().populate('creatorId'),
  findCampaignById: async (id: string) => Campaign.findById(id).populate('creatorId'),
  createCampaign: async (campaignData: any) => Campaign.create(campaignData),
  updateCampaign: async (id: string, data: any) => Campaign.findByIdAndUpdate(id, data, { new: true }),
  deleteCampaign: async (id: string) => Campaign.findByIdAndDelete(id),
  
  // Search operations
  searchCampaigns: async (query: any) => {
    const searchQuery: any = {};
    if (query.q) {
      searchQuery.$or = [
        { title: { $regex: query.q, $options: 'i' } },
        { description: { $regex: query.q, $options: 'i' } }
      ];
    }
    if (query.category) searchQuery.category = query.category;
    return Campaign.find(searchQuery).populate('creatorId');
  }
};
```

#### Step 4: Update Environment Variables
```bash
# .env.local
MONGODB_URI=mongodb://localhost:27017/givehub
JWT_SECRET=your-secret-key
```

### 2. AI Agent Integration

#### Step 1: Create AI Agent Client
```typescript
// lib/ai-agent/client.ts
export class AIAgentClient {
  private baseUrl: string;
  
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }
  
  async query(query: string, context?: any) {
    const response = await fetch(`${this.baseUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, context })
    });
    return response.json();
  }
  
  async store(data: any, type: string) {
    const response = await fetch(`${this.baseUrl}/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, type })
    });
    return response.json();
  }
}
```

#### Step 2: Replace Database Layer
```typescript
// lib/ai-agent/database.ts
import { AIAgentClient } from './client';

const aiClient = new AIAgentClient(process.env.AI_AGENT_URL!);

export const db = {
  async findUserById(id: string) {
    return aiClient.query(`find user by id ${id}`, { type: 'user' });
  },
  
  async createCampaign(campaignData: any) {
    return aiClient.store(campaignData, 'campaign');
  },
  
  async searchCampaigns(query: any) {
    return aiClient.query(`search campaigns with ${JSON.stringify(query)}`, { type: 'campaign' });
  }
};
```

### 3. Metachain Integration

#### Step 1: Create Metachain Client
```typescript
// lib/metachain/client.ts
export class MetachainClient {
  private rpcUrl: string;
  private contractAddress: string;
  
  constructor(rpcUrl: string, contractAddress: string) {
    this.rpcUrl = rpcUrl;
    this.contractAddress = contractAddress;
  }
  
  async read(method: string, params?: any[]) {
    // Implementation for reading from smart contract
  }
  
  async write(method: string, params?: any[]) {
    // Implementation for writing to smart contract
  }
}
```

## Migration Checklist

### Pre-Migration
- [ ] Backup current JSON mock database files
- [ ] Document all custom business logic
- [ ] Create comprehensive test suite
- [ ] Set up monitoring and logging

### Migration Steps
1. **Database Layer**: Replace `lib/mock-db/database.ts`
2. **API Routes**: Update all endpoints to use new database layer
3. **Authentication**: Replace JWT verification with production auth
4. **File Storage**: Move from base64 to cloud storage (S3, Cloudinary)
5. **Testing**: Run comprehensive integration tests
6. **Monitoring**: Set up error tracking and performance monitoring

### Post-Migration
- [ ] Performance testing with production data
- [ ] Security audit and penetration testing
- [ ] Load testing with realistic traffic
- [ ] Backup and disaster recovery testing

## API Compatibility
The migration maintains 100% API compatibility. All existing endpoints will continue to work:

- `GET /api/campaigns` - List campaigns
- `POST /api/campaigns` - Create campaign
- `PUT /api/campaigns/[id]/edit` - Edit campaign
- `GET /api/auth/me` - Get current user
- `POST /api/auth/signup` - User registration
- `POST /api/auth/signin` - User authentication

## Migration Scripts

### MongoDB Migration Script
```bash
#!/bin/bash
# migrate-to-mongodb.sh

# Install dependencies
npm install mongodb mongoose

# Run migration
node scripts/migrate-mock-to-mongodb.js

# Verify migration
npm run test:integration
```

### Rollback Plan
```bash
#!/bin/bash
# rollback.sh

# Revert to mock database
git checkout HEAD~1 -- lib/mock-db/
npm run dev
```

## Testing Strategy

### Unit Tests
```bash
npm run test:unit
```

### Integration Tests
```bash
npm run test:integration
```

### End-to-End Tests
```bash
npm run test:e2e
```

## Support
For migration support:
- Check the troubleshooting section below
- Review the example implementations in `examples/`
- Contact the development team via GitHub issues

## Troubleshooting

### Common Issues
1. **Connection Timeouts**: Check MongoDB connection string
2. **CORS Errors**: Verify API endpoints are accessible
3. **Authentication Failures**: Check JWT secret configuration
4. **Data Migration**: Ensure all JSON data is properly formatted

### Debug Commands
```bash
# Check database connection
npm run db:status

# Validate data integrity
npm run db:validate

# Performance profiling
npm run db:profile
```
