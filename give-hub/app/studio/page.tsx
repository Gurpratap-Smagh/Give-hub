'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/auth-context'
import Spinner from '@/components/spinner'
import type { Campaign } from '@/lib/utils/types';
import { CampaignsGrid } from '@/components/campaigns-grid'
import CampaignEditForm from '@/components/campaign-edit-form'
import { UnsyncedCampaignCard } from '@/components/unsynced-campaign-card'
import { showError, showSuccess } from '@/components/notification-manager'
import { formatCurrency } from '@/lib/utils/format'
// No-escrow: withdrawals disabled, so web3 withdraw actions are removed from UI



export default function CreatorStudioPage() {
  const { user, isLoading } = useAuth()
  const [syncedCampaigns, setSyncedCampaigns] = useState<Campaign[]>([])
  const [unsyncedCampaigns, setUnsyncedCampaigns] = useState<Campaign[]>([])
  const [loadingCampaigns, setLoadingCampaigns] = useState(true)
  const [showFundsNotice, setShowFundsNotice] = useState(true)

  // Edit state
  const [editing, setEditing] = useState<Campaign | null>(null)
  const [saving, setSaving] = useState(false)
  // No-escrow: remove withdraw states

  // Fetch verified synced and unsynced campaigns using same API logic as homepage
  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        if (!user?.id) return;
        
        // Optimize: Single API call with creator filter to reduce requests
        const [syncedRes, unsyncedRes] = await Promise.all([
          fetch(`/api/campaigns?creatorId=${user.id}`),
          fetch(`/api/campaigns?showUnsynced=true&creatorId=${user.id}`),
        ])
        
        const syncedJson = await syncedRes.json()
        const unsyncedJson = await unsyncedRes.json()
        
        if (syncedJson?.success) {
          setSyncedCampaigns(syncedJson.campaigns as Campaign[])
        }
        if (unsyncedJson?.success) {
          setUnsyncedCampaigns(unsyncedJson.campaigns as Campaign[])
        }
      } catch (error) {
        console.error('Error fetching campaigns:', error)
      } finally {
        setLoadingCampaigns(false)
      }
    }

    fetchCampaigns()
  }, [user?.id])

  const totalRaised = useMemo(() => {
    // Sum only synced campaigns' raised amounts (stored as cents)
    return syncedCampaigns.reduce((sum, c) => sum + (Number(c.raised) || 0), 0)
  }, [syncedCampaigns])

  const myCampaignsCount = useMemo(() => {
    return (syncedCampaigns.length + unsyncedCampaigns.length)
  }, [syncedCampaigns.length, unsyncedCampaigns.length])

  const syncedGridCampaigns: Campaign[] = useMemo(() => {
    return syncedCampaigns.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      image: c.image,
      raised: c.raised,
      goal: c.goal,
      creatorId: c.creatorId,
      chains: c.chains,
      category: c.category,
      onChain: c.onChain,
      createdAt: c.createdAt || new Date().toISOString(),
      updatedAt: c.updatedAt || new Date().toISOString(),
      donations: c.donations || [],
      contractOwnership: c.contractOwnership || [],
    }))
  }, [syncedCampaigns]);

  const unsyncedGridCampaigns: Campaign[] = useMemo(() => {
    return unsyncedCampaigns.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      image: c.image,
      raised: c.raised,
      goal: c.goal,
      creatorId: c.creatorId,
      chains: c.chains,
      category: c.category,
      createdAt: c.createdAt || new Date().toISOString(),
      updatedAt: c.updatedAt || new Date().toISOString(),
      donations: c.donations || [],
      contractOwnership: c.contractOwnership || [],
    }));
  }, [unsyncedCampaigns]);

  // No-escrow: remove on-chain campaign helpers (unused)

  // Track any error messages
  const [error, setError] = useState<string | null>(null)

  // Save handler for edits
  const handleSave = async (update: Partial<Campaign>) => {
    if (!editing) return
    try {
      setSaving(true)
      // Update campaign off-chain
      const res = await fetch(`/api/campaigns/${editing.id}/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Save failed')

      // Update local state
      setSyncedCampaigns((prev) => prev.map((c) => (c.id === editing.id ? { ...c, ...update } as Campaign : c)))
      setUnsyncedCampaigns((prev) => prev.map((c) => (c.id === editing.id ? { ...c, ...update } as Campaign : c)))
      setEditing(null)
      showSuccess('Campaign updated successfully', 'Update Complete')
    } catch (e) {
      console.error(e)
      showError('Failed to update campaign', 'Update Failed')
      setError('Failed to update campaign')
    } finally {
      setSaving(false)
    }
  }

  // No-escrow: withdrawals removed

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 flex items-center gap-3">
          <Spinner size={20} />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl card-shadow border border-gray-100 p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Please sign in</h1>
          <p className="text-gray-600 mb-6">You must be signed in to access the Creator Studio.</p>
          <Link href="/auth" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-full font-semibold transition-colors">
            Go to Sign In
          </Link>
        </div>
      </div>
    )
  }

  if (user.role !== 'creator') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl card-shadow border border-gray-100 p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Creator access only</h1>
          <p className="text-gray-600 mb-6">This page is only available to creators.</p>
          <Link href="/" className="bg-gray-900 hover:bg-black text-white px-6 py-2 rounded-full font-semibold transition-colors">
            Back to Home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Creator Panel</h1>
        {loadingCampaigns && (
          <div className="flex items-center">
            <Spinner size={18} />
          </div>
        )}
      </div>

      {/* Creator disclaimer: requires ZetaChain Athens testnet funds */}
      {showFundsNotice && (
        <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-xl p-4 flex items-start gap-3">
          <div className="mt-0.5">ℹ️</div>
          <div className="flex-1 text-sm">
            <p className="font-semibold">Creators: ensure you have ZetaChain testnet funds</p>
            <p className="mt-1 text-blue-800">
              To create or sync campaigns, your connected wallet must be on <span className="font-medium">ZetaChain Athens Testnet (chainId 7001)</span> with
              <span className="font-medium"> ZETA</span> for gas. Preferred token is <span className="font-medium">WZETA</span>.
              Without funds, wallet calls can fail with generic errors like &quot;Unexpected error&quot;.
            </p>
          </div>
          <button
            onClick={() => setShowFundsNotice(false)}
            className="text-blue-700 hover:text-blue-900 text-sm font-semibold"
            aria-label="Dismiss notice"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Your Campaigns</p>
          <p className="text-3xl font-bold text-gray-900">{myCampaignsCount}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Total Raised</p>
          <p className="text-3xl font-bold text-gray-900">{formatCurrency(totalRaised, 'USD', true)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Status</p>
          <p className="text-3xl font-bold text-gray-900">{myCampaignsCount > 0 ? 'Active' : 'Getting Started'}</p>
        </div>

        {/* On-chain Controls removed in no-escrow mode */}
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>
      )}

      {/* Your Campaigns */}
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Your Campaigns</h2>

      {/* Campaigns Grid with blur after 6 */}
      <div className="relative">
        {/* Show loading state while campaigns load */}
        <CampaignsGrid 
          initialCampaigns={syncedGridCampaigns} 
          showAddCampaignCard={true}
          isLoading={loadingCampaigns}
        />
      </div>
      
      {/* Unsynced Campaigns Section */}
      {unsyncedGridCampaigns.length > 0 && (
        <>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Unsynced Campaigns</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {unsyncedCampaigns.map((campaign) => (
              <UnsyncedCampaignCard
                key={campaign.id}
                campaign={campaign}
                onSynced={(campaignId, onChainData) => {
                  // Move from unsynced -> synced with upsert (replace if exists)
                  // Build the updated campaign using the current closure-scoped "campaign"
                  const updated = { ...campaign, onChain: onChainData }
                  // First, upsert into synced list (replace if already present to avoid duplicates)
                  setSyncedCampaigns(prev => {
                    const idx = prev.findIndex(c => c.id === campaignId)
                    if (idx !== -1) {
                      const next = prev.slice()
                      next[idx] = { ...prev[idx], ...updated }
                      return next
                    }
                    return [...prev, updated]
                  })
                  // Then, remove from unsynced list
                  setUnsyncedCampaigns(prev => prev.filter(c => c.id !== campaignId))
                }}
              />
            ))}
          </div>
        </>
      )}

      {/* Removed redundant editable list panel */}

      {/* Editor Panel */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditing(null)} />
          <div className="relative bg-white w-full md:w-[720px] max-h-[90vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Edit Campaign</h3>
              {saving && <Spinner size={20} />} 
              <button onClick={() => setEditing(null)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <CampaignEditForm
              campaign={editing}
              onSave={async (u) => handleSave(u as Partial<Campaign>)}
              lockGoalAndChains
            />
          </div>
        </div>
      )}

    </div>
  )
}
