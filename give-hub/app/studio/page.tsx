'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/auth-context'
import Spinner from '@/components/spinner'
import { Campaign } from '@/_dev/mock-db/database';
import CampaignsGrid, { Campaign as GridCampaign } from '@/components/campaigns-grid'
import CampaignEditForm from '@/components/campaign-edit-form'
import { notify } from '@/lib/utils/notify'



export default function CreatorStudioPage() {
  const { user, isLoading } = useAuth()
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([])
  const [loadingCampaigns, setLoadingCampaigns] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit state
  const [editing, setEditing] = useState<Campaign | null>(null)
  const [saving, setSaving] = useState(false)

  // Fetch all campaigns (client-side) and filter to creator
  useEffect(() => {
    let mounted = true
    const fetchCampaigns = async () => {
      try {
        setLoadingCampaigns(true)
        const res = await fetch('/api/campaigns')
        const data = await res.json()
        if (mounted) {
          if (data?.success) {
            setAllCampaigns(data.campaigns || [])
          } else {
            setError('Failed to load campaigns')
          }
        }
      } catch {
        if (mounted) setError('Failed to load campaigns')
      } finally {
        if (mounted) setLoadingCampaigns(false)
      }
    }
    fetchCampaigns()
    return () => { mounted = false }
  }, [])

  const myCampaigns: Campaign[] = useMemo(() => {
    if (!user) return []
    return (allCampaigns || []).filter((c) => c.creatorId === user.id)
  }, [allCampaigns, user])

  const totalRaised = useMemo(() => {
    return myCampaigns.reduce((sum, c) => sum + (Number(c.raised) || 0), 0)
  }, [myCampaigns])

  const gridCampaigns: GridCampaign[] = useMemo(() => {
    return myCampaigns.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      image: c.image,
      raised: c.raised,
      goal: c.goal,
      chains: c.chains,
      category: c.category,
    }))
  }, [myCampaigns])

  // Save handler for edits
  const handleSave = async (update: Partial<Campaign>) => {
    if (!editing) return
    try {
      setSaving(true)
      const res = await fetch(`/api/campaigns/${editing.id}/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })
      const json = await res.json()
      if (!res.ok || !json?.success) throw new Error(json?.error || 'Save failed')

      // Update local state
      setAllCampaigns((prev) => prev.map((c) => (c.id === editing.id ? { ...c, ...update } as Campaign : c)))
      setEditing(null)
      notify('Campaign updated successfully', 'success')
    } catch (e) {
      console.error(e)
      notify('Failed to update campaign', 'error')
    } finally {
      setSaving(false)
    }
  }

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
      <div className="mb-2">
        <h1 className="text-3xl font-bold text-gray-900">Creator Panel</h1>
      </div>

      {/* Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Your Campaigns</p>
          <p className="text-3xl font-bold text-gray-900">{myCampaigns.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Total Raised</p>
          <p className="text-3xl font-bold text-gray-900">${totalRaised.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-1">Status</p>
          <p className="text-3xl font-bold text-gray-900">{myCampaigns.length > 0 ? 'Active' : 'Getting Started'}</p>
        </div>
        {/* Web3 Financials Placeholder */}
        <div className="md:col-span-3 p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-center">
            <div className="text-purple-600 mr-3">💸</div>
            <div>
              <p className="text-sm text-purple-800 font-medium">Web3 Financials Coming Soon</p>
              <p className="text-xs text-purple-700 mt-1">Wallet-based revenue and on-chain stats will appear here. The schema already includes placeholders for contract ownership and wallet addresses.</p>
            </div>
          </div>
        </div>
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
        {loadingCampaigns ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 flex items-center gap-3">
            <Spinner size={20} />
            <p className="text-gray-600">Loading campaigns...</p>
          </div>
        ) : (
          <CampaignsGrid initialCampaigns={gridCampaigns} gradientFromClass="from-blue-100" />
        )}
      </div>

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

      {/* AI placeholder note */}
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center">
          <div className="text-green-600 mr-3">🤖</div>
          <div>
            <p className="text-sm text-green-800 font-medium">AI Editing Coming Soon</p>
            <p className="text-xs text-green-700 mt-1">You&apos;ll soon be able to use AI to improve your campaign content directly from here.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
