// give-hub/tests/payment-api.test.ts
import { POST } from '@/app/api/payments/route';
import { db } from '@/lib/db';
import { toUSD } from '@/lib/prices/converter';
import { NextRequest } from 'next/server';

// Mock the db module
jest.mock('@/lib/db', () => ({
  db: {
    findCampaignById: jest.fn(),
    createDonation: jest.fn(),
    updateCampaign: jest.fn(),
    findUserById: jest.fn(),
    updateUser: jest.fn(),
  },
}));

// Mock the prices module
jest.mock('@/lib/prices/converter', () => ({
  toUSD: jest.fn((amount, symbol) => {
    const prices: { [key: string]: number } = {
      ETH: 4000,
      BTC: 60000,
    };
    return amount * (prices[symbol] || 1);
  }),
}));

describe('/api/payments', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should process a payment successfully and convert amount to USD', async () => {
    // Arrange
    const campaignId = 'campaign-1';
    const amount = 2;
    const chain = 'ETH';
    const donorName = 'John Doe';
    const requestBody = { campaignId, amount, chain, donorName };

    const campaign = {
      id: campaignId,
      raised: 1000,
      goal: 5000,
      chains: ['ETH', 'BTC'],
      creatorId: 'creator-1',
    };

    const creator = {
      id: 'creator-1',
      role: 'creator',
      totalRaised: 5000,
    };

    (db.findCampaignById as jest.Mock).mockResolvedValue(campaign);
    (db.createDonation as jest.Mock).mockResolvedValue({ id: 'donation-1', timestamp: new Date() });
    (db.updateCampaign as jest.Mock).mockResolvedValue({ ...campaign, raised: 1000 + toUSD(amount, chain) });
    (db.findUserById as jest.Mock).mockResolvedValue(creator);
    (db.updateUser as jest.Mock).mockResolvedValue({ ...creator, totalRaised: 5000 + toUSD(amount, chain) });

    const req = new NextRequest('http://localhost/api/payments', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    // Act
    const response = await POST(req);
    const responseBody = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(responseBody.success).toBe(true);
    expect(responseBody.donation.amount).toBe(toUSD(amount, chain));
    expect(responseBody.campaign.raised).toBe(1000 + toUSD(amount, chain));
    expect(db.createDonation).toHaveBeenCalledWith({
      campaignId,
      name: donorName,
      amount: toUSD(amount, chain),
      chain,
    });
    expect(db.updateCampaign).toHaveBeenCalledWith(campaignId, {
      raised: 1000 + toUSD(amount, chain),
    });
    expect(db.updateUser).toHaveBeenCalledWith('creator-1', {
      totalRaised: 5000 + toUSD(amount, chain),
    });
  });

  it('should return 400 if required fields are missing', async () => {
    const req = new NextRequest('http://localhost/api/payments', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(req);
    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(responseBody.error).toBe('Missing required fields: campaignId, amount, chain, donorName');
  });

  it('should return 400 if amount is not greater than 0', async () => {
    const requestBody = { campaignId: 'c-1', amount: 0, chain: 'ETH', donorName: 'test' };
    const req = new NextRequest('http://localhost/api/payments', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(req);
    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(responseBody.error).toBe('Amount must be greater than 0');
  });

  it('should return 404 if campaign not found', async () => {
    (db.findCampaignById as jest.Mock).mockResolvedValue(null);
    const requestBody = { campaignId: 'c-1', amount: 10, chain: 'ETH', donorName: 'test' };
    const req = new NextRequest('http://localhost/api/payments', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(req);
    const responseBody = await response.json();

    expect(response.status).toBe(404);
    expect(responseBody.error).toBe('Campaign not found');
  });

  it('should return 400 if chain is not supported', async () => {
    const campaign = { id: 'c-1', chains: ['BTC'] };
    (db.findCampaignById as jest.Mock).mockResolvedValue(campaign);
    const requestBody = { campaignId: 'c-1', amount: 10, chain: 'ETH', donorName: 'test' };
    const req = new NextRequest('http://localhost/api/payments', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const response = await POST(req);
    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(responseBody.error).toBe('Campaign does not support ETH payments');
  });
});
