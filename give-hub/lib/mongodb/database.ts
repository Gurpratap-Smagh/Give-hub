import { connectMongo } from './connection';
import { UserModel } from './models/user';
import { CampaignModel } from './models/campaign';
// Donations are embedded in Campaign.donations array

// Import types from mock for compatibility
import type { User, Creator, Campaign, Donation } from '@/lib/db';

function toUser(doc: any | null): (User | Creator) | null {
  if (!doc) return null;
  const base: any = {
    id: doc.id || String(doc._id),
    username: doc.username,
    email: doc.email,
    password: doc.password,
    role: doc.role,
    createdAt: (doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt) || new Date().toISOString(),
    updatedAt: (doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt) || new Date().toISOString(),
    profilePicture: doc.profilePicture,
    bio: doc.bio,
    location: doc.location,
    website: doc.website,
    walletAddresses: doc.walletAddresses,
    donatedCampaigns: doc.donatedCampaigns || [],
    totalDonated: doc.totalDonated || 0,
    preferredChains: doc.preferredChains || [],
  };
  if (doc.role === 'creator') {
    base.createdCampaigns = doc.createdCampaigns || [];
    base.totalRaised = doc.totalRaised || 0;
    base.verificationStatus = doc.verificationStatus || 'pending';
    base.socialLinks = doc.socialLinks || {};
  }
  return base as User | Creator;
}

function toCampaign(doc: any | null): Campaign | null {
  if (!doc) return null;
  return {
    id: doc.id || String(doc._id),
    uuid: doc.uuid,
    title: doc.title,
    goal: doc.goal,
    raised: doc.raised || 0,
    chains: doc.chains || [],
    description: doc.description,
    category: doc.category,
    creatorId: doc.creatorId,
    creatorAddress: doc.creatorAddress,
    image: doc.image,
    // Normalize to array of ownership records for unified type
    contractOwnership: Array.isArray(doc.contractOwnership)
      ? doc.contractOwnership
      : (doc.contractOwnership ? [doc.contractOwnership] : []),
    active: doc.active,
    // Ensure on-chain mapping is surfaced in responses
    onChain: doc.onChain ? {
      chainId: Number(doc.onChain.chainId),
      contract: String(doc.onChain.contract),
      campaignId: String(doc.onChain.campaignId),
    } : undefined,
    verified: !!doc.verified,
    contractAddress: doc.contractAddress,
    blockchainProof: doc.blockchainProof,
    // Required timestamps as ISO strings
    createdAt: (doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt) || new Date().toISOString(),
    updatedAt: (doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt) || new Date().toISOString(),
    // Donations array (schema stores embedded donations)
    donations: Array.isArray(doc.donations) ? doc.donations : [],
  } as Campaign;
}

// Donations are embedded on Campaign; construct DTOs inline when needed
type DonationEmbedded = { name: string; amount: number; chain: string; timestamp?: Date };

function newId(prefix: string) {
  return `${prefix}_${Date.now()}`;
}

