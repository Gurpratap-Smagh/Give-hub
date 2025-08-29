import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import CampaignPageContent from './CampaignPageContent';
import { useDonationEvents } from '@/lib/hooks/useDonationEvents';
import { useLivePrices } from '@/lib/hooks/useLivePrices';

// Mock the hooks
jest.mock('@/lib/hooks/useDonationEvents');
jest.mock('@/lib/hooks/useLivePrices');

describe('CampaignPageContent', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('aggregates local and on-chain donations correctly', async () => {
    // Mock useDonationEvents to return on-chain donations
    (useDonationEvents as jest.Mock).mockReturnValue({
      events: [
        {
          id: 'onchain-1',
          args: {
            token: '0xtoken1',
            amount: BigInt('1000000000000000000'), // 1 token
          },
          formatted: {
            amount: '1.0',
            symbol: 'WZETA',
            usdValue: 2.5,
          },
        },
      ],
      isLoading: false,
    });

    // Mock useLivePrices to return token prices
    (useLivePrices as jest.Mock).mockReturnValue({
      getUSDValue: () => 2.5,
    });

    // Mock local donations in localStorage
    const localDonations = [
      {
        id: 'local-1',
        campaignId: '1',
        token: '0x0',
        amount: 100, // $100
        symbol: 'USD',
        usdValue: 100,
      },
    ];

    // Mock localStorage
    Storage.prototype.getItem = jest.fn(() => JSON.stringify(localDonations));

    // Mock the campaign data
    const campaign = {
      id: '1',
      title: 'Test Campaign',
      description: 'Test Description',
      goal: 1000,
      onChain: {
        campaignId: 1,
      },
    };

    render(<CampaignPageContent campaign={campaign} />);

    // Wait for the total to be updated
    await waitFor(() => {
      expect(screen.getByText('$102.50')).toBeInTheDocument();
    });
  });
});
