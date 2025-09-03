/**
 * FILE: components/campaigns-grid.tsx
 * PURPOSE: Optimized campaign grid with simple sync/unsync filtering
 * PERFORMANCE: Removed complex blockchain verification for speed
 */

"use client"

import { useEffect, useMemo, useState } from 'react'
import { CampaignCard } from '@/components/campaign-card'
import type { Campaign } from '@/lib/utils/types';
import { useCampaignLiveStatus } from '@/lib/hooks/useCampaignLiveStatus'
import { SkeletonCard } from '@/components/skeleton-loader'
import Link from 'next/link'


type CampaignsGridProps = {
  /** Initial campaigns to display */
  initialCampaigns?: Campaign[]
  /** Should we show an "Add Campaign" card? */
  showAddCampaignCard?: boolean
  /** Show unsynced campaigns (false by default for home page) */
  showUnsyncedCampaigns?: boolean
  /** Enable the live status hook (disable on homepage to avoid RPC) */
  enableLiveStatus?: boolean
  /** Use compact cards (hide live badge and progress details) */
  compactCards?: boolean
  /** Title for the section */
  sectionTitle?: string
  /** Show loading state */
  isLoading?: boolean
}

export function CampaignsGrid({
  initialCampaigns = [],
  showAddCampaignCard = false,
  showUnsyncedCampaigns = false,
  enableLiveStatus = false,
  compactCards = false,
  sectionTitle,
  isLoading = false,
}: CampaignsGridProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns)
  const [expanded, setExpanded] = useState(false)
  // Removed background sync verification; trust server/API to provide only synced campaigns for homepage

  // Sync internal list when server-provided campaigns change
  useEffect(() => {
    setCampaigns(initialCampaigns)
    setExpanded(false)
  }, [initialCampaigns])

  // Use live status hook only if enabled
  const { liveStatus: liveStatusHook, isLoading: liveStatusLoading } = useCampaignLiveStatus(
    campaigns, 
    { enabled: enableLiveStatus }
  )

  // Filter and sort campaigns based on sync status, mode, and hierarchy
  const visibleCampaigns = useMemo(() => {
    let filtered: Campaign[]
    
    if (showUnsyncedCampaigns) {
      // Creator dashboard: show campaigns WITHOUT onChain property (unsynced)
      filtered = campaigns.filter(campaign => !campaign.onChain)
    } else {
      // Homepage: trust API to return only synced campaigns
      filtered = campaigns
    }
    
    // Sort campaigns by hierarchy: most donations/raised amount first
    return filtered.sort((a, b) => {
      // First sort by raised amount (total donations)
      const raisedA = a.raised || 0
      const raisedB = b.raised || 0
      if (raisedA !== raisedB) {
        return raisedB - raisedA // Higher raised amount first
      }
      
      // If raised amounts are equal, sort by goal (higher goals suggest more ambitious/popular campaigns)
      const goalA = a.goal || 0
      const goalB = b.goal || 0
      if (goalA !== goalB) {
        return goalB - goalA // Higher goals first
      }
      
      // If still equal, sort by creation date (newer first)
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return dateB - dateA
    })
  }, [campaigns, showUnsyncedCampaigns])
  
  // Simple responsive grid
  const gridClass = 'grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
  
  // Show initial campaigns (6 by default)
  const visibleCount = 6
  const initialCards = visibleCampaigns.slice(0, visibleCount)
  const extraCards = visibleCampaigns.slice(visibleCount)
  
  return (
    <div className="space-y-6">
      {/* Section title if provided */}
      {sectionTitle && (
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{sectionTitle}</h2>
      )}

      {/* Sync status disclaimer removed: API returns only synced campaigns for homepage */}

      <div className={gridClass}>
        {/* Show loading skeletons if loading */}
        {(liveStatusLoading || isLoading) ? (
          Array(6).fill(0).map((_, i) => (
            <SkeletonCard key={i} />
          ))
        ) : (
          <>
            {/* Add Campaign card if requested */}
            {showAddCampaignCard && (
              <Link href="/create">
                <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 p-6 shadow-sm hover:shadow-md hover:border-blue-200 dark:hover:border-blue-600 transition-all duration-200 flex flex-col items-center justify-center min-h-[240px]">
                  <div className="rounded-full bg-blue-50 dark:bg-blue-900/30 p-4 mb-3">
                    <svg className="w-8 h-8 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200 text-center">Create New Campaign</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-center mt-2">Start fundraising for your cause</p>
                </div>
              </Link>
            )}

            {/* Campaign cards */}
            {(expanded ? visibleCampaigns : initialCards).map((campaign) => {
              const isLiveCampaign = enableLiveStatus && liveStatusHook && campaign.id in liveStatusHook && liveStatusHook[campaign.id]
              
              return (
                <div key={campaign.id} className="relative">
                  <CampaignCard 
                    campaign={campaign}
                    isLive={isLiveCampaign}
                    compact={compactCards}
                  />
                  {/* Green sync indicator removed */}
                </div>
              )
            })}

            {/* Blurred cards when not expanded */}
            {!expanded && extraCards.map((campaign) => {
              const isLiveCampaign = enableLiveStatus && liveStatusHook && campaign.id in liveStatusHook && liveStatusHook[campaign.id]
              
              return (
                <div key={`blur-${campaign.id}`} className="relative">
                  <CampaignCard 
                    campaign={campaign}
                    isLive={isLiveCampaign}
                    compact={compactCards}
                    className="opacity-60 blur-[2px] pointer-events-none"
                  />
                  {/* Green sync indicator for blurred cards removed */}
                </div>
              )
            })}
          </>
        )}
      </div>
      
      {/* View All button */}
      {!expanded && extraCards.length > 0 && (
        <div className="flex justify-center mt-8 mb-20 md:mb-8">
          <button
            onClick={() => setExpanded(true)}
            className="py-2 px-6 rounded-full bg-transparent border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 shadow-sm hover:shadow-md transform transition hover:scale-105 font-semibold"
          >
            View All Campaigns
          </button>
        </div>
      )}
    </div>
  )
}
