'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth/auth-context'
import { CampaignsGrid } from '@/components/campaigns-grid'
import type { Campaign } from '@/lib/db'
import Link from 'next/link'
import Spinner from '@/components/spinner'

export default function CreatorDashboard() {
  const { user, isLoading } = useAuth()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user || isLoading) return

    const fetchCampaigns = async () => {
      try {
        const response = await fetch('/api/campaigns?creator=true', {
          credentials: 'include'
        })
        
        if (!response.ok) {
          throw new Error('Failed to fetch campaigns')
        }
        
        const data = await response.json()
        setCampaigns(data.campaigns || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchCampaigns()
  }, [user, isLoading])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Spinner size={20} />
          <p className="text-gray-600 dark:text-gray-400">Loading your profile...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-600 mb-6">Please sign in to access your creator dashboard.</p>
          <Link href="/auth" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-full font-semibold transition-colors">
            Sign In
          </Link>
        </div>
      </div>
    )
  }

  const syncedCampaigns = campaigns.filter(c => !!c.onChain)
  const unsyncedCampaigns = campaigns.filter(c => !c.onChain)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Creator Dashboard</h1>
              <p className="text-xl text-gray-600 dark:text-gray-400">Manage your campaigns and track progress</p>
            </div>
            <Link
              href="/"
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
            >
              ← Back to Home
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Total Campaigns</h3>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{loading ? '-' : campaigns.length}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Synced</h3>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">{loading ? '-' : syncedCampaigns.length}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Unsynced</h3>
            <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{loading ? '-' : unsyncedCampaigns.length}</p>
          </div>
        </div>

        {/* Show loading skeletons when campaigns are loading */}
        {loading ? (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Your Campaigns</h2>
            <CampaignsGrid
              initialCampaigns={[]}
              showAddCampaignCard={true}
              showUnsyncedCampaigns={false}
              enableLiveStatus={false}
            />
          </div>
        ) : (
          <>
            {/* Synced Campaigns Section */}
            <div className="mb-12">
              <CampaignsGrid
                initialCampaigns={syncedCampaigns}
                showAddCampaignCard={true}
                showUnsyncedCampaigns={false}
                enableLiveStatus={true}
                sectionTitle="Your Campaigns"
              />
            </div>

            {/* Unsynced Campaigns Section - only show if campaigns exist */}
            {unsyncedCampaigns.length > 0 && (
              <div className="mb-12">
                <CampaignsGrid
                  initialCampaigns={unsyncedCampaigns}
                  showAddCampaignCard={false}
                  showUnsyncedCampaigns={true} 
                  enableLiveStatus={false}
                  sectionTitle="Unsynced Campaigns"
                />
                <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-yellow-800 dark:text-yellow-200 text-sm">
                    <strong>Note:</strong> Unsynced campaigns are not yet deployed to the blockchain. 
                    They exist only in our database and cannot receive donations until synced.
                  </p>
                </div>
              </div>
            )}

            {/* Empty state */}
            {campaigns.length === 0 && (
              <div className="text-center py-12">
                <div className="max-w-md mx-auto">
                  <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-6 w-24 h-24 mx-auto mb-6 flex items-center justify-center">
                    <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No campaigns yet</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6">Create your first campaign to start fundraising for your cause.</p>
                  <Link
                    href="/create"
                    className="inline-flex items-center px-6 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
                  >
                    Create Your First Campaign
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
