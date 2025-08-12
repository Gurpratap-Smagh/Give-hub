/**
 * FILE: app/campaign/[id]/page.tsx
 * PURPOSE: Campaign detail page with contribution UI and recent donations
 * WHAT CALLS THIS: Next.js dynamic route /campaign/:id
 * WHAT IT RENDERS: Detailed campaign info, donate controls, recent donations
 * MIGRATION NOTES:
 * - Data layer (MongoDB): This page currently fetches from /api/campaigns/[id],
 *   which reads JSON via `lib/mock-db/database.ts`. Swap that implementation to real
 *   MongoDB without changing this page's fetch contract. Keep response shape
 *   { success, campaign, donations }. Add pagination to donations when needed.
 * - Smart contracts: Replace the TODO donate handler with a concrete call, e.g.
 *   `contracts.donate({ campaignId, amount, chain, memo })`. Use on-chain events or
 *   a post-donation API to persist donations to DB and reconcile raised totals.
 * - Optimistic UI: Optimistically increment `raised` and prepend to donations; rollback
 *   on failure; reconcile with a read from chain or backend after tx confirmation.
 * - UX/State: Expand loading states, errors, and transaction status (pending/confirmed/failed).
 * - Security: Validate amount/chain client-side and server-side. Prevent duplicate submissions.
 * - SEO: Consider server component version if SEO is needed; keep fs usage server-only.
 * TODO:
 * - Error boundary for not found and network errors
 * - Real-time donations via WebSocket/SSE or periodic polling (backed by DB or on-chain indexer)
 * - Transaction history with block explorer links per chain (Etherscan, Solscan, etc.)
 * - Social/share: dynamic OG metadata and share links
 * - AI (future):
 *   - Summarize campaign description for preview cards
 *   - Flag risky content via moderation service
 *   - Recommend similar campaigns; ensure opt-in and privacy safeguards
 */


'use client'

import { useEffect, useState } from 'react'
import Spinner from '@/components/spinner'
import { notFound, useParams } from 'next/navigation'
import Link from 'next/link'
import { CampaignCard } from '@/components/campaign-card' // ACCESS: Detailed campaign display
import { formatCurrency, formatDate } from '@/lib/format' // ACCESS: Utility formatters
// TODO: import { donate } from '@/lib/contracts' // Future contract integration
// TODO: import { getCampaign, getDonations } from '@/lib/api' // Future API integration

// Route params will be read via useParams to avoid Promise-based params issues in Next.js 15

/**
 * Campaign detail page component - main donation interface
 * @param params - Route parameters containing campaign ID
 * @returns JSX element with campaign details and donation form
 */
