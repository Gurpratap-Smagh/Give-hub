/**
 * FILE: components/campaigns-grid.tsx
 * PURPOSE: Client grid with loading + progressive reveal (3 visible, blur rest until expanded)
 * MIGRATION: Swaps to real API/MongoDB seamlessly via /api/campaigns
 */

"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { CampaignCard } from '@/components/campaign-card'

// Client-safe type to avoid importing server-only modules
export type Chain = string
export type Campaign = {
  id: string
  title: string
  description: string
  image?: string
  raised: number
  goal: number
  creator?: string
  createdAt?: string | Date
  deadline?: string | Date
  chains: string[]
  /** Optional category label */
  category?: string
}

interface CampaignsGridProps {
  initialCampaigns?: Campaign[]
  /** Tailwind class for the gradient 'from' color, e.g. 'from-blue-100' */
  gradientFromClass?: string
}

function SkeletonCard() {
  return (
    <div className="animate-pulse bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      <div className="flex gap-2 mb-4">
        <div className="h-6 w-16 bg-gray-200 rounded-full" />
        <div className="h-6 w-20 bg-gray-200 rounded-full" />
      </div>
      <div className="h-6 bg-gray-200 rounded w-3/4 mb-4" />
      <div className="space-y-2">
        <div className="h-4 bg-gray-200 rounded w-1/2" />
        <div className="h-2 bg-gray-200 rounded w-full" />
        <div className="h-2 bg-gray-200 rounded w-5/6" />
      </div>
    </div>
  )
}

export function CampaignsGrid({ initialCampaigns = [], gradientFromClass = 'from-gray-50' }: CampaignsGridProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns)
  const [loading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const initialRef = useRef(initialCampaigns)

  // Sync internal list when server-provided campaigns change (e.g., leaving search or clicking back)
  useEffect(() => {
    setCampaigns(initialCampaigns)
    setExpanded(false)
    initialRef.current = initialCampaigns
  }, [initialCampaigns])

  const list = campaigns ?? initialRef.current
  const clearSix = useMemo(() => list.slice(0, 6), [list])
  const afterSix = useMemo(() => list.slice(6), [list])
  const shouldGate = !expanded && list.length > 6

  // Lock body scroll until user expands
  useEffect(() => {
    if (typeof document === 'undefined') return
    const prev = document.body.style.overflow
    if (shouldGate) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = prev
    }
  }, [shouldGate])

  return (
    <div className={`space-y-8 ${!expanded ? 'pb-24 md:pb-28 safe-bottom' : ''}`}>
      {/* Grid */}
      <div className="relative">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {/* First six visible or skeletons */}
          {loading && (!campaigns || campaigns.length === 0) ? (
            Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={`sk-${i}`} />)
          ) : (
            clearSix.map((c) => (
              <div key={c.id} className="h-full">
                <CampaignCard campaign={c} variant="minimal" />
              </div>
            ))
          )}
          {/* After expand, render everything after first six */}
          {expanded && afterSix.map((c) => (
            <div key={`ex-${c.id}`} className="h-full">
              <CampaignCard campaign={c} variant="minimal" />
            </div>
          ))}
        </div>
        {/* Bottom overlay: smooth gradient fade (no hard edge) until expanded */}
        {shouldGate && (
          <div className="fixed inset-x-0 bottom-0 h-[30svh] pointer-events-none z-20">
            {/* Theme-aware soft background rise */}
            <div className={`absolute inset-0 bg-gradient-to-t ${gradientFromClass} via-transparent to-transparent opacity-80`} />
            {/* Gentle dark veil with gradient so boundary fades smoothly */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/15 to-transparent" />
          </div>
        )}
      </div>

      {/* See more button (fixed to viewport bottom, above content) */}
      {!expanded && list.length > 6 && (
        <div className="fixed left-0 right-0 bottom-4 md:bottom-6 z-30 flex justify-center pointer-events-none">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="pointer-events-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 text-gray-700 font-medium transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path fillRule="evenodd" d="M12.53 16.28a.75.75 0 01-1.06 0l-6-6a.75.75 0 111.06-1.06L12 14.69l5.47-5.47a.75.75 0 111.06 1.06l-6 6z" clipRule="evenodd" />
            </svg>
            See more
          </button>
        </div>
      )}
    </div>
  )
}

export default CampaignsGrid
