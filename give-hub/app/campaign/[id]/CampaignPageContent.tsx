'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import type { Campaign } from '@/lib/db'

// Extended Creator type with name field
type Creator = {
  id?: string;
  name?: string;
}

// Extended types for campaign with creator and on-chain info
type CampaignWithCreator = Campaign & {
  creator?: Creator | null;
  onChain?: {
    campaignId?: string;
    contractAddress?: string;
    chainId?: number;
    isActive?: boolean;
    hasStarted?: boolean;
  };
  status: 'active' | 'paused' | 'deleted';
  creatorId?: string;
  syncId?: string;
}

// Basic Donation interface to match library definition
interface Donation {
  amount: number;
  campaignId: string;
  name?: string;
  chain: string;
  timestamp: number;
  createdAt: Date;
}

// Donation with additional address information
type DonationWithAddr = Donation & {
  donorAddress?: string;
  txHash?: string;
  address?: string;
  note?: string;
}

import Spinner from '@/components/spinner'
import Image from 'next/image'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils/format'
import { useAuth } from '@/lib/auth/auth-context'
import { notify } from '@/lib/utils/notify'
import { getCampaignInfo } from '@/lib/web3/client'

import CampaignEditForm from '@/components/campaign-edit-form'
import PaymentModal from '@/components/payment-modal'
import DonationsLivePane from './DonationsLivePane'

// LocalStorage donation entry type to eliminate any[]
interface LocalDonationEntry {
  campaignId: string;
  name?: string;
  amount: number;
  chain: string;
  timestamp: string; // ISO string
}

function isLocalDonationEntry(v: unknown): v is LocalDonationEntry {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.campaignId === 'string'
    && (o.name === undefined || typeof o.name === 'string')
    && typeof o.amount === 'number'
    && typeof o.chain === 'string'
    && typeof o.timestamp === 'string';
}

interface CampaignEditFormRef extends HTMLFormElement {
  submitForm?: () => void;
  requestSubmit: () => void;
  querySelector: HTMLFormElement['querySelector'];
  applyAI?: (partial: Partial<{ title: string; description: string; category: string }>) => void;
}

// Type for payment success handler to match PaymentModal expectations
type PaymentSuccessHandler = (amount: number, chain: string) => void;

/**
 * FILE: app/campaign/[id]/CampaignPageContent.tsx
 * PURPOSE: Client component for campaign detail page UI and interactions.
 */

// The initialCampaign prop now includes the creator object
const CARD_PLACEHOLDER_2x1 = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e5e7eb" />
        <stop offset="1" stop-color="#d1d5db" />
      </linearGradient>
    </defs>
    <rect width="800" height="400" fill="url(#g)"/>
    <g fill="#9ca3af">
      <circle cx="400" cy="190" r="36"/>
      <rect x="340" y="238" width="120" height="14" rx="7"/>
    </g>
  </svg>
