// lib/db/campaigns.search.ts
import mongoose, { Schema, models, model, type FilterQuery, type ProjectionType } from "mongoose";

// Module-scoped connection cache (avoid global any)
let cachedConn: typeof mongoose | null = null;
let cachedPromise: Promise<typeof mongoose> | null = null;

async function connectMongo() {
  if (cachedConn) return cachedConn;
  if (!cachedPromise) {
    const uri = process.env.MONGODB_URI!;
    cachedPromise = mongoose.connect(uri, { dbName: process.env.MONGODB_DB || undefined });
  }
  cachedConn = await cachedPromise;
  return cachedConn;
}

const CampaignSchema = new Schema(
  {
    title: { type: String, index: "text" },
    category: String,
    creatorId: String,
    goal: Number,
    raised: Number,
    createdAt: { type: Date, default: Date.now }
  },
  { collection: "campaigns" }
);

// Avoid OverwriteModelError in dev
const Campaign = models.Campaign || model("Campaign", CampaignSchema);

// Lean document shape used in this helper
type CampaignDoc = {
  _id: mongoose.Types.ObjectId | string;
  title?: string;
  category?: string;
  creatorId?: string;
  goal?: number;
  raised?: number;
  createdAt?: Date;
};

export type SearchQuery = {
  q?: string;
  title?: string;
  category?: string;
  creatorId?: string;
  goal?: number | { min?: number; max?: number };
  raised?: number | { min?: number; max?: number };
  limit?: number;
};

export async function searchCampaignsMongo(query: SearchQuery) {
  await connectMongo();

  const mongo: FilterQuery<CampaignDoc> = {};
  
  // Handle text search (q) - prioritize exact title matches, then full-text search
  if (query.q) {
    if (!query.title) {
      // If no explicit title filter, use $text search
      (mongo as any).$text = { $search: query.q };
    } else {
      // If title is provided, use it for exact match and q as a fallback filter
      mongo.title = { $regex: query.title, $options: 'i' };
    }
  }

  // Explicit filters (category, creatorId)
  for (const k of ["category", "creatorId"] as const) {
    const v = query[k];
    if (v !== undefined) (mongo as Record<string, unknown>)[k] = v;
  }

  // Handle explicit title filter if provided
  if (query.title && !query.q) {
    mongo.title = { $regex: query.title, $options: 'i' };
  }

  for (const k of ["goal", "raised"] as const) {
    const v = query[k];
    if (v === undefined) continue;
    if (typeof v === "number") {
      (mongo as Record<string, unknown>)[k] = v;
    } else {
      const r: { $gte?: number; $lte?: number } = {};
      if (v.min !== undefined) r.$gte = v.min;
      if (v.max !== undefined) r.$lte = v.max;
      (mongo as Record<string, unknown>)[k] = r;
    }
  }

  const limit = Math.min(Math.max(query.limit ?? 10, 1), 25);

  // Always include textScore for consistent sorting
  const projection: ProjectionType<CampaignDoc> = {
    ...(mongo.$text ? { score: { $meta: "textScore" } } : {})
  } as unknown as ProjectionType<CampaignDoc>;

  let queryExec = Campaign.find(mongo, projection);
  
  // Sort by relevance (if text search) or by newest
  if (mongo.$text) {
    queryExec = queryExec.sort({ score: { $meta: "textScore" } } as any);
  } else {
    queryExec = queryExec.sort({ createdAt: -1 });
  }

  const docs = (await queryExec.limit(limit).lean().exec()) as CampaignDoc[];

  return docs.map((c) => ({
    id: String(c._id),
    title: c.title ?? "",
    category: c.category ?? undefined,
    goal: c.goal ?? 0,
    raised: c.raised ?? 0
  }));
}
