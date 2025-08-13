/**
 * FILE: app/page.tsx
 * PURPOSE: Home page - displays campaign teasers in grid layout (no contribute controls)
 * WHAT CALLS THIS: Next.js App Router for root route '/'
 * WHAT IT RENDERS: Campaign grid with minimal cards, header section
 * ACCESS: Default export, automatically routed by Next.js
 * DATA FLOW:
 * - Server component fetches campaigns from JSON DB via `db.getAllCampaigns()`
 * - Passes data to client grid; no client-side polling or repeated API calls
 * SEO:
 * - Server render ensures stable HTML for crawlers; easy to swap DB to MongoDB
 * TODO:
 * - Add pagination when campaign count grows (limit: 12 per page)
 * - Implement search/filter functionality (integrate with Nav search)
 * - Add skeleton loading states
 * - Consider infinite scroll vs pagination UX
 */
import Link from 'next/link'
import CampaignsGrid from '../components/campaigns-grid' // Client grid w/ loading and see-more UX
import { db } from '@/_dev/mock-db/database'
import type { Campaign } from '@/_dev/mock-db/database'
// TODO: import { getCampaigns } from '@/lib/api' // Future API integration

/**
 * Home page component - campaign discovery and browsing
 * @returns JSX element with campaign grid and header
 */
export default async function Home({ searchParams }: { searchParams: Promise<{ search?: string; param?: string }> }) {
  // Server-side fetch to avoid client polling and reduce network chatter
  const resolvedSearchParams = await searchParams
  let campaigns: Campaign[]
  
  if (resolvedSearchParams.search && resolvedSearchParams.param) {
    const raw = resolvedSearchParams.search.trim()
    const searchParameter = resolvedSearchParams.param as 'title' | 'creator' | 'category'
    const rawLower = raw.toLowerCase()

    if (!raw) {
      campaigns = db.getAllCampaigns()
    } else {
      switch (searchParameter) {
        case 'title': {
          const all = db.getAllCampaigns()
          campaigns = all.filter(c => c.title.toLowerCase().includes(rawLower))
          break
        }
        case 'creator': {
          const all = db.getAllCampaigns()
          campaigns = all.filter(campaign => {
            const creator = db.findUserById(campaign.creatorId)
            return creator?.username?.toLowerCase().includes(rawLower) ?? false
          })
          break
        }
        case 'category': {
          const all = db.getAllCampaigns()
          campaigns = all.filter(c => (c.category?.toLowerCase() ?? '').includes(rawLower))
          break
        }
        default: {
          // Fallback to title-only search as a sensible default
          const all = db.getAllCampaigns()
          campaigns = all.filter(c => c.title.toLowerCase().includes(rawLower))
        }
      }
    }
  } else {
    campaigns = db.getAllCampaigns()
  }
  return (
    <div className="min-h-screen bg-gray-50">
      {/* REGION: Main content area */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Header section - page introduction */}
        <div className="text-center mb-12">
          <h1 className={`${resolvedSearchParams.search ? 'text-3xl md:text-4xl' : 'text-4xl'} font-bold text-gray-900 mb-2`}>
            {resolvedSearchParams.search ? (
              <>
                <span className="text-gray-800">Search</span>{' '}
                <span className="text-gray-500 font-medium">for</span>{' '}
                <span className="text-gray-900">&ldquo;{resolvedSearchParams.search}&rdquo;</span>
              </>
            ) : (
              'Support Causes You Care About'
            )}
          </h1>
          <p className={`max-w-2xl mx-auto ${resolvedSearchParams.search ? 'text-base md:text-lg text-gray-700 font-semibold' : 'text-xl text-gray-600'}`}>
            {resolvedSearchParams.search 
              ? <>Found <span className="text-gray-900 font-bold">{campaigns.length}</span> campaign{campaigns.length !== 1 ? 's' : ''} matching your search</>
              : 'Discover and fund impactful campaigns across multiple blockchains'
            }
          </p>
          {resolvedSearchParams.search && (
            <div className="mt-4">
              <Link 
                href="/" 
                className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to all campaigns
              </Link>
            </div>
          )}
        </div>
        {/* REGION: Campaign grid rendering with progressive reveal */}
        <CampaignsGrid initialCampaigns={campaigns} />
      </main>
    </div>
  )
}

