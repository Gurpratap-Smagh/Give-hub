'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { DonationEventService, LiveDonation, getDonationEventService } from '@/lib/services/donationEventService';

export type DonationEvent = LiveDonation;

export function useDonationEvents(campaignId?: string) {
  const [donations, setDonations] = useState<LiveDonation[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ lastBlock: 0, totalSeen: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const serviceRef = useRef<DonationEventService | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!campaignId) {
      setIsLoading(false);
      setConnectionStatus('disconnected');
      return;
    }

    const setupConnection = async () => {
      try {
        setError(null);
        setIsLoading(true);
        setConnectionStatus('connecting');
        
        // Get singleton service
        const service = getDonationEventService();
        serviceRef.current = service;
        
        // Connect if not already connected
        await service.connect();
        setIsConnected(true);
        setIsLoading(false);
        setConnectionStatus('connected');
        
        // Subscribe to this campaign's donations
        const unsubscribe = service.subscribe(campaignId, (donation) => {
          console.log('[useDonationEvents] Received donation:', donation);
          setDonations(prev => {
            // Avoid duplicates
            const exists = prev.some(d => d.id === donation.id);
            if (exists) return prev;
            return [donation, ...prev].slice(0, 50); // Keep last 50
          });
        });
        
        unsubscribeRef.current = unsubscribe;
        
        // Update stats periodically
        const statsInterval = setInterval(() => {
          const status = service.getStatus();
          setStats({
            lastBlock: status.lastProcessedBlock,
            totalSeen: status.seenDonations
          });
        }, 5000);
        
        return () => clearInterval(statsInterval);
      } catch (err) {
        console.error('[useDonationEvents] Setup error:', err);
        setError(err instanceof Error ? err.message : 'Failed to connect');
        setIsConnected(false);
        setIsLoading(false);
        setConnectionStatus('disconnected');
      }
    };

    const cleanup = setupConnection();

    // Cleanup
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      cleanup?.then(fn => fn?.());
    };
  }, [campaignId]);

  const reconnect = useCallback(async () => {
    if (serviceRef.current) {
      try {
        setConnectionStatus('connecting');
        await serviceRef.current.connect();
        setIsConnected(true);
        setError(null);
        setConnectionStatus('connected');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Reconnection failed');
        setConnectionStatus('disconnected');
      }
    }
  }, []);

  return {
    events: donations,
    donations,
    isLoading,
    connectionStatus,
    isConnected,
    error,
    stats,
    reconnect
  };
}
