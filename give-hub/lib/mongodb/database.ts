import { connectMongo } from './connection';
import { UserModel } from './models/user';
import { CampaignModel } from './models/campaign';
// Donations are embedded in Campaign.donations array

// Import types from mock for compatibility
import type { User, Creator, Campaign, Donation } from '@/lib/db';

function toUser(doc: Record<string, unknown> | null): (User | Creator) | null {
  if (!doc) return null;
  const idRaw = doc['id'] ?? doc['_id'];
  const createdAtRaw = doc['createdAt'];
  const updatedAtRaw = doc['updatedAt'];
  const roleRaw = doc['role'];
  const base: Record<string, unknown> = {
    id: typeof idRaw === 'string' ? idRaw : String(idRaw),
    username: doc['username'] as string | undefined,
    email: typeof doc['email'] === 'string' ? doc['email'] : String(doc['email'] ?? ''),
    password: doc['password'] as string | undefined,
    role: typeof roleRaw === 'string' ? roleRaw : String(roleRaw ?? ''),
    createdAt: createdAtRaw instanceof Date
      ? createdAtRaw.toISOString()
      : (typeof createdAtRaw === 'string' ? createdAtRaw : new Date().toISOString()),
    updatedAt: updatedAtRaw instanceof Date
      ? updatedAtRaw.toISOString()
      : (typeof updatedAtRaw === 'string' ? updatedAtRaw : new Date().toISOString()),
    profilePicture: doc['profilePicture'] as string | undefined,
    bio: doc['bio'] as string | undefined,
    location: doc['location'] as string | undefined,
    website: doc['website'] as string | undefined,
    walletAddresses: doc['walletAddresses'] as unknown,
    donatedCampaigns: Array.isArray(doc['donatedCampaigns']) ? (doc['donatedCampaigns'] as string[]) : [],
    totalDonated: typeof doc['totalDonated'] === 'number' ? (doc['totalDonated'] as number) : 0,
    preferredChains: Array.isArray(doc['preferredChains']) ? (doc['preferredChains'] as string[]) : [],
  };
  if (base.role === 'creator') {
    base.createdCampaigns = Array.isArray(doc['createdCampaigns']) ? (doc['createdCampaigns'] as string[]) : [];
    base.totalRaised = typeof doc['totalRaised'] === 'number' ? (doc['totalRaised'] as number) : 0;
    base.verificationStatus = typeof doc['verificationStatus'] === 'string' ? (doc['verificationStatus'] as string) : 'pending';
    base.socialLinks = (typeof doc['socialLinks'] === 'object' && doc['socialLinks'] !== null)
      ? (doc['socialLinks'] as Record<string, string>)
      : {};
  }
  return base as User | Creator;
}

function toCampaign(doc: Record<string, unknown> | null): Campaign | null {
  if (!doc) return null;
  const idRaw = doc['id'] ?? doc['_id'];
  const createdAtRaw = doc['createdAt'];
  const updatedAtRaw = doc['updatedAt'];
  const onChainRaw = doc['onChain'];
  const ownershipRaw = doc['contractOwnership'];
  const donationsRaw = doc['donations'];
  return {
    id: typeof idRaw === 'string' ? idRaw : String(idRaw),
    uuid: doc['uuid'] as string | undefined,
    title: doc['title'] as string,
    goal: typeof doc['goal'] === 'number' ? (doc['goal'] as number) : Number(doc['goal'] ?? 0),
    raised: typeof doc['raised'] === 'number' ? (doc['raised'] as number) : Number(doc['raised'] ?? 0),
    chains: Array.isArray(doc['chains']) ? (doc['chains'] as string[]) : [],
    description: doc['description'] as string,
    category: doc['category'] as string | undefined,
    creatorId: doc['creatorId'] as string,
    creatorAddress: doc['creatorAddress'] as string | undefined,
    image: doc['image'] as string,
    // Normalize to array of ownership records for unified type
    contractOwnership: Array.isArray(ownershipRaw)
      ? (ownershipRaw as unknown[])
      : (ownershipRaw ? [ownershipRaw] : []),
    active: Boolean(doc['active']),
    // Ensure on-chain mapping is surfaced in responses
    onChain: (onChainRaw && typeof onChainRaw === 'object') ? {
      chainId: Number((onChainRaw as Record<string, unknown>)['chainId']),
      contract: String((onChainRaw as Record<string, unknown>)['contract']),
      campaignId: String((onChainRaw as Record<string, unknown>)['campaignId']),
    } : undefined,
    verified: Boolean(doc['verified']),
    contractAddress: doc['contractAddress'] as string | undefined,
    blockchainProof: doc['blockchainProof'] as string | undefined,
    // Required timestamps as ISO strings
    createdAt: createdAtRaw instanceof Date
      ? createdAtRaw.toISOString()
      : (typeof createdAtRaw === 'string' ? createdAtRaw : new Date().toISOString()),
    updatedAt: updatedAtRaw instanceof Date
      ? updatedAtRaw.toISOString()
      : (typeof updatedAtRaw === 'string' ? updatedAtRaw : new Date().toISOString()),
    // Donations array (schema stores embedded donations)
    donations: Array.isArray(donationsRaw) ? (donationsRaw as unknown[]) : [],
  } as Campaign;
}

