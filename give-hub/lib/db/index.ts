// Central DB toggle module
// Exports `db` and re-exports common types
// By default uses the mock JSON DB; set USE_MONGODB=true to switch to Mongo adapter

const useMongo = process.env.USE_MONGODB === 'true';

let db: any;

if (useMongo) {
  // Defer import so environments without Mongoose can still build
  // If MongoDB env is misconfigured, we throw on first usage
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  db = require('../mongodb/database').mongoDb;
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  db = require('@/_dev/mock-db/database').db;
}

export { db };
export type { UserRole, User, Creator, Campaign, Donation } from '@/_dev/mock-db/database';
