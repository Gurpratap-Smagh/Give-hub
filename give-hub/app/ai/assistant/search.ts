// app/ai/assistant/search.ts
import { MongoClient } from "mongodb";
import { db } from "@/lib/db"; // DB adapter (mock JSON or Mongo)
import type { Campaign } from "@/lib/db";

export type CampaignRow = { id: string; title: string; category: string; goal: number; raised: number };

function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

let mongoClientPromise: Promise<MongoClient> | null = null;
async function getMongo(): Promise<MongoClient> {
  if (!mongoClientPromise) {
    mongoClientPromise = new MongoClient(process.env.MONGODB_URI as string, {
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 5000),
      socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS || 20000),
    }).connect();
  }
  return mongoClientPromise;
}

// Mongo implementation (broad by default, honors titleOnly + category/title filters)
async function mongoSearch(
  q: string,
  limit: number,
  extras?: { category?: string; title?: string; creatorUsername?: string; titleOnly?: boolean; sortBy?: string; sortOrder?: string }
): Promise<CampaignRow[]> {
  const client = await getMongo();
  const dbm = client.db(process.env.MONGODB_DB || "Give-hub");
  const col = dbm.collection("campaigns"); // change if your collection differs

  const rx = new RegExp(escapeRegExp(q), "i");
  const or = extras?.titleOnly
    ? [{ title: rx }, { name: rx }]
    : [
        { title: rx },
        { name: rx },
        { category: rx },
        { description: rx },
        { tags: rx },
        { id: rx },
        { slug: rx },
        { 'creator.username': rx },
      ];

  const and: Array<Record<string, unknown>> = [];
  if (extras?.category) and.push({ category: new RegExp(escapeRegExp(extras.category), "i") });
  if (extras?.title)    and.push({ title:    new RegExp(escapeRegExp(extras.title), "i") });
  if (extras?.creatorUsername) and.push({ 'creator.username': new RegExp(escapeRegExp(extras.creatorUsername), 'i') });

  const filter = and.length ? { $and: [{ $or: or }, ...and] } : { $or: or };

  const queryTimeout = Number(process.env.MONGO_QUERY_TIMEOUT_MS || 5000);
  const docs = await col.find(filter, {
    projection: { _id: 1, id: 1, slug: 1, title: 1, name: 1, category: 1, goal: 1, target: 1, raised: 1, amountRaised: 1 }
  }).maxTimeMS(queryTimeout).limit(Math.min(Math.max(limit, 1), 10)).toArray();

  type RawCampaign = {
    _id?: { toString?: () => string } | unknown;
    id?: string;
    slug?: string;
    title?: string;
    name?: string;
    category?: string;
    goal?: number;
    target?: number;
    raised?: number;
    amountRaised?: number;
  };

  function hasToString(x: unknown): x is { toString: () => string } {
    return !!x && typeof x === 'object' && 'toString' in (x as Record<string, unknown>) && typeof (x as { toString: unknown }).toString === 'function';
  }

  return docs.map((d: RawCampaign) => {
    const id = d.id
      || d.slug
      || (hasToString(d._id) ? d._id.toString() : String(d._id));
    return {
      id,
      title: d.title || d.name || "(untitled)",
      category: d.category || "uncategorized",
      goal: Number(d.goal ?? d.target ?? 0),
      raised: Number(d.raised ?? d.amountRaised ?? 0),
    };
  });
}

// Adapter implementation using our lib/db (broad by default, honors titleOnly + category/title filters where possible)
async function prismaSearch(
  q: string,
  limit: number,
  extras?: { category?: string; title?: string; creatorUsername?: string; titleOnly?: boolean; sortBy?: string; sortOrder?: string }
): Promise<CampaignRow[]> {
  const query: Record<string, unknown> & { q?: string } = { q };
  if (extras?.category) query.category = { $regex: extras.category, $options: 'i' };
  if (extras?.title) query.title = { $regex: extras.title, $options: 'i' };
  if (extras?.creatorUsername) query['creator.username'] = { $regex: extras.creatorUsername, $options: 'i' };

  const { campaigns } = await db.searchCampaignsAdvanced(query as Partial<Campaign> & { q?: string }, {
    limit: Math.min(Math.max(limit || 10, 1), 10),
  });

  return campaigns.map((c) => ({
    id: c.id,
    title: c.title || "(untitled)",
    category: (c as Campaign).category || "uncategorized",
    goal: Number((c as Campaign).goal ?? 0),
    raised: Number((c as Campaign).raised ?? 0),
  }));
}

// Router search delegator
export async function searchCampaigns(
  q: string,
  limit: number,
  extras?: { category?: string; title?: string; creatorUsername?: string; titleOnly?: boolean; sortBy?: string; sortOrder?: string }
): Promise<CampaignRow[]> {
  if (process.env.USE_MONGODB === "true") return mongoSearch(q, limit, extras);
  // else Prisma
  return prismaSearch(q, limit, extras);
}