// Donations are embedded on Campaign; construct DTOs inline when needed
type DonationEmbedded = { name: string; amount: number; chain: string; timestamp?: Date; txHash?: string };

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
    const { createdAt: _createdAt, updatedAt: _updatedAt, donations: _donations, contractOwnership, ...rest } = (campaignData as unknown) as {
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
    const mongoQuery: Record<string, unknown> = {};
    if (query.q) {
      mongoQuery.$text = { $search: query.q };
    }
    // Map simple equality filters
    const keys: (keyof Campaign)[] = ['title','category','creatorId'];
    for (const k of keys) {
      const v = (query as Record<string, unknown>)[k as string];
      if (v !== undefined) mongoQuery[k as string] = v;
    }
    // Support numeric range filters
    if ((query as Record<string, unknown>).goal !== undefined) {
      mongoQuery.goal = (query as Record<string, unknown>).goal as unknown;
    }
    if ((query as Record<string, unknown>).raised !== undefined) {
      mongoQuery.raised = (query as Record<string, unknown>).raised as unknown;
    }
    const docs = await CampaignModel.find(mongoQuery).lean();
    return docs.map(toCampaign) as Campaign[];
  },
  async searchCampaignsAdvanced(
    query: Partial<Campaign> & { q?: string },
    options?: { limit?: number; skip?: number; sort?: { [key: string]: 1 | -1 } }
  ): Promise<{ campaigns: Campaign[]; total: number }> {
    await connectMongo();
    const mongoQuery: Record<string, unknown> = {};
    if (query.q) mongoQuery.$text = { $search: query.q };
    const keys: (keyof Campaign)[] = ['title','category','creatorId'];
    for (const k of keys) {
      const v = (query as Record<string, unknown>)[k as string];
      if (v !== undefined) mongoQuery[k as string] = v;
    }
    // Support numeric range filters
    if ((query as Record<string, unknown>).goal !== undefined) {
      mongoQuery.goal = (query as Record<string, unknown>).goal as unknown;
    }
    if ((query as Record<string, unknown>).raised !== undefined) {
      mongoQuery.raised = (query as Record<string, unknown>).raised as unknown;
    }
    let q = CampaignModel.find(mongoQuery);
    if (options?.sort) q = q.sort(options.sort as Record<string, 1 | -1>);
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
        txHash: d.txHash,
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
          txHash: (d as DonationEmbedded).txHash,
        } as Donation);
      }
    }

    // newest first
    out.sort((a, b) => (b.timestamp as Date).getTime() - (a.timestamp as Date).getTime());
    return out;
  },
  async createDonation(donationData: Omit<Donation, 'timestamp'> & { timestamp?: Date }): Promise<Donation> {
    await connectMongo();
    const donation: DonationEmbedded = {
      name: donationData.name,
      amount: donationData.amount,
      chain: donationData.chain,
      timestamp: donationData.timestamp ?? new Date(),
      txHash: donationData.txHash,
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