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
import CampaignsGrid from '../components/campaigns-grid' // Client grid w/ loading and see-more UX
import { db } from '@/lib/mock-db/database'
// TODO: import { getCampaigns } from '@/lib/api' // Future API integration

/**
 * Home page component - campaign discovery and browsing
 * @returns JSX element with campaign grid and header
 */
export default async function Home() {
  // Server-side fetch to avoid client polling and reduce network chatter
  const campaigns = db.getAllCampaigns()
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
        {/* REGION: Campaign grid rendering with progressive reveal */}
        <CampaignsGrid initialCampaigns={campaigns} />
      </main>
    </div>
  )
}

