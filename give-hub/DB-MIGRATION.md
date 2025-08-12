# GiveHub: JSON Mock DB to MongoDB Migration (Minimal Downtime)

This guide helps you migrate from the current JSON-based mock DB in `lib/mock-db/` to MongoDB with minimal code changes and downtime.

## Goals
- Keep all TypeScript interfaces stable.
- Swap file I/O for MongoDB queries behind the same API.
- No large refactors across pages/components.
- Preserve AI and Web3 placeholders.

## Current Structure
- `lib/mock-db/database.ts` — CRUD over JSON files
- `lib/mock-db/users.json`, `campaigns.json`, `donations.json` — data files
- API routes use the above module, e.g., `app/api/campaigns/route.ts`, `app/api/profile/route.ts`

## Migration Strategy
1. Create a MongoDB-backed implementation that mirrors the existing interface from `database.ts`.
2. Add a simple environment switch to choose JSON vs MongoDB at runtime.
3. Cut over per environment (dev, staging, prod) by setting env vars.

## Step-by-Step

1) Add Dependencies
- Install MongoDB Node driver or Mongoose.
- Recommended: Mongoose for schemas and validation.

```bash
npm install mongoose
```

2) Create `lib/db/mongo.ts`
- Expose a connection util and repository methods that mirror `MockDatabase` methods:
  - `findUserById(id)`
  - `createUser(userData)`
  - `updateUser(id, partial)`
  - `getAllCampaigns()`
  - `createCampaign(data)`
  - `updateCampaign(id, partial)`
  - etc.

3) Define Mongoose Schemas
- Mirror existing interfaces from `lib/mock-db/database.ts`.
- Use the same field names to avoid refactors.
- Example fields: `User.profilePicture`, `User.walletAddresses`, `Campaign.creatorId`, `Campaign.image`, `Campaign.category`, `Campaign.chains`, etc.

4) Add a DB Provider Switch
- Create `lib/db/index.ts` to export a single `db` that proxies to either JSON (`lib/mock-db/database.ts`) or Mongo (`lib/db/mongo.ts`).
- Choose provider via env var, for example:

```ts
const provider = process.env.DB_PROVIDER || 'json' // 'json' | 'mongo'
```

- Update imports in API routes to use `import { db } from '@/lib/db'` instead of importing the JSON mock directly.

5) Gradual Cutover
- Dev: Keep `DB_PROVIDER=json`.
- Staging: Set `DB_PROVIDER=mongo` with a seeded database.
- Prod: After validation, set `DB_PROVIDER=mongo`.

6) Data Migration Script
- Write a one-off script `scripts/migrate-json-to-mongo.ts`:
  - Reads JSON files from `lib/mock-db/*.json`.
  - Inserts users, campaigns, donations into MongoDB collections.
  - Preserves IDs if possible (or store legacyId mapping).

7) Validation
- Run regression tests (manual/automated) against staging.
- Verify:
  - Login and profile GET/PUT work.
  - Campaigns GET/POST/PUT edit work.
  - Creator linkage (`creatorId`, `createdCampaigns`) correct.
  - Images and wallet placeholders persist.

8) Cutover + Cleanup
- Flip `DB_PROVIDER` to `mongo` in production.
- Monitor logs and roll back env var if needed.
- After stability, remove `lib/mock-db/` and JSON files if desired.

## Notes and Tips
- Keep IDs stable to avoid re-linking user-created resources.
- Start with Mongoose schemas that accept current shapes; add stricter validation later.
- For images (base64), consider moving to object storage later; initial migration can keep base64 in Mongo.
- Web3 and AI placeholders remain unchanged and can be implemented after DB migration.

## Example Import Surface (unchanged)
Your API routes should ideally import a single `db` entry point:

```ts
// BEFORE
import { db } from '@/lib/mock-db/database'

// AFTER (same shape)
import { db } from '@/lib/db'
```

The `db` instance should expose the same methods so the rest of the app remains unchanged.
