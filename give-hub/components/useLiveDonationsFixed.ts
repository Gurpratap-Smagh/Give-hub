'use client';

import { useCallback, useEffect, useState } from 'react';
import { getDonationWebSocketService, LiveDonation } from '@/lib/services/donationWebSocket';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface UseLiveDonationsReturn {
  donations: LiveDonation[];
  connectionStatus: ConnectionStatus;
  error: Error | null;
  retry: () => void;
  isLoading: boolean;
}

export function useLiveDonationsFixed(campaignId?: string | number): UseLiveDonationsReturn {
  const [donations, setDonations] = useState<LiveDonation[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const retry = useCallback(() => {
    setError(null);
    setConnectionStatus('connecting');
    const service = getDonationWebSocketService();
    service.connect().catch(err => {
      setError(err);
      setConnectionStatus('disconnected');
    });
  }, []);

  useEffect(() => {
    const service = getDonationWebSocketService();
    let unsubscribe: (() => void) | null = null;

    const connect = async () => {
      setIsLoading(true);
      setConnectionStatus('connecting');

      try {
        await service.connect();
        setConnectionStatus('connected');
        setError(null);

        // Subscribe to donations for this campaign
        const campaignIdStr = campaignId ? String(campaignId) : '*';
        unsubscribe = service.subscribe(campaignIdStr, (donation) => {
          // Filter by campaign if specified
          if (campaignId && donation.campaignId !== String(campaignId)) return;
          
          setDonations(prev => {
            // Avoid duplicates
            if (prev.some(d => d.id === donation.id)) return prev;
            // Add new donation at the beginning, keep max 100
            return [donation, ...prev].slice(0, 100);
          });
        });

      } catch (err) {
        console.error('[useLiveDonations] Connection failed:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setConnectionStatus('disconnected');
      } finally {
        setIsLoading(false);
      }
    };

    connect();

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [campaignId]);

  return {
    donations,
    connectionStatus,
    error,
    retry,
    isLoading
  };
}

// Export as default implementation
export { useLiveDonationsFixed as useLiveDonationsNew };
