/**
 * FILE: components/campaign-card.tsx
 * PURPOSE: Reusable campaign display component with minimal/detailed variants
 * WHAT CALLS THIS: Home page (minimal variant), campaign detail page (detailed variant)
 * WHAT IT RENDERS: Campaign info card with progress bar, chains, title, description
 * ACCESS: Named export, import { CampaignCard } from '@/components/campaign-card'
 * MIGRATION NOTES:
 * - Types (MongoDB): Move local `Campaign`/`Chain` to a shared `lib/types.ts` used by
 *   both client and server (ensure client types do not import server-only code).
 * - Data accuracy (Contracts): Raised amount should reflect on-chain state. After
 *   integrating `contracts.readCampaign(campaignId)`, derive `raised` from contract
 *   or reconcile periodically with backend. Display pending states if optimistic.
 * - Realtime: Add WebSocket/SSE or polling to update progress as donations are mined.
 * - Loading/Skeletons: Add skeleton UIs for minimal and detailed variants.
 * - Accessibility: Add ARIA attributes and better keyboard focus styles.
 * - AI (future): Provide short AI-generated summaries for titles/descriptions with
 *   user consent and clear labeling; ensure no server-only dependencies here.
 * TODO:
 * - Add accessibility labels and ARIA attributes
 * - Implement favorite/bookmark functionality
 * - Add share button integration
 * - Consider image/media support for campaigns
 */

"use client"

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { formatCurrency } from '@/lib/utils/format' // ACCESS: Currency formatting utilities
import type { Campaign } from '@/lib/db'

// 2:1 aspect placeholder image (SVG data URL) to keep card sizes consistent
const CARD_PLACEHOLDER_2x1 = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e5e7eb" />
        <stop offset="1" stop-color="#d1d5db" />
      </linearGradient>
    </defs>
    <rect width="800" height="400" fill="url(#g)"/>
    <g fill="#9ca3af">
      <circle cx="400" cy="190" r="36"/>
      <rect x="340" y="238" width="120" height="14" rx="7"/>
    </g>
  </svg>
