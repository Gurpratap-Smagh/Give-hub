// Use the fixed WebSocket implementation
'use client';

import { useDonationEvents } from '@/lib/hooks/useDonationEvents';

// Compatibility wrapper to preserve existing import path and API shape
// while delegating to the new polling-based DonationEventService.
export function useLiveDonations(
  targetCampaignId?: string | number,
  options?: { enabled?: boolean }
) {
  const campaignId = targetCampaignId == null ? undefined : String(targetCampaignId);
  const enabled = options?.enabled !== false;
  const effectiveCampaignId = enabled ? campaignId : undefined;
  const { donations, connectionStatus, error, isConnected, isLoading, stats, reconnect } = useDonationEvents(effectiveCampaignId);

  // Maintain backward-compatible return keys expected by callers
  return {
    donations,
    campaigns: [],
    connectionStatus,
    error,
    isConnected,
    isLoading,
    stats,
    reconnect,
  };
}
