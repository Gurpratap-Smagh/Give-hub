/**
 * FILE: app/page.tsx
 * PURPOSE: Home page - displays campaign teasers in grid layout (no contribute controls)
 * WHAT CALLS THIS: Next.js App Router for root route '/'
 * WHAT IT RENDERS: Campaign grid with minimal cards, header section
 * ACCESS: Default export, automatically routed by Next.js
 * MIGRATION NOTES:
 * - Replace mockCampaigns import with fetch('/api/campaigns') or server action
 * - Add loading states and error handling for API calls
 * - Consider server-side rendering for SEO (campaigns fetched at build/request time)
 * TODO:
 * - Add pagination when campaign count grows (limit: 12 per page)
 * - Implement search/filter functionality (integrate with Nav search)
 * - Add skeleton loading states
 * - Consider infinite scroll vs pagination UX
 */

import { CampaignCard } from '@/components/campaign-card' // ACCESS: Campaign display component
import { mockCampaigns } from '@/lib/mock' // TEMP: Replace with API call
// TODO: import { getCampaigns } from '@/lib/api' // Future API integration

/**
 * Home page component - campaign discovery and browsing
 * @returns JSX element with campaign grid and header
 */
export default function Home() {
  // REGION: Data fetching (currently mock)
  // MIGRATION: Replace with server action or API call
  // const campaigns = await getCampaigns({ limit: 12, page: 1 })
  const campaigns = mockCampaigns; // TEMP: Mock data

  return (
    <div className="min-h-screen bg-gray-50">
      {/* REGION: Main content area */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Header section - page introduction */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Support Causes You Care About
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Discover and fund impactful campaigns across multiple blockchains
          </p>
        </div>

        {/* REGION: Campaign grid rendering */}
        {/* Tailwind: Responsive grid (1 col mobile, 2 col tablet, 3 col desktop) */}
        {/* Spacing: gap-8 (2rem) for visual separation */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {campaigns.map((campaign) => (
            <CampaignCard 
              key={campaign.id} 
              campaign={campaign} 
              variant="minimal" // No contribute controls on home page
            />
          ))}
        </div>

        {/* TODO: Add pagination controls here */}
        {/* TODO: Add "Load More" button or infinite scroll */}
      </main>
    </div>
  )
}
