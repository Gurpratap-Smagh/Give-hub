# Mock Database System

This directory contains a JSON-based mock database system that serves as a placeholder for MongoDB in development.

## Structure

- **`users.json`** - User and creator data storage
- **`campaigns.json`** - Campaign data storage  
- **`donations.json`** - Donation data storage
- **`database.ts`** - Database manager with CRUD operations

## Usage

```typescript
import { db } from './mock-db/database';

// User operations
const user = db.findUserByEmail('john@example.com');
const newUser = db.createUser({ username: 'test', email: 'test@example.com', password: 'hash', role: 'user' });

// Campaign operations
const campaigns = db.getAllCampaigns();
const campaign = db.findCampaignById('1');

// Donation operations
const donations = db.getDonationsByCampaign('1');
```

## Migration to MongoDB

When ready to migrate to MongoDB:

1. Replace `database.ts` with MongoDB connection and models
2. Replace JSON file operations with MongoDB operations
3. Keep the same interface for seamless migration
4. Delete this entire `mock-db/` directory

## Notes

- All timestamps are stored as ISO strings in JSON for compatibility
- The database manager converts them to Date objects for the public API
- All auth flow and backend restrictions are preserved
- File operations are synchronous for simplicity (MongoDB will be async)