export const mongoDb = {
  // User operations
  async findUserByEmail(email: string): Promise<User | Creator | null> {
    await connectMongo();
    const doc = await UserModel.findOne({ email }).lean();
    return toUser(doc);
  },
  async findUserByUsername(username: string): Promise<User | Creator | null> {
    await connectMongo();
    const doc = await UserModel.findOne({ username }).lean();
    return toUser(doc);
  },
  async findUserById(id: string): Promise<User | Creator | null> {
    await connectMongo();
    const doc = await UserModel.findOne({ id }).lean();
    return toUser(doc);
  },
  async createUser(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    await connectMongo();
    const now = new Date();
    const doc = await UserModel.create({ ...userData, id: newId('user'), createdAt: now, updatedAt: now });
    return toUser(doc.toObject()) as User;
  },
  async createCreator(creatorData: Omit<Creator, 'id' | 'createdAt' | 'updatedAt'>): Promise<Creator> {
    await connectMongo();
    const now = new Date();
    const doc = await UserModel.create({ ...creatorData, role: 'creator', id: newId('user'), createdAt: now, updatedAt: now });
    return toUser(doc.toObject()) as Creator;
  },
  async updateUser(id: string, updateData: Partial<User | Creator>): Promise<User | Creator | null> {
    await connectMongo();
    const doc = await UserModel.findOneAndUpdate({ id }, { ...updateData, updatedAt: new Date() }, { new: true }).lean();
    return toUser(doc);
  },
  async deleteUser(id: string): Promise<boolean> {
    await connectMongo();
    const res = await UserModel.deleteOne({ id });
    return res.deletedCount === 1;
  },

  // Campaign operations
  async getAllCampaigns(): Promise<Campaign[]> {
    await connectMongo();
    const docs = await CampaignModel.find({}).lean();
    return docs.map(toCampaign) as Campaign[];
  },
  async findCampaignById(id: string): Promise<Campaign | null> {
    await connectMongo();
    const doc = await CampaignModel.findOne({ id }).lean();
    return toCampaign(doc);
  },
  async createCampaign(campaignData: Omit<Campaign, 'id'>): Promise<Campaign> {
    await connectMongo();
    // Normalize fields from unified type to Mongo schema expectations
    const { createdAt, updatedAt, donations, contractOwnership, ...rest } = (campaignData as unknown) as {
      createdAt?: string;
      updatedAt?: string;
      donations?: unknown;
      contractOwnership?: unknown;
      [k: string]: unknown;
    };
    const ownership = Array.isArray(contractOwnership)
      ? (contractOwnership[0] || undefined)
      : (contractOwnership as unknown | undefined);
    const doc = await CampaignModel.create({
      ...(rest as Record<string, unknown>),
      ...(ownership !== undefined ? { contractOwnership: ownership } : {}),
      id: newId('campaign'),
    });
    return toCampaign(doc.toObject()) as Campaign;
  },
  async updateCampaign(id: string, updateData: Partial<Campaign>): Promise<Campaign | null> {
    await connectMongo();
    const doc = await CampaignModel.findOneAndUpdate({ id }, updateData, { new: true }).lean();
    return toCampaign(doc);
  },
  async searchCampaigns(query: Partial<Campaign> & { q?: string }): Promise<Campaign[]> {
    await connectMongo();
    const mongoQuery: any = {};
    if (query.q) {
      mongoQuery.$text = { $search: query.q };
    }
    // Map simple equality filters
    const keys: (keyof Campaign)[] = ['title','category','creatorId'];
    for (const k of keys) {
      const v = (query as any)[k];
      if (v !== undefined) mongoQuery[k] = v;
    }
    // Support numeric range filters
    if ((query as any).goal !== undefined) {
      mongoQuery.goal = (query as any).goal;
    }
    if ((query as any).raised !== undefined) {
      mongoQuery.raised = (query as any).raised;
    }
    const docs = await CampaignModel.find(mongoQuery).lean();
    return docs.map(toCampaign) as Campaign[];
  },
  async searchCampaignsAdvanced(
    query: Partial<Campaign> & { q?: string },
    options?: { limit?: number; skip?: number; sort?: { [key: string]: 1 | -1 } }
  ): Promise<{ campaigns: Campaign[]; total: number }> {
    await connectMongo();
    const mongoQuery: any = {};
    if (query.q) mongoQuery.$text = { $search: query.q };
    const keys: (keyof Campaign)[] = ['title','category','creatorId'];
    for (const k of keys) {
      const v = (query as any)[k];
      if (v !== undefined) mongoQuery[k] = v;
    }
    // Support numeric range filters
    if ((query as any).goal !== undefined) {
      mongoQuery.goal = (query as any).goal;
    }
    if ((query as any).raised !== undefined) {
      mongoQuery.raised = (query as any).raised;
    }
    let q = CampaignModel.find(mongoQuery);
    if (options?.sort) q = q.sort(options.sort as any);
    if (options?.skip) q = q.skip(options.skip);
    if (options?.limit) q = q.limit(options.limit);
    const [docs, total] = await Promise.all([
      q.lean(),
      CampaignModel.countDocuments(mongoQuery),
    ]);
    return { campaigns: (docs.map(toCampaign) as Campaign[]), total };
  },

  // Donation operations (embedded in Campaign)
  async getDonationsByCampaign(campaignId: string): Promise<Donation[]> {
    await connectMongo();
    const camp = await CampaignModel
      .findOne({ id: campaignId }, { donations: 1, _id: 0 })
      .lean<{ donations?: DonationEmbedded[] }>();
    const donations = camp?.donations || [];
    return donations
      .map(d => ({
        campaignId,
        name: d.name,
        amount: d.amount,
        chain: d.chain,
        timestamp: new Date(d.timestamp ?? Date.now()),
      } as Donation))
      .sort((a, b) => (b.timestamp as Date).getTime() - (a.timestamp as Date).getTime());
  },
  async getAllDonations(): Promise<Donation[]> {
    await connectMongo();
    const camps = await CampaignModel
      .find({}, { id: 1, donations: 1 })
      .lean<Array<{ id: string; donations?: DonationEmbedded[] }>>();
    const out: Donation[] = [];
    for (const c of camps) {
      for (const d of (c.donations || [])) {
        out.push({
          campaignId: c.id,
          name: d.name,
          amount: d.amount,
          chain: d.chain,
          timestamp: new Date(d.timestamp ?? Date.now()),
        } as Donation);
      }
    }
    // newest first
    out.sort((a, b) => (b.timestamp as Date).getTime() - (a.timestamp as Date).getTime());
    return out;
  },
  async createDonation(donationData: Omit<Donation, 'timestamp'> & { timestamp?: Date }): Promise<Donation> {
    await connectMongo();
    const donation = {
      name: donationData.name,
      amount: donationData.amount,
      chain: donationData.chain,
      timestamp: donationData.timestamp ?? new Date(),
    };
    await CampaignModel.updateOne(
      { id: donationData.campaignId },
      { $push: { donations: donation } }
    );
    return {
      campaignId: donationData.campaignId,
      ...donation,
    } as Donation;
  },

  // Helpers
  async getUserStats(userId: string) {
    await connectMongo();
    const user = await UserModel
      .findOne({ id: userId })
      .lean<{
        role: 'user' | 'creator' | string;
        createdCampaigns?: string[];
        totalRaised?: number;
        verificationStatus?: string;
        donatedCampaigns?: string[];
        totalDonated?: number;
        preferredChains?: string[];
      }>();
    if (!user) return null;
    if (user.role === 'creator') {
      return {
        totalCampaigns: (user.createdCampaigns || []).length,
        totalRaised: user.totalRaised || 0,
        verificationStatus: user.verificationStatus || 'pending',
      };
    } else {
      return {
        totalDonations: (user.donatedCampaigns || []).length,
        totalDonated: user.totalDonated || 0,
        preferredChains: user.preferredChains || [],
      };
    }
  },
  async getVerifiedCreators(): Promise<Creator[]> {
    await connectMongo();
    const docs = await UserModel.find({ role: 'creator', verificationStatus: 'verified' }).lean();
    return (docs.map(toUser) as (User | Creator)[]).filter(Boolean).map(u => u as Creator);
  },
  async getRecentUsers(limit: number = 10): Promise<(User | Creator)[]> {
    await connectMongo();
    const docs = await UserModel.find({}).sort({ createdAt: -1 }).limit(limit).lean();
    return (docs.map(toUser) as (User | Creator)[]).filter(Boolean) as (User | Creator)[];
  },
};