// lib/hooks/useCampaignLiveStatus.ts
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDonationEvents } from './useDonationEvents';
import type { Campaign } from '@/lib/db';

/**
 * Hook to determine if a campaign is "alive" based on either:
 * 1. Being synced on-chain (has onChain data)
 * 2. Having live donations in the last 24 hours
 */
export const useCampaignLiveStatus = (
  campaigns: Campaign[],
  options?: { enabled?: boolean }
) => {
  const [liveStatus, setLiveStatus] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const enabled = useMemo(() => options?.enabled !== false, [options?.enabled]);
  
  // For unsynced campaigns, we'll check if they have any live donations
  const unsyncedCampaigns = useMemo(() => campaigns.filter(c => !c.onChain), [campaigns]);
  
  // Get live donation events for all campaigns
  const { events: liveDonations } = useDonationEvents(undefined, 20_000, 300, { enabled });
  
  // Track connection status separately since it's not exposed by the hook
  const [connected, setConnected] = useState(false);
  
  // Set connected after initial fetch
  useEffect(() => {
    if (!enabled) return;
    if (liveDonations.length > 0) {
      setConnected(true);
    }
  }, [liveDonations, enabled]);

  // Fast path when disabled: on-chain only; no RPC, no waiting
  useEffect(() => {
    if (enabled) return;
    const onChainOnly: Record<string, boolean> = {};
    campaigns.forEach(c => { onChainOnly[c.id] = !!c.onChain; });
    setLiveStatus(onChainOnly);
    setIsLoading(false);
  }, [enabled, campaigns]);
  
  // Process live donations and determine if campaigns are active
  useEffect(() => {
    if (!enabled) return;
    if (!connected) {
      setIsLoading(true);
      return;
    }

    const newLiveStatus: Record<string, boolean> = {};

    // Default status based on onChain property
    campaigns.forEach(campaign => {
      newLiveStatus[campaign.id] = !!campaign.onChain;
    });

    // Check for live donations on unsynced campaigns within ~24h window
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const latestBlockTimestamp = Date.now();
    const secondsPerBlock = 2.5;

    const recentDonations = liveDonations.filter((donation) => {
      const blockAge = 15000 - donation.blockNumber;
      if (blockAge < 0) return true;
      const timestamp = latestBlockTimestamp - (blockAge * secondsPerBlock * 1000);
      return timestamp > oneDayAgo;
    });

    const activeCampaignIds = new Set<string>();
    recentDonations.forEach((donation) => {
      const campaignIdStr = String(donation.campaignId);
      const matchingCampaign = unsyncedCampaigns.find(c => (
        c.id === campaignIdStr || (c.onChain?.campaignId && c.onChain.campaignId === campaignIdStr)
      ));
      if (matchingCampaign) {
        activeCampaignIds.add(matchingCampaign.id);
      }
    });

    activeCampaignIds.forEach(id => { newLiveStatus[id] = true; });

    setLiveStatus(newLiveStatus);
    setIsLoading(false);
  }, [campaigns, liveDonations, connected, unsyncedCampaigns, enabled]);
  
  // Helper function to check if a specific campaign is alive
  const isCampaignAlive = useCallback((campaignId: string) => {
    return liveStatus[campaignId] ?? false;
  }, [liveStatus]);
  
  return {
    liveStatus,
    isCampaignAlive,
    isLoading
  };
};
