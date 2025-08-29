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

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://gurpratap2007:zjAXp18jZUygmdha@cluster0.josmz1h.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
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
    // Add explicit timeouts to avoid indefinite hangs during server selection or I/O
    // These can be tuned via env if needed
    const serverSelectionTimeoutMS = Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || '5000');
    const socketTimeoutMS = Number(process.env.MONGO_SOCKET_TIMEOUT_MS || '20000');
    const connectTimeoutMS = Number(process.env.MONGO_CONNECT_TIMEOUT_MS || '10000');
    const maxPoolSize = Number(process.env.MONGO_MAX_POOL_SIZE || '10');

    global.__mongooseCache.promise = mongoose.connect(MONGODB_URI, {
      dbName: MONGODB_DB,
      serverSelectionTimeoutMS,
      socketTimeoutMS,
      connectTimeoutMS,
      maxPoolSize,
      family: 4, // prefer IPv4 to avoid IPv6 DNS issues that can hang in some envs
    });
  }
  global.__mongooseCache.conn = await global.__mongooseCache.promise;
  return global.__mongooseCache.conn;
}
