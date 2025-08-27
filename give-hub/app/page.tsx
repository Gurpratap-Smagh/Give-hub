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
import ScrollToTopOnMount from '@/components/scroll-to-top-on-mount'
import { db } from '@/lib/db'
import type { Campaign } from '@/lib/db'

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
    const searchParameter = resolvedSearchParams.param as 'all' | 'title' | 'creator' | 'category'
    const rawLower = raw.toLowerCase()

    if (!raw) {
      const result = await db.searchCampaignsAdvanced({}) as { campaigns: Campaign[], total: number }
      campaigns = result.campaigns
    } else {
      if (searchParameter === 'all') {
        // Broad text search across title, description, category, and creator username
        const result = await db.searchCampaignsAdvanced({ q: rawLower }) as { campaigns: Campaign[], total: number }
        campaigns = result.campaigns
      } else {
        const query: { [key: string]: { $regex: string; $options: string } } = {} 
        switch (searchParameter) {
          case 'title': {
            query.title = { $regex: rawLower, $options: 'i' }
            break
          }
          case 'creator': {
            query['creator.username'] = { $regex: rawLower, $options: 'i' }
            break
          }
          case 'category': {
            query.category = { $regex: rawLower, $options: 'i' }
            break
          }
          default: {
            query.title = { $regex: rawLower, $options: 'i' }
          }
        }
        const result = await db.searchCampaignsAdvanced(query) as { campaigns: Campaign[], total: number }
        campaigns = result.campaigns
      }
    }
  } else {
    const result = await db.searchCampaignsAdvanced({}) as { campaigns: Campaign[], total: number }
    campaigns = result.campaigns
  }
  return (
    <div className="min-h-screen bg-gray-50">
      {/* REGION: Main content area */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Ensure we start at the top when landing on homepage */}
        <ScrollToTopOnMount behavior="auto" />
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