`)

// Using canonical Campaign type from '@/lib/db'

/**
 * Props for CampaignCard component
 * @param campaign - Campaign data object with all details
 * @param variant - Display mode: 'minimal' for grid, 'detailed' for campaign page
 * @param isLive - Indicates if the campaign has recent donation activity
 * @param className - Optional CSS class names for styling
 */
interface CampaignCardProps {
  campaign: Campaign
  variant?: 'minimal' | 'detailed'
  isLive?: boolean
  /** Compact mode for homepage: hides live badge, sync dot, and progress section */
  compact?: boolean
  /** Verification states for blockchain validation */
  verifying?: boolean
  verified?: boolean
  className?: string
}

/**
 * Campaign card component - displays campaign info in card format
 * @param campaign - Campaign data to display
 * @param variant - Card display variant (minimal or detailed)
 * @param compact - Compact mode for homepage: hides progress section
 * @param className - Optional CSS class names for styling
 * @returns JSX element with campaign card
 */
export function CampaignCard({ campaign, variant = 'minimal', compact = false, className = '' }: CampaignCardProps) {
  // Calculate funding progress percentage
  // Both raised and goal are stored as cents in MongoDB
  const progressPercentage = Math.round((campaign.raised / campaign.goal) * 100)
  // Format category (hide `other:` prefix and underscores) and Title Case for consistency
  const rawCategory = campaign.category
    ? campaign.category.startsWith('other:')
      ? campaign.category.slice('other:'.length).replaceAll('_', ' ')
      : campaign.category
    : undefined
  const displayCategory = rawCategory
    ? rawCategory.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    : undefined
  
  // Always maintain a valid image source for consistent sizing
  const [imgSrc, setImgSrc] = useState<string>(campaign.image || CARD_PLACEHOLDER_2x1)
  useEffect(() => {
    setImgSrc(campaign.image || CARD_PLACEHOLDER_2x1)
  }, [campaign.image])
  // Preflight image load: if campaign.image fails to load, switch to placeholder even if the card image hasn't rendered yet
  useEffect(() => {
    if (!campaign.image) return
    let active = true
    const test = new window.Image()
    // allow CORS-friendly fetch when possible
    try { test.crossOrigin = 'anonymous' } catch {}
    test.onload = () => { /* ok, keep original */ }
    test.onerror = () => {
      if (active) setImgSrc(CARD_PLACEHOLDER_2x1)
    }
    test.src = campaign.image
    return () => { active = false }
  }, [campaign.image])
  
  // Minimal variant for home page grid display
  if (variant === 'minimal') {
    return (
      <Link href={`/campaign/${campaign.id}`}>
        <div className={`relative bg-gray-900/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 hover:shadow-xl transition-all duration-300 cursor-pointer shadow-lg hover:border-white/20 transform hover:-translate-y-1 flex flex-col ${className}`}>
          {!compact && (
            <>
              {/* Verification Status Indicator removed for cleaner UI */}
            </>
          )}
          
          {/* Category chip pinned to card's top-right (5px by 5px) */}
          {displayCategory && (
            <div className="absolute top-[10px] right-[10px] z-10">
              <span className="px-2.5 py-1 text-[10px] leading-none font-semibold rounded-full bg-gray-100 text-gray-600 border border-gray-200 shadow-sm">
                {displayCategory}
              </span>
            </div>
          )}
          
          {/* Live donation activity indicator removed */}
          {/* Image (always render; fallback placeholder keeps size consistent) */}
          <div className="w-full h-32 relative rounded-lg overflow-hidden mb-3">
            <Image
              key={imgSrc}
              src={imgSrc}
              alt={campaign.title}
              fill
              unoptimized
              loading="eager"
              priority
              sizes="(max-width: 640px) 160px, (max-width: 1024px) 160px, 160px"
              className="object-cover"
              referrerPolicy="no-referrer"
              onError={() => setImgSrc(CARD_PLACEHOLDER_2x1)}
              onLoad={(e) => {
                const img = e.currentTarget
                if (!img.naturalWidth || !img.naturalHeight) {
                  setImgSrc(CARD_PLACEHOLDER_2x1)
                }
              }}
            />
          </div>
          
          {/* Campaign Title - single-line ellipsis to keep card heights consistent */}
          <h3 className="text-xl font-bold text-gray-900 mb-2 truncate hover:text-[color:var(--primary)] transition-colors">
            {campaign.title}
          </h3>
          
          {!compact && (
            <>
              {/* Progress Section - Building Block: Funding visualization */}
              <div className="mt-auto">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-lg font-semibold text-gray-900">
                    {formatCurrency(campaign.raised, 'USD', true)}
                  </span>
                  <span className="text-sm text-gray-500 font-medium">
                    {progressPercentage}% funded
                  </span>
                </div>
                {/* Progress Bar */}
                <div className="w-full bg-gray-200 rounded-full h-2.5 shadow-inner">
                  <div
                    className="bg-gradient-to-r from-green-500 to-blue-500 h-2.5 rounded-full transition-all duration-500 shadow-sm"
                    style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Goal: {formatCurrency(campaign.goal, 'USD', true)}
                </p>
              </div>
            </>
          )}
        </div>
      </Link>
    )
  }

  // Detailed variant for campaign detail page
  return (
    <div className={`bg-white rounded-2xl p-8 shadow-xl border border-gray-100 hover:shadow-2xl transition-shadow duration-300 ${className}`}>
      {/* Chain pills removed to prioritize imagery per design */}
      
      {/* Campaign Title - Building Block: Campaign identification (emphasize title) */}
      <h1 className="text-3xl font-extrabold text-gray-900 mb-4">
        {campaign.title}
      </h1>
      
      {/* Campaign Description - Building Block: Campaign details */}
      <p className="text-gray-600 mb-6 leading-relaxed text-lg">
        {campaign.description}
      </p>
      
      {/* Progress Section - Building Block: Detailed funding visualization */}
      <div className="mb-8 p-6 bg-gray-50 rounded-xl shadow-inner">
        <div className="flex justify-between items-center mb-3">
          <span className="text-2xl font-semibold text-gray-900">
            {formatCurrency(campaign.raised, 'USD', true)}
          </span>
          <span className="text-sm font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full shadow-sm">
            {progressPercentage}% funded
          </span>
        </div>
        {/* Enhanced Progress Bar */}
        <div className="w-full bg-gray-300 rounded-full h-4 mb-3 shadow-inner">
          <div
            className="bg-gradient-to-r from-blue-500 to-green-500 h-4 rounded-full transition-all duration-500 shadow-sm"
            style={{ width: `${Math.min(progressPercentage, 100)}%` }}
          />
        </div>
        <p className="text-gray-600 text-lg">
          Goal: <span className="font-semibold text-gray-800">{formatCurrency(campaign.goal, 'USD', true)}</span>
        </p>
      </div>
    </div>
  )
}
