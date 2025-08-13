export interface User {
  id: string;
  name: string;
  email: string;
  profilePicture?: string;
  walletAddresses: { chain: string; address: string }[];
  role: 'user' | 'creator';
  createdAt: string; 
  updatedAt: string;
}

export interface Creator extends User {
  username: string;
  bio: string;
  createdCampaigns: string[]; 
}

export interface Campaign {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  goal: number;
  raised: number;
  image: string; 
  category?: string;
  createdAt: string;
  updatedAt: string;
  donations: Donation[];
  chains: string[];
  contractOwnership: { chain: string; address: string }[];
}

export interface Donation {
  id: string;
  userId: string;
  campaignId: string;
  amount: number;
  timestamp: string;
}
