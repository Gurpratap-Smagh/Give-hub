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
import { formatCurrency } from '@/lib/utils/format' // ACCESS: Currency formatting utilities
// TODO: import { Campaign } from '@/lib/utils/types' // Use centralized types

// Client-safe types for this component (avoid importing server-only modules)
type Chain = 'Ethereum' | 'Solana' | 'Bitcoin'
type Campaign = {
  id: string
  title: string
  description: string
  image?: string
  raised: number
  goal: number
  creator?: string
  createdAt?: string | Date
  deadline?: string | Date
  chains: Chain[]
  /** Optional category label */
  category?: string
}

/**
 * Props for CampaignCard component
 * @param campaign - Campaign data object with all details
 * @param variant - Display mode: 'minimal' for grid, 'detailed' for campaign page
 */
interface CampaignCardProps {
  campaign: Campaign
  variant?: 'minimal' | 'detailed'
}

/**
 * Campaign card component - displays campaign info in card format
 * @param campaign - Campaign data to display
 * @param variant - Card display variant (minimal or detailed)
 * @returns JSX element with campaign card
 */
export function CampaignCard({ campaign, variant = 'minimal' }: CampaignCardProps) {
  // Calculate funding progress percentage
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
  
  // Minimal variant for home page grid display
  if (variant === 'minimal') {
    return (
      <Link href={`/campaign/${campaign.id}`}>
        <div className="relative bg-white rounded-xl border border-gray-200 p-6 hover:shadow-xl transition-all duration-300 cursor-pointer shadow-md hover:border-gray-300 transform hover:-translate-y-1 h-full flex flex-col">
          {/* Category pill */}
          {displayCategory && (
            <div className="absolute top-3 right-3 z-10">
              <span className="px-2.5 py-1 text-[10px] leading-none font-semibold rounded-full bg-gray-100 text-gray-600 border border-gray-200 shadow-sm">
                {displayCategory}
              </span>
            </div>
          )}
          {/* Blockchain Chain Indicators - Building Block: Multi-chain support display */}
          <div className="flex gap-2 mb-4">
            {campaign.chains.map((chain) => (
              <span
                key={chain}
                className="px-3 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 shadow-sm"
              >
                {chain}
              </span>
            ))}
          </div>
          
          {/* Campaign Title - Building Block: Campaign identification (emphasize title over amount) */}
          <h3 className="text-xl font-bold text-gray-900 mb-4 line-clamp-2 hover:text-[color:var(--primary)] transition-colors">
            {campaign.title}
          </h3>
          
          {/* Progress Section - Building Block: Funding visualization */}
          <div className="mt-auto">
            <div className="flex justify-between items-center mb-2">
              <span className="text-lg font-semibold text-gray-900">
                {formatCurrency(campaign.raised)}
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
              Goal: {formatCurrency(campaign.goal)}
            </p>
          </div>
        </div>
      </Link>
    )
  }

  // Detailed variant for campaign detail page
  return (
    <div className="bg-white rounded-2xl p-8 shadow-xl border border-gray-100 hover:shadow-2xl transition-shadow duration-300">
      {/* Blockchain Chain Indicators - Building Block: Multi-chain support display */}
      <div className="flex gap-2 mb-6">
        {campaign.chains.map((chain) => (
          <span
            key={chain}
            className="px-4 py-2 text-sm font-medium rounded-full bg-blue-50 text-blue-600 shadow-sm border border-blue-100"
          >
            {chain}
          </span>
        ))}
      </div>
      
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
            {formatCurrency(campaign.raised)}
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
          Goal: <span className="font-semibold text-gray-800">{formatCurrency(campaign.goal)}</span>
        </p>
      </div>
    </div>
  )
}
