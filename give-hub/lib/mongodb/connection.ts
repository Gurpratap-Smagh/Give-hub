import mongoose from 'mongoose';

// Cache the connection in the global scope to avoid re-connecting in dev HMR
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __mongooseCache: MongooseCache | undefined;
}

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB = process.env.MONGODB_DB || 'givehub';

export async function connectMongo() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not set. Please set it in your environment to enable MongoDB.');
  }

  if (!global.__mongooseCache) {
    global.__mongooseCache = { conn: null, promise: null };
  }

  if (global.__mongooseCache.conn) {
    return global.__mongooseCache.conn;
  }

  if (!global.__mongooseCache.promise) {
    mongoose.set('strictQuery', true);
    global.__mongooseCache.promise = mongoose.connect(MONGODB_URI, {
      dbName: MONGODB_DB,
    });
  }
  global.__mongooseCache.conn = await global.__mongooseCache.promise;
  return global.__mongooseCache.conn;
}
