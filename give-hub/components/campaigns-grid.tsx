/**
 * FILE: components/campaigns-grid.tsx
 * PURPOSE: Client grid with loading + progressive reveal (3 visible, blur rest until expanded)
 * MIGRATION: Swaps to real API/MongoDB seamlessly via /api/campaigns
 */

"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { CampaignCard } from '@/components/campaign-card'
import type { Campaign } from '@/lib/db'

// Use shared Campaign type from '@/lib/db' (kept compatible across mock and Mongo adapters)

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
  // Feature flag: enable dynamic layout only when env is active.
  // NOTE: In Next.js client components, only NEXT_PUBLIC_* env vars are exposed.
  const layoutDEnv = (process.env.NEXT_PUBLIC_layoutD ?? process.env.NEXT_PUBLIC_LAYOUTD ?? '').toString().trim().toLowerCase()
  const isLayoutD = ['1', 'true', 'yes', 'on'].includes(layoutDEnv)
  // Column logic by total count: <4 => 1 col, 4-8 => 2 cols, >8 => 3 cols
  const desiredCols = useMemo(() => {
    const n = list.length
    if (n < 4) return 1
    if (n <= 8) return 2
    return 3
  }, [list.length])
  // Gate when more than 2 rows would be shown (pre-expansion)
  const visibleCount = useMemo(() => desiredCols * 2, [desiredCols])
  const clearVisible = useMemo(() => list.slice(0, visibleCount), [list, visibleCount])
  const afterVisible = useMemo(() => list.slice(visibleCount), [list, visibleCount])
  const shouldGate = !expanded && list.length > visibleCount

  const gridColsClasses = useMemo(() => {
    const md = desiredCols >= 2 ? 'md:grid-cols-2' : 'md:grid-cols-1'
    const lg = desiredCols === 3 ? 'lg:grid-cols-3' : desiredCols === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-1'
    return `grid grid-cols-1 ${md} ${lg} gap-8`
  }, [desiredCols])

  const cardScaleClass = useMemo(() => {
    if (desiredCols === 1) return 'scale-[1.06] sm:scale-[1.08]'
    if (desiredCols === 2) return 'scale-[1.03]'
    return ''
  }, [desiredCols])

  // Original behavior (fallback when layoutD flag is off): fixed 3-per-row grid with 6 visible cards pre-expand
  const oldClearSix = useMemo(() => list.slice(0, 6), [list])
  const oldAfterSix = useMemo(() => list.slice(6), [list])
  const shouldGateOld = !expanded && list.length > 6
  const gridColsFixed = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'

  // Derived render branches based on flag
  const gridClass = isLayoutD ? gridColsClasses : gridColsFixed
  const visibleCards = isLayoutD ? clearVisible : oldClearSix
  const extraCards = isLayoutD ? afterVisible : oldAfterSix
  const skeletonLen = isLayoutD ? visibleCount : 6
  const gatingActive = isLayoutD ? shouldGate : shouldGateOld
  const containerPaddingClass = isLayoutD
    ? (gatingActive ? 'pb-24 md:pb-28 safe-bottom' : '')
    : (!expanded ? 'pb-24 md:pb-28 safe-bottom' : '')

  // Lock page scroll until user expands
  useEffect(() => {
    if (typeof document === 'undefined') return
    const prevBody = document.body.style.overflow
    const prevHtml = document.documentElement.style.overflow
    if (gatingActive) {
      document.body.style.overflow = 'hidden'
      // Only in dynamic layout mode, also lock the root element to prevent any overscroll
      if (isLayoutD) document.documentElement.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
      if (isLayoutD) document.documentElement.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = prevBody
      document.documentElement.style.overflow = prevHtml
    }
  }, [gatingActive, isLayoutD])

  return (
    <div className={`space-y-8 ${containerPaddingClass}`}>
      {/* Grid */}
      <div className="relative">
        <div className={gridClass}>
          {/* First six visible or skeletons */}
          {loading && (!campaigns || campaigns.length === 0) ? (
            Array.from({ length: skeletonLen }).map((_, i) => <SkeletonCard key={`sk-${i}`} />)
          ) : (
            visibleCards.map((c) => (
              <div key={c.id} className={`h-full transform-gpu ${isLayoutD ? cardScaleClass : ''}`}>
                <CampaignCard campaign={c} variant="minimal" />
              </div>
            ))
          )}
          {/* Always render items after first six so their images/fallbacks mount.
              When not expanded, visually gate them with blur/opacity and disable interaction. */}
          {extraCards.map((c) => (
            <div
              key={`ex-${c.id}`}
              className={`h-full transition ${
                !expanded ? 'pointer-events-none select-none opacity-70 [filter:blur(2px)]' : ''
              }`}
              aria-hidden={!expanded}
            >
              <CampaignCard campaign={c} variant="minimal" />
            </div>
          ))}
        </div>
        {/* Bottom overlay: smooth gradient fade (no hard edge) until expanded */}
        {gatingActive && (
          <div className="fixed inset-x-0 bottom-0 h-[30svh] pointer-events-none z-20">
            {/* Theme-aware soft background rise */}
            <div className={`absolute inset-0 bg-gradient-to-t ${gradientFromClass} via-transparent to-transparent opacity-80`} />
            {/* Gentle dark veil with gradient so boundary fades smoothly */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/15 to-transparent" />
          </div>
        )}
      </div>
              


      {/* See more button (fixed to viewport bottom, above content) */}
      {!expanded && gatingActive && (
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