`)

// Removed Recent Donations list UI and associated on-chain fetching to prevent RPC errors

export default function CampaignPageContent({ initialCampaign, initialDonations }: { initialCampaign: CampaignWithCreator, initialDonations: Donation[] }) {
  const { user } = useAuth()
  const [campaign, setCampaign] = useState(initialCampaign)
  const [donations, setDonations] = useState<DonationWithAddr[]>(initialDonations as DonationWithAddr[])
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editPreview, setEditPreview] = useState<CampaignWithCreator>(campaign)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const formRef = useRef<CampaignEditFormRef>(null)
  const [imgSrc, setImgSrc] = useState<string>(campaign.image || CARD_PLACEHOLDER_2x1)
  const [onChainActive, setOnChainActive] = useState(campaign.onChain?.isActive) // Used in sync function
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [editImage, setEditImage] = useState<string>(campaign.image || '')
  const [imageGenLoading, setImageGenLoading] = useState(false)
  const [isAiEditing, setIsAiEditing] = useState(false)

  useEffect(() => {
    setEditPreview(campaign)
  }, [campaign])
  useEffect(() => {
    setImgSrc(campaign.image || CARD_PLACEHOLDER_2x1)
  }, [campaign.image])
  useEffect(() => {
    if (isEditing) {
      setEditImage(campaign.image || '')
    }
  }, [isEditing, campaign.image])
  
  // Check actual contract pause state on load
  useEffect(() => {
    const checkContractStatus = async () => {
      if (campaign.onChain?.campaignId) {
        try {
          const campaignId = BigInt(campaign.onChain.campaignId)
          const campaignInfo = await getCampaignInfo(campaignId)
          setOnChainActive(campaignInfo.active)
        } catch {
          notify('Failed to check contract status', 'error')
        }
      }
    }
    checkContractStatus()
  }, [campaign.onChain?.campaignId])

  // Helpers for image selection/upload (base64 inline like create page)
  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleImageSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      notify('Please select an image file', 'error')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      notify('Image size must be less than 5MB', 'error')
      return
    }
    const base64 = await convertToBase64(file)
    setEditImage(base64)
  }

  // Generate image using description/title context
  const generateImageFromDescription = async () => {
    if (!user || user.role !== 'creator') {
      return notify('Only creators can generate images.', 'error')
    }
    try {
      setImageGenLoading(true)
      const selectedCategory = (editPreview.category || 'general')
      const subject = (editPreview.description && editPreview.description.trim())
        ? editPreview.description
        : `Title: ${editPreview.title || 'Charitable campaign'}`
      const prompt = `Generate a single high-quality 2:1 landscape image that fills a 2:1 cover frame perfectly (edge-to-edge, no borders, no text or watermarks). Compose safely so key subjects remain fully visible within the 2:1 crop.\n\nSubject description:\n${subject}\n\nCategory/theme: ${selectedCategory}\n\nStyle: photorealistic or clean illustration, balanced lighting, clear focal point, visually appealing for a cover.`
      const res = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prompt })
      })
      const data: { imageBase64?: string; mime?: string; error?: string; message?: string; details?: string } = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = data.error || data.details || data.message || 'Failed to generate image.'
        notify(msg, 'error')
        return
      }
      const base64 = data.imageBase64
      if (!base64) {
        return notify('The AI did not return an image. Try refining the description.', 'error')
      }
      const dataUrl = `data:${data.mime || 'image/png'};base64,${base64}`
      setEditImage(dataUrl)
      notify('Generated image applied', 'success')
    } catch {
      notify('Failed to generate image.', 'error')
    } finally {
      setImageGenLoading(false)
    }
  }

  // AI-assisted text editing for title/description
  const handleAiEdit = async () => {
    if (isAiEditing) return
    setIsAiEditing(true)
    try {
      const payload = {
        title: editPreview.title,
        description: editPreview.description,
        goal: editPreview.goal,
        category: editPreview.category,
      }
      const prompt = `TASK: Rewrite the campaign title and description.\n\nRules:\n- Keep the title short and clear.\n- Description: 2–5 concise sentences, inspiring and specific.\n- Do not invent facts.\n- No headings, no lists, no markdown, no commentary.\n\nInput JSON:\n${JSON.stringify(payload)}\n\nOutput: Return ONLY a strict JSON object with keys "title" and "description".`
      const res = await fetch('/api/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prompt, mode: 'rewrite' })
      })
      if (!res.ok) {
        const errData: unknown = await res.json().catch(() => ({}))
        const errObj = (typeof errData === 'object' && errData) ? errData as { error?: string; message?: string } : {}
        const msg = errObj.error || errObj.message || 'AI request failed.'
        notify(msg, 'error')
        return
      }
      const data = await res.json().catch(() => ({})) as { text?: string }
      const text = (data.text || '').trim()
      let update: Partial<{ title: string; description: string }> | null = null
      const unfence = (s: string) => s
        .replace(/^```[a-zA-Z]*\n?|```$/g, '')
        .replace(/```[\s\S]*?```/g, (m) => m.replace(/```[a-zA-Z]*\n?|```/g, ''))
      const extractJson = (s: string) => {
        const cleaned = unfence(s).trim()
        if (cleaned.startsWith('{') && cleaned.endsWith('}')) return cleaned
        const start = cleaned.indexOf('{')
        const end = cleaned.lastIndexOf('}')
        if (start !== -1 && end !== -1 && end > start) return cleaned.slice(start, end + 1)
        return ''
      }
      const maybeJson = extractJson(text)
      if (maybeJson) {
        try { update = JSON.parse(maybeJson) } catch {}
      }
      if (!update || (!update.title && !update.description)) {
        update = { description: text }
      }
      // Apply to child form (if exposed) and local preview state
      formRef.current?.applyAI?.(update)
      setEditPreview(prev => ({
        ...prev,
        title: typeof update?.title === 'string' && update.title.trim() ? update.title : prev.title,
        description: typeof update?.description === 'string' && update.description.trim() ? update.description : prev.description,
      }))
      notify('Applied AI suggestions', 'success')
    } catch {
      notify('Failed to apply AI suggestions.', 'error')
    } finally {
      setIsAiEditing(false)
    }
  }

  // Check if user is the creator of this campaign
  const isCreator = useMemo(() => {
    return !!user && !!campaign.creatorId && user.id === campaign.creatorId
  }, [user, campaign.creatorId])

  // Supported payment methods: prefer campaign.chains; otherwise show defaults
  // Currently only used for PaymentModal but prepared here for consistency
  const DEFAULT_METHODS = ['zeta_native', 'sepolia', 'solana', 'btc']
  const candidateChains = (Array.isArray(campaign.chains) && campaign.chains.length > 0) ? campaign.chains : DEFAULT_METHODS
  // filteredChains will be used when blockchain payment methods are fully integrated
  const filteredChains = candidateChains.filter((c) => String(c).toLowerCase() !== 'local')
  // These chains are passed to the PaymentModal component
  const supportedChains = filteredChains.length > 0 ? filteredChains : DEFAULT_METHODS

  // Calculate total raised amount with better handling of different currencies
  const raisedLocal = useMemo(() => {
    // Group donations by currency/chain for potential future display improvements
    const byCurrency: Record<string, number> = {}
    let total = 0

    // Process all donations
    donations.forEach(donation => {
      const amount = Number(donation.amount) || 0
      const chain = donation.chain || 'unknown'
      
      // Track by currency for potential future UI features
      if (chain) {
        byCurrency[chain] = (byCurrency[chain] || 0) + amount
      }
      
      total += amount
    })
    
    return total
  }, [donations])

  const handlePaymentSuccess: PaymentSuccessHandler = (amount: number, chain: string) => {
    // Create and persist a donation entry (local + server total)
    const entry: DonationWithAddr = {
      amount,
      campaignId: campaign.id,
      createdAt: new Date(),
      timestamp: Date.now(),
      chain,
      donorAddress: user?.id,
      address: user?.id,
      name: user?.id || 'Anonymous',
    }

    // Update UI immediately
    setDonations(prev => [entry, ...prev])

    // Persist to localStorage for rehydration (align with givehub3 behavior)
    try {
      if (typeof window !== 'undefined') {
        const raw = window.localStorage.getItem('gh_donations')
        const parsed = raw ? (JSON.parse(raw) as unknown) : []
        const arr: LocalDonationEntry[] = Array.isArray(parsed) ? (parsed.filter(isLocalDonationEntry) as LocalDonationEntry[]) : []
        arr.push({
          campaignId: campaign.id,
          name: entry.name,
          amount: entry.amount,
          chain: entry.chain,
          timestamp: new Date().toISOString(),
        })
        window.localStorage.setItem('gh_donations', JSON.stringify(arr))
      }
    } catch {}

    // Update campaign raised amount in database
    ;(async () => {
      // First, persist the donation document in MongoDB
      try {
        await fetch(`/api/campaigns/${campaign.id}/donations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: entry.name || 'Anonymous',
            amount,
            chain,
            timestamp: entry.createdAt,
          }),
        })
      } catch {
        notify('Donation saved locally, but failed to save on server', 'error')
      }

      // Then, update the campaign raised total on the server
      try {
        const res = await fetch(`/api/campaigns/${campaign.id}/update-raised`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount })
        })
        if (res.ok) {
          const data = await res.json()
          if (data?.newTotalDisplay != null) {
            setCampaign(prev => ({ ...prev, raised: data.newTotalDisplay }))
          } else if (data?.newTotal != null) {
            setCampaign(prev => ({ ...prev, raised: data.newTotal / 100 }))
          }
        }
      } catch {
        notify('Donation processed, but failed to update server total. It will sync later.', 'info')
      } finally {
        notify('Donation successful. Thank you for your support!', 'success')
        setShowPaymentModal(false)
      }
    })()
  }

  // Handle saving campaign edits
  const handleSaveCampaign = async (formData: Partial<Campaign>) => {
    setIsSaving(true)
    try {
      // Update the campaign with the new data
      const payload: Record<string, unknown> = { ...formData }
      if (editImage && editImage.startsWith('data:image/')) {
        payload.image = editImage
      }
      const response = await fetch(`/api/campaigns/${campaign.id}/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error('Failed to update campaign')
      }

      // Get the updated campaign data
      const updatedCampaign = await response.json()
      
      // Update local state
      setCampaign(updatedCampaign)
      setEditPreview(updatedCampaign)
      setIsEditing(false)
      notify('Campaign updated successfully', 'success')
    } catch {
      notify('Failed to update campaign', 'error')
    } finally {
      setIsSaving(false)
    }
  }
  
  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container mx-auto px-4 py-8">
      {/* Edit Mode */}
      {isEditing ? (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">Edit Campaign</h1>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleAiEdit}
                disabled={isAiEditing}
                className="px-4 py-2 text-sm rounded-full border-2 border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300 disabled:opacity-60"
              >
                {isAiEditing ? 'Thinking...' : 'Edit with AI'}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 text-sm rounded-full border-2 border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => formRef.current?.requestSubmit()}
                disabled={isSaving}
                className="px-4 py-2 text-sm rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? (
                  <span className="flex items-center">
                    <Spinner className="mr-2" />
                    Saving...
                  </span>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>

          {/* Two-column layout: Form left, Live preview right */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Form Card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
              <CampaignEditForm
                ref={formRef}
                campaign={editPreview}
                onSave={handleSaveCampaign}
                onChange={(partial) => setEditPreview(prev => ({ ...prev, ...partial }))}
              />
            </div>

            {/* Live Preview Card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-0 overflow-hidden">
              {/* Image header */}
              <div className="relative w-full h-56 bg-gray-100">
                {editImage ? (
                  <Image
                    src={editImage}
                    alt="Preview image"
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover"
                    priority
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">No image selected</div>
                )}
                {/* Overlay controls */}
                <div className="absolute top-3 right-3 flex items-center gap-2">
                  {user?.role === 'creator' && (
                    <button
                      type="button"
                      onClick={generateImageFromDescription}
                      disabled={imageGenLoading}
                      className={`inline-flex items-center justify-center w-10 h-10 rounded-full ${imageGenLoading ? 'bg-blue-600/40 cursor-not-allowed' : 'bg-blue-600/50 hover:bg-blue-600/60'} text-white shadow-md backdrop-blur-sm focus:outline-none`}
                      title={imageGenLoading ? 'Generating…' : 'Generate image'}
                      aria-busy={imageGenLoading}
                    >
                      {imageGenLoading ? (
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" role="status" aria-label="Loading">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                        </svg>
                      ) : (
                        <span className="text-lg leading-none">✦</span>
                      )}
                    </button>
                  )}
                  {/* Pencil overlay trigger */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-black/50 hover:bg-black/60 transition text-white shadow-md"
                    title="Change image"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                      <path d="M16.862 3.487a1.5 1.5 0 0 1 2.121 0l1.53 1.53a1.5 1.5 0 0 1 0 2.121l-9.9 9.9a1.5 1.5 0 0 1-.67.386l-4.019 1.004a.75.75 0 0 1-.91-.91l1.003-4.02a1.5 1.5 0 0 1 .386-.669l9.9-9.9Zm-2.828 2.828L5.9 14.45a.5.5 0 0 0-.129.223l-.692 2.773 2.773-.692a.5.5 0 0 0 .223-.129l8.134-8.133-2.167-2.167Z" />
                    </svg>
                  </button>
                </div>
              </div>
              {/* Content */}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  {editPreview.category ? (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                      {editPreview.category}
                    </span>
                  ) : null}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">
                  {editPreview.title || 'Your campaign title'}
                </h3>
                <p className="mt-2 text-sm text-gray-600 line-clamp-3">
                  {editPreview.description || 'Write a compelling description to inspire donations.'}
                </p>
                <div className="mt-4">
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: '0%' }} />
                  </div>
                  <div className="mt-2 text-sm text-gray-700 flex items-center justify-between">
                    <span>Goal: {editPreview.goal}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">{campaign.title}</h1>
              <div className="flex items-center mt-2 text-gray-600">
                <p>
                  Created by{' '}
                  {campaign.creatorId ? (
                    <Link href={`/profile/${campaign.creatorId}`} className="font-semibold text-blue-600 hover:underline">
                      {campaign.creator?.name || 'Anonymous'}
                    </Link>
                  ) : (
                    <span className="font-semibold">{campaign.creator?.name || 'Anonymous'}</span>
                  )}
                </p>
              </div>
            </div>
            {isCreator && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 rounded-full border-2 border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition font-semibold"
              >
                Edit Campaign
              </button>
            )}
          </div>

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left/Main Column */}
            <div className="lg:col-span-2">
              <div className="w-full h-96 relative mb-6 rounded-lg overflow-hidden shadow-xl">
                <Image
                  src={imgSrc}
                  alt={campaign.title}
                  fill
                  className="object-cover"
                  onError={() => setImgSrc(CARD_PLACEHOLDER_2x1)}
                  priority
                />
              </div>
              <div className="bg-white p-6 rounded-lg shadow">
                <h2 className="text-2xl font-bold mb-4">Story</h2>
                <p className="text-gray-700 whitespace-pre-wrap">{campaign.description}</p>
              </div>

              {/* Live Donations Feed */}
              <div className="mt-8">
                <DonationsLivePane 
                  campaignId={campaign.onChain?.campaignId || campaign.id} 
                  isActive={onChainActive !== null ? !!onChainActive : true} 
                />
              </div>
            </div>

            {/* Right/Sidebar Column */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                <div className="bg-white p-6 rounded-lg shadow-lg">
                  <h3 className="text-xl font-bold mb-4">Campaign Stats</h3>
                  {/* Supported Chains Display */}
                  <div className="mb-4">
                    <p className="text-sm text-gray-600 mb-2">Supported payment methods:</p>
                    <div className="flex gap-2 flex-wrap">
                      {supportedChains.map(chain => (
                        <span key={chain} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                          {String(chain)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Donate Button */}
                  <button 
                    onClick={() => setShowPaymentModal(true)} 
                    className="mx-auto block md:inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-6 h-12 rounded-full font-semibold text-base transition-colors shadow mb-6"
                  >
                    Donate Now
                  </button>

                  {/* Campaign Stats */}
                  <div className="border-top border-gray-200 pt-2 space-y-4">
                    <div className="flex justify-between items-center"><span className="text-gray-600">Total Raised</span><span className="font-bold text-gray-900">{formatCurrency(raisedLocal)}</span></div>
                    <div className="flex justify-between items-center"><span className="text-gray-600">Goal</span><span className="font-bold text-gray-900">{formatCurrency(campaign.goal)}</span></div>
                    <div className="flex justify-between items-center"><span className="text-gray-600">Progress</span><span className="font-bold text-green-600">{campaign.goal > 0 ? Math.min(100, Math.round((raisedLocal / campaign.goal) * 100)) : 0}%</span></div>
                    <div className="flex justify-between items-center"><span className="text-gray-600">Donors</span><span className="font-bold text-gray-900">{donations.length}</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      {/* Hidden file input for image upload in edit mode */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleImageSelect(f)
        }}
        className="hidden"
      />
      {/* Payment Modal */}
      <PaymentModal
        campaign={campaign}
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onPaymentSuccess={handlePaymentSuccess}
      />
      </div>
    </div>
  )
}