export default function CampaignPage() {
  const route = useParams<{ id: string }>()
  const id = (route?.id || '') as string
  // REGION: State management
  const [selectedChain, setSelectedChain] = useState<'Ethereum' | 'Solana' | 'Bitcoin'>('Ethereum')
  const [donationAmount, setDonationAmount] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Local types to avoid importing server-only modules
  type Chain = 'Ethereum' | 'Solana' | 'Bitcoin'
  interface Campaign {
    id: string
    title: string
    description: string
    image: string
    raised: number
    goal: number
    creator: string
    createdAt: string | Date
    deadline: string | Date
    chains: Chain[]
  }

  interface Donation {
    campaignId: string
    name?: string
    amount: number
    chain: Chain
    donor?: string
    timestamp: string | Date
  }

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [campaignDonations, setCampaignDonations] = useState<Donation[]>([])
  // TODO: Add loading state for donation processing
  // const [isDonating, setIsDonating] = useState(false)
  // TODO: Add transaction status tracking
  // const [txStatus, setTxStatus] = useState<'idle' | 'pending' | 'confirmed' | 'failed'>('idle')

  // REGION: Data fetching
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/campaigns/${id}`, { cache: 'no-store' })
        if (!res.ok) {
          if (res.status === 404) {
            if (active) setError('not-found')
            return
          }
          throw new Error(`Failed to load campaign (${res.status})`)
        }
        const data = await res.json()
        if (data.success) {
          if (active) {
            const allowed: Chain[] = ['Ethereum', 'Solana', 'Bitcoin']
            const chains: Chain[] = (data.campaign?.chains || [])
              .filter((c: string): c is Chain => (allowed as string[]).includes(c))
            setCampaign({ ...data.campaign, chains })
            setCampaignDonations((data.donations || []) as Donation[])
          }
        } else {
          throw new Error(data.error || 'Unknown error')
        }
      } catch (e: unknown) {
        console.error('Campaign fetch error:', e)
        const message = e instanceof Error ? e.message : 'Failed to load campaign'
        if (active) setError(message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [id])

  if (error === 'not-found') {
    notFound()
  }

  if (loading || !campaign) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <div className="flex items-center gap-3">
            <Spinner size={20} />
            <p className="text-gray-600">Loading campaign...</p>
          </div>
        </div>
      </div>
    )
  }

  const progressPercentage = Math.round((campaign.raised / campaign.goal) * 100)

  // REGION: Event handlers
  /**
   * Handle donation submission - currently placeholder
   * MIGRATION: Replace with contract call and optimistic UI update
   */
  const handleDonate = async () => {
    // TEMP: Placeholder alert
    alert(`Donation of ${donationAmount} ${selectedChain} will be processed here!`)
    
    // TODO: Implement real donation flow
    // setIsDonating(true)
    // try {
    //   const txHash = await donate({
    //     campaignId: params.id,
    //     amount: parseFloat(donationAmount),
    //     chain: selectedChain,
    //     memo: '' // Optional donor message
    //   })
    //   setTxStatus('pending')
    //   // Optimistic UI update: increment raised amount locally
    //   // Then reconcile with on-chain data after confirmation
    // } catch (error) {
    //   setTxStatus('failed')
    //   console.error('Donation failed:', error)
    // } finally {
    //   setIsDonating(false)
    // }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main Content Section */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Back Button */}
        <Link
          href="/"
          className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-6 font-medium"
        >
          ← Back to Campaigns
        </Link>

        {/* Colorful heading */}
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900">
            <span className="text-blue-600">Campaign</span>
            <span className="text-gray-900"> Details</span>
          </h1>
          <p className="mt-2 text-gray-600">{campaign.title}</p>
          <div className="h-1 w-24 bg-gradient-to-r from-blue-600 to-green-500 rounded-full mt-3" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Campaign Details Card */}
            <CampaignCard campaign={campaign} variant="detailed" />

            {/* Recent Donations */}
            <div className="bg-white rounded-2xl p-8 card-shadow border border-gray-100 mt-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Recent Donations</h2>
              {campaignDonations.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 text-lg mb-4">
                    No donations yet. Be the first to support this campaign!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {campaignDonations.slice(0, 10).map((donation, index) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-semibold text-gray-900">{donation.name}</p>
                        <p className="text-sm text-gray-500">
                          {formatDate(donation.timestamp)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">
                          {formatCurrency(donation.amount)}
                        </p>
                        <p className="text-sm text-blue-600">
                          {donation.chain}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Contribution Sidebar - Main Focus */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <div className="bg-white rounded-2xl p-8 card-shadow border border-gray-100">
                <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">
                  Support This Campaign
                </h3>
                
                {/* Chain Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Choose Blockchain
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {campaign.chains.map((chain) => (
                      <button
                        key={chain}
                        onClick={() => setSelectedChain(chain)}
                        className={`p-3 rounded-lg border-2 transition-all font-medium ${
                          selectedChain === chain
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        {chain}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Donation Amount */}
                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-3">
                    Donation Amount
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={donationAmount}
                      onChange={(e) => setDonationAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-lg font-semibold"
                    />
                    <span className="absolute right-4 top-4 text-gray-500 font-medium">
                      {selectedChain === 'Ethereum' ? 'ETH' : selectedChain === 'Solana' ? 'SOL' : 'BTC'}
                    </span>
                  </div>
                </div>

                {/* Quick Amount Buttons */}
                <div className="mb-6">
                  <div className="grid grid-cols-3 gap-2">
                    {['0.1', '0.5', '1.0'].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setDonationAmount(amount)}
                        className="p-2 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 text-sm font-medium transition-all"
                      >
                        {amount}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Donate Button - Main Focus */}
                <button
                  onClick={handleDonate}
                  disabled={!donationAmount}
                  className="w-full bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-400 text-white py-4 rounded-full font-bold text-lg transition-all hover:scale-105 shadow-lg disabled:hover:scale-100 disabled:cursor-not-allowed mb-6"
                >
                  {donationAmount ? `Donate ${donationAmount} ${selectedChain === 'Ethereum' ? 'ETH' : selectedChain === 'Solana' ? 'SOL' : 'BTC'}` : 'Enter Amount to Donate'}
                </button>

                {/* Campaign Stats */}
                <div className="border-t border-gray-200 pt-6">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Total Raised</span>
                      <span className="font-bold text-gray-900">{formatCurrency(campaign.raised)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Goal</span>
                      <span className="font-bold text-gray-900">{formatCurrency(campaign.goal)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Progress</span>
                      <span className="font-bold text-green-600">{progressPercentage}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Donors</span>
                      <span className="font-bold text-gray-900">{campaignDonations.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Share Section */}
      <div className="border-t border-gray-200 pt-6 mt-6">
        <p className="text-sm text-gray-600 text-center mb-3">
          Help spread the word
        </p>
        <div className="flex justify-center gap-3">
          <button className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors">
            Share
          </button>
          <button className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200 transition-colors">
            Copy Link
          </button>
        </div>
      </div>
    </div>
  )
}
