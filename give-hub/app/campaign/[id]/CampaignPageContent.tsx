'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import type { Campaign, Donation, Creator } from '@/lib/db'
import Spinner from '@/components/spinner'
import Link from 'next/link'
import Image from 'next/image'
import { CampaignCard } from '@/components/campaign-card'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { useAuth } from '@/lib/auth/auth-context'
import { notify } from '@/lib/utils/notify'
import CampaignEditForm from '@/components/campaign-edit-form'
type CampaignEditFormRef = HTMLFormElement & { requestSubmit: () => void; applyAI?: (partial: Partial<{ title: string; description: string; category: string }>) => void }
import PaymentModal from '@/components/payment-modal'
import { ensureWalletOnChain, getCampaignInfo, getCampaignDonations, getLatestBlockNumber, getCampaignDonationsBetween } from '@/lib/web3/client'

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
type CampaignWithCreator = Campaign & { creator?: Creator | null };

// Donation list shows notes inline (no dropdown)
function DonationList({
  donations,
}: {
  donations: {
    name?: string
    amount?: number
    chain?: string
    timestamp: string | Date
    note?: string
  }[]
}) {
  const [expanded, setExpanded] = useState(false)

  const sorted = useMemo(
    () => [...donations].sort((a, b) => (b.amount || 0) - (a.amount || 0)),
    [donations]
  )
  const renderList = expanded ? sorted : sorted.slice(0, 3)
  // Notes are always shown inline; no toggle

  return (
    <>
      <ul className="space-y-3 max-h-96 overflow-y-auto pr-1">
        {renderList.map((d) => {
          const itemKey = `${(d.name || "anon").trim()}|${d.amount || 0}|${new Date(d.timestamp).toISOString()}`
          const noteText = (d.note || "").trim()
          const hasNote = noteText.length > 0

          return (
            <li
              key={itemKey}
              className="relative isolate p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition focus:outline-none focus:ring-2 focus:ring-blue-500/30 min-h-[64px]"
            >
              {/* Row: content left, button right (separate entity) */}
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">
                    {(d.name && d.name.trim()) || "Anonymous"} donated{" "}
                    <span className="text-green-600">{formatCurrency(d.amount || 0)}</span>{" "}
                    via {d.chain || "—"}
                  </p>
                  <p className="text-sm text-gray-500">{formatDate(d.timestamp)}</p>
                </div>

                {/* No dropdown button; notes are shown inline below */}
              </div>

              {/* Note box below (pushes content) */}
              {hasNote && (
                <div className="mt-3">
                  <div className="px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-700 text-sm whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {noteText}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {sorted.length > 3 && (
        <div className="pt-1">
          {!expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 text-gray-700 font-medium transition"
            >
              Show more
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 text-gray-700 font-medium transition"
            >
              Show less
            </button>
          )}
        </div>
      )}
    </>
  )
}


export default function CampaignPageContent({ initialCampaign, initialDonations }: { initialCampaign: CampaignWithCreator, initialDonations: Donation[] }) {
  const { user } = useAuth()
  const [campaign, setCampaign] = useState(initialCampaign)
  const [donations, setDonations] = useState<DonationWithAddr[]>(initialDonations as DonationWithAddr[])
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editPreview, setEditPreview] = useState<CampaignWithCreator>(campaign)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const formRef = useRef<CampaignEditFormRef>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [imageGenLoading, setImageGenLoading] = useState(false)
  // Maintain a safe image source with fallback to 2:1 SVG placeholder
  const [imgSrc, setImgSrc] = useState<string>(campaign.image || CARD_PLACEHOLDER_2x1)
  // Track the last Ethereum block we have polled up to (for incremental log queries)
  const lastPolledBlockRef = useRef<number | null>(null)
  // On-chain hydration state
  const ONCHAIN_ENABLED = (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER || 'local').toLowerCase() === 'zetachain'
  const [onChainActive, setOnChainActive] = useState<boolean | null>(null)
  const [syncId, setSyncId] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [donationsLoading, setDonationsLoading] = useState(false)
  const [donationsError, setDonationsError] = useState<string | null>(null)

  useEffect(() => {
    setEditPreview(campaign)
  }, [campaign])
  useEffect(() => {
    setImgSrc(campaign.image || CARD_PLACEHOLDER_2x1)
  }, [campaign.image])

  const isOwner = user?.id === campaign.creatorId

  // Default supported methods to 'Local' if campaign has no chains
  const supportedChains = (Array.isArray(campaign.chains) && campaign.chains.length > 0) ? campaign.chains : ['Local']

  // Hydrate donations for this campaign from localStorage (client-only)
  type LocalDonation = { campaignId: string; name: string; amount: number; chain: string; timestamp: string; address?: string }
  // Locally-extended donation to optionally include on-chain donor address and note
  type DonationWithAddr = Donation & { address?: string; note?: string }
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem('gh_donations')
      const list: unknown = raw ? JSON.parse(raw) : []
      const arr = Array.isArray(list) ? (list as LocalDonation[]) : []
      const filtered = arr.filter(d => d && d.campaignId === campaign.id)
      setDonations(filtered as unknown as DonationWithAddr[])
    } catch {
      setDonations([])
    }
  }, [campaign.id])

  // Hydrate on-chain status when mapping exists (no escrow: balance not tracked)
  useEffect(() => {
    const cid = campaign.onChain?.campaignId
    // Avoid invoking wallet extension when logged out
    if (!ONCHAIN_ENABLED || !cid || !user) return
    const run = async () => {
      try {
        const targetChainId = parseInt(process.env.NEXT_PUBLIC_ZETA_CHAIN_ID || '7001')
        // Only attempt to switch wallet when a wallet context exists
        try {
          if (typeof window !== 'undefined' && (window as any)?.ethereum) {
            await ensureWalletOnChain(targetChainId)
          }
        } catch {}
        const info = await getCampaignInfo(BigInt(cid))
        setOnChainActive(Boolean(info?.active))
      } catch (e) {
        console.error('Failed to hydrate on-chain data:', e)
        setOnChainActive(null)
      }
    }
    run()
  }, [campaign.onChain?.campaignId, ONCHAIN_ENABLED, user])

  // Fetch on-chain donation history on page load for all visitors (read-only via RPC)
  useEffect(() => {
    if (!ONCHAIN_ENABLED) return
    const idStr = campaign.onChain?.campaignId
    if (!idStr) return

    let cancelled = false
    ;(async () => {
      setDonationsLoading(true)
      setDonationsError(null)
      try {
        // Read logs via RPC provider; no wallet or user required
        const events = await getCampaignDonations(BigInt(idStr), 200_000)
        const symbol = (process.env.NEXT_PUBLIC_ZETA_NATIVE_SYMBOL || 'ZETA')
        const mapped = events.map(ev => ({
          campaignId: campaign.id,
          name: (ev.donorName && ev.donorName.trim()) ? ev.donorName.trim() : (ev.donor ? `${ev.donor.slice(0, 6)}...${ev.donor.slice(-4)}` : 'Anonymous'),
          amount: Number(ev.originalAmount),
          chain: symbol,
          timestamp: new Date(ev.timestamp),
          address: ev.donor,
          note: ev.note,
        })) as DonationWithAddr[]

        if (cancelled) return
        setDonations(prev => {
          const all = [...prev, ...mapped]
          const seen = new Set<string>()
          const deduped = all.filter(d => {
            const ts = (d.timestamp instanceof Date) ? d.timestamp.toISOString() : new Date(d.timestamp as unknown as string).toISOString()
            const key = `${d.campaignId}|${d.name}|${d.amount}|${d.chain}|${ts}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          deduped.sort((a, b) => {
            const ta = (a.timestamp instanceof Date) ? a.timestamp.getTime() : new Date(a.timestamp as unknown as string).getTime()
            const tb = (b.timestamp instanceof Date) ? b.timestamp.getTime() : new Date(b.timestamp as unknown as string).getTime()
            return tb - ta
          })
          return deduped
        })
      } catch (err: unknown) {
        const msg = (err as Error)?.message || 'Failed to load on-chain donations'
        if (!cancelled) setDonationsError(msg)
      } finally {
        if (!cancelled) setDonationsLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [ONCHAIN_ENABLED, campaign.onChain?.campaignId, campaign.onChain?.chainId, campaign.id])

  // Lightweight live polling: query only new logs since last seen block with a small overlap
  useEffect(() => {
    if (!ONCHAIN_ENABLED) return
    const idStr = campaign.onChain?.campaignId
    if (!idStr) return

    let mounted = true
    let timer: number | undefined
    const overlap = 6 // re-scan a few recent blocks to be safe across reorgs
    const intervalMs = Number(process.env.NEXT_PUBLIC_DONATIONS_POLL_MS || 10000)

    const start = async () => {
      // Initialize last seen block to current tip so we only pick up new donations from now on
      try {
        const tip = await getLatestBlockNumber()
        lastPolledBlockRef.current = tip
      } catch {}

      timer = window.setInterval(async () => {
        if (!mounted) return
        try {
          const latest = await getLatestBlockNumber()
          const last = lastPolledBlockRef.current
          if (!Number.isFinite(latest)) return
          if (last == null) {
            lastPolledBlockRef.current = latest
            return
          }
          if (latest <= last) return
          const fromBlock = Math.max(0, last - overlap + 1)
          const events = await getCampaignDonationsBetween(BigInt(idStr), fromBlock, latest)
          if (!mounted || !events?.length) {
            lastPolledBlockRef.current = latest
            return
          }
          const symbol = (process.env.NEXT_PUBLIC_ZETA_NATIVE_SYMBOL || 'ZETA')
          const mapped = events.map(ev => ({
            campaignId: campaign.id,
            name: (ev.donorName && ev.donorName.trim()) ? ev.donorName.trim() : (ev.donor ? `${ev.donor.slice(0, 6)}...${ev.donor.slice(-4)}` : 'Anonymous'),
            amount: Number(ev.originalAmount),
            chain: symbol,
            timestamp: new Date(ev.timestamp),
            address: ev.donor,
            note: ev.note,
          })) as DonationWithAddr[]
          setDonations(prev => {
            const all = [...prev, ...mapped]
            const seen = new Set<string>()
            const deduped = all.filter(d => {
              const ts = (d.timestamp instanceof Date) ? d.timestamp.toISOString() : new Date(d.timestamp as unknown as string).toISOString()
              const key = `${d.campaignId}|${d.name}|${d.amount}|${d.chain}|${ts}`
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })
            deduped.sort((a, b) => {
              const ta = (a.timestamp instanceof Date) ? a.timestamp.getTime() : new Date(a.timestamp as unknown as string).getTime()
              const tb = (b.timestamp instanceof Date) ? b.timestamp.getTime() : new Date(b.timestamp as unknown as string).getTime()
              return tb - ta
            })
            return deduped
          })
          lastPolledBlockRef.current = latest
        } catch {
          // best-effort; ignore transient RPC issues
        }
      }, intervalMs)
    }

    start()
    return () => {
      mounted = false
      if (timer) window.clearInterval(timer)
    }
  }, [ONCHAIN_ENABLED, campaign.onChain?.campaignId, campaign.id])

  // Allow creators to sync on-chain mapping when missing
  const handleSyncOnChain = async () => {
    if (!isOwner) return
    if (!syncId.trim()) {
      return notify('Enter the on-chain campaign ID to sync.', 'error')
    }
    const idStr = syncId.trim()
    if (!/^\d+$/.test(idStr)) {
      return notify('On-chain campaign ID must be a numeric string.', 'error')
    }
    const chainId = parseInt(process.env.NEXT_PUBLIC_ZETA_CHAIN_ID || '7001')
    const contract = process.env.NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS || ''
    if (!contract || contract.length !== 42) {
      return notify('Missing or invalid contract address in env.', 'error')
    }
    setIsSyncing(true)
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onChain: { chainId, contract, campaignId: idStr } }),
        credentials: 'include',
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error || j?.message || 'Failed to sync on-chain mapping')
      }
      const updated = await res.json()
      // API returns { success, campaign }
      const next = updated?.campaign || updated
      setCampaign((prev) => ({ ...prev, onChain: next?.onChain }))
      notify('On-chain mapping synced.', 'success')
    } catch (e) {
      console.error(e)
      notify(e instanceof Error ? e.message : 'Failed to sync on-chain mapping', 'error')
    } finally {
      setIsSyncing(false)
    }
  }

  // Progress percentage is computed where displayed; ensure UI supports >100% when needed.

  const handlePaymentSuccess = async (amount: number, chain: string) => {
    // Refresh donations from localStorage after a successful payment
    try {
      // Re-hydrate from localStorage after a successful payment
      if (typeof window !== 'undefined') {
        const raw = window.localStorage.getItem('gh_donations')
        const list: unknown = raw ? JSON.parse(raw) : []
        const arr = Array.isArray(list) ? (list as LocalDonation[]) : []
        const filtered = arr.filter(d => d && d.campaignId === campaign.id)
        setDonations(filtered as unknown as DonationWithAddr[])
      }
      // If on-chain is enabled and this campaign is mapped, re-fetch on-chain donation events now
      if (ONCHAIN_ENABLED && campaign.onChain?.campaignId) {
        try {
          // Best-effort ensure wallet is on the correct chain for log reads
          try {
            if (campaign.onChain?.chainId) {
              await ensureWalletOnChain(Number(campaign.onChain.chainId))
            }
          } catch {}
          const events = await getCampaignDonations(BigInt(campaign.onChain.campaignId), 200_000)
          const symbol = (process.env.NEXT_PUBLIC_ZETA_NATIVE_SYMBOL || 'ZETA')
          const mapped = events.map(ev => ({
            campaignId: campaign.id,
            name: (ev.donorName && ev.donorName.trim()) ? ev.donorName.trim() : (ev.donor ? `${ev.donor.slice(0, 6)}...${ev.donor.slice(-4)}` : 'Anonymous'),
            amount: Number(ev.originalAmount),
            chain: symbol,
            timestamp: new Date(ev.timestamp),
            address: ev.donor,
            note: ev.note,
          })) as DonationWithAddr[]
          setDonations(prev => {
            const all = [...prev, ...mapped]
            const seen = new Set<string>()
            const deduped = all.filter(d => {
              const ts = (d.timestamp instanceof Date) ? d.timestamp.toISOString() : new Date(d.timestamp as unknown as string).toISOString()
              const key = `${d.campaignId}|${d.name}|${d.amount}|${d.chain}|${ts}`
              if (seen.has(key)) return false
              seen.add(key)
              return true
            })
            deduped.sort((a, b) => {
              const ta = (a.timestamp instanceof Date) ? a.timestamp.getTime() : new Date(a.timestamp as unknown as string).getTime()
              const tb = (b.timestamp instanceof Date) ? b.timestamp.getTime() : new Date(b.timestamp as unknown as string).getTime()
              return tb - ta
            })
            return deduped
          })
        } catch (e) {
          console.warn('Failed to refresh on-chain donations after payment:', e)
        }
      }
      notify(`Successfully donated $${amount} via ${chain}!`, 'success')
    } catch (error) {
      console.error('Error refreshing donations:', error)
      notify(`Successfully donated $${amount} via ${chain}!`, 'success')
    }
  }

  // Generate an image from the current description using Gemini (creator-only)
  const generateImageFromDescription = async () => {
    if (!user || user.role !== 'creator') {
      return notify('Only creators can generate images.', 'error')
    }
    if (!editPreview.description || !editPreview.description.trim()) {
      return notify('Please add a description first.', 'error')
    }
    try {
      setImageGenLoading(true)
      const category = editPreview.category || 'general'
      const prompt = `create an image for the campaign based on it's description:\n\n${editPreview.description}\n\nand its category is: ${category}`
      const res = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        credentials: 'include',
      })
      type AIImageResponse = { imageBase64?: string; mime?: string; error?: string; message?: string }
      const data: AIImageResponse = await res.json().catch(() => ({} as AIImageResponse))
      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || 'Failed to generate image.'
        throw new Error(msg)
      }
      const base64 = data.imageBase64
      if (!base64) {
        // If API returns raw instead of parsed image
        return notify('The AI did not return an image. Please try refining the description.', 'error')
      }
      const dataUrl = `data:${data.mime || 'image/png'};base64,${base64}`
      handleFormChange({ image: dataUrl })
      notify('Generated image applied', 'success')
    } catch (e) {
      console.error(e)
      notify('Image generation failed. Please try again.', 'error')
    } finally {
      setImageGenLoading(false)
    }
  }

  const handleFormChange = (partial: Partial<Campaign>) => {
    setEditPreview(prev => ({ ...prev!, ...partial }))
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return notify('Please select an image file', 'error')
    if (file.size > 5 * 1024 * 1024) return notify('Image size must be less than 5MB', 'error')

    const reader = new FileReader()
    reader.onload = () => handleFormChange({ image: reader.result as string })
    reader.onerror = () => notify('Error processing image.', 'error')
    reader.readAsDataURL(file)
  }

  const handleEditSave = async (updatedData: Partial<Campaign>) => {
    // Persist to mock DB via API route: PUT /api/campaigns/[id]/edit
    setIsSaving(true)
    try {
      const finalData: Partial<Campaign> = { ...updatedData, image: editPreview.image }
      const res = await fetch(`/api/campaigns/${campaign.id}/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalData),
        credentials: 'include',
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = (data && (data.message || data.error)) || 'Failed to save changes.'
        throw new Error(msg)
      }

      // API returns the updated campaign object directly
      setCampaign(prev => ({ ...(data as Campaign), creator: prev.creator }))
      setIsEditing(false)
      notify('Campaign updated successfully!', 'success')
    } catch (error) {
      console.error(error)
      notify(error instanceof Error ? error.message : 'An unknown error occurred.', 'error')
    } finally {
      setIsSaving(false)
    }
  }


  const raisedLocal = useMemo(() => donations.reduce((sum, d) => sum + (d.amount || 0), 0), [donations])
  const uniqueDonorCount = useMemo(() => {
    const addrSet = new Set<string>()
    const nameSet = new Set<string>()
    donations.forEach((d) => {
      const maybeAddr = (d as DonationWithAddr).address
      if (maybeAddr && /^0x[a-fA-F0-9]{40}$/.test(maybeAddr)) {
        addrSet.add(maybeAddr.toLowerCase())
      } else if (d.name) {
        nameSet.add(String(d.name).trim().toLowerCase())
      }
    })
    return addrSet.size + nameSet.size
  }, [donations])
  const progressPercentage = Math.min(100, Math.round((raisedLocal / campaign.goal) * 100))

  if (isEditing) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-800">Edit Campaign</h1>
          <div className="flex items-center space-x-2">
             <button
                onClick={async () => {
                  try {
                    setAiLoading(true)
                    const payload = {
                      title: editPreview.title,
                      description: editPreview.description,
                      goal: editPreview.goal,
                      category: editPreview.category,
                      chains: editPreview.chains
                    }
                    const prompt = `TASK: Rewrite the campaign title and description.\n\nRules:\n- Keep the title short and clear.\n- Description: 2–5 concise sentences, inspiring and specific.\n- Do not invent facts.\n- No headings, no lists, no markdown, no commentary.\n\nInput JSON:\n${JSON.stringify(payload)}\n\nOutput: Return ONLY a strict JSON object with keys \\"title\\" and \\"description\\".`
                    const res = await fetch('/api/ai/assist', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ prompt, mode: 'rewrite' })
                    })
                    if (!res.ok) throw new Error(`AI request failed (${res.status})`)
                    const data = await res.json().catch(() => ({})) as { text?: string }
                    const text = (data.text || '').trim()
                    let update: Partial<{ title: string; description: string }> | null = null
                    // Sanitize: remove Markdown code fences and extract JSON object if present
                    const unfence = (s: string) => s.replace(/^```[a-zA-Z]*\n?|```$/g, '').replace(/```[\s\S]*?```/g, (m) => m.replace(/```[a-zA-Z]*\n?|```/g, ''))
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
                      // Fallback: treat text as improved description
                      update = { description: text }
                    }
                    formRef.current?.applyAI?.(update as Partial<{ title: string; description: string; category?: string }>)
                    notify('Applied AI suggestions', 'success')
                  } catch (e) {
                    console.error(e)
                    notify('Failed to get AI suggestions. Please try again.', 'error')
                  } finally {
                    setAiLoading(false)
                  }
                }}
                disabled={aiLoading}
                className={`px-4 py-2 rounded-full border-2 transition ${aiLoading ? 'opacity-60 cursor-not-allowed border-blue-200 text-blue-600' : 'border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300'}`}
              >
                {aiLoading ? 'Thinking…' : 'Edit with AI'}
              </button>
             <button
               onClick={() => setIsEditing(false)}
               className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
               disabled={isSaving}
             >
                Cancel
              </button>
            <button
              onClick={() => formRef.current?.requestSubmit()}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:bg-blue-400"
              disabled={isSaving}
            >
              {isSaving ? <Spinner /> : 'Finish'}
            </button>
          </div>
        </div>

        {/* Mobile: image with edit overlay */}
        <div className="md:hidden mb-6">
          <div className="w-full h-56 relative rounded-lg overflow-hidden shadow-lg">
            <Image
              src={editPreview.image || '/placeholder.png'}
              alt={editPreview.title}
              fill
              className="object-cover"
              onError={() => setImgSrc(CARD_PLACEHOLDER_2x1)}
            />
            {user?.role === 'creator' && (
              <div className="absolute top-3 right-3 flex items-center gap-2">
                {/* Gemini generate button */}
                <button
                  type="button"
                  onClick={generateImageFromDescription}
                  disabled={imageGenLoading}
                  className={`inline-flex items-center justify-center w-10 h-10 rounded-full ${imageGenLoading ? 'bg-blue-600/40 cursor-not-allowed' : 'bg-blue-600/50 hover:bg-blue-600/60'} text-white shadow-md backdrop-blur-sm focus:outline-none`}
                  aria-label="Generate image with Gemini"
                  title="Generate image"
                >
                  <span className="text-lg leading-none">✦</span>
                </button>
                {/* Pencil edit button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-black/60 text-white text-sm font-medium hover:bg-black/70 focus:outline-none"
                  aria-label="Change campaign image"
                  title="Change image"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-.879.88 3.712 3.712.88-.879a2.625 2.625 0 000-3.713z" />
                    <path d="M2.25 21.75h3.943c.464 0 .909-.184 1.237-.513l11.5-11.5-3.712-3.712-11.5 11.5c-.329.328-.513.773-.513 1.237v3.988z" />
                  </svg>
                  Edit
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left Column: Edit Form */}
          <div>
            <CampaignEditForm
              ref={formRef}
              campaign={campaign}
              onSave={handleEditSave}
              onChange={handleFormChange}
              hasDonations={donations.length > 0}
            />
            <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
          </div>

          {/* Right Column: Live Preview */}
          <div className="hidden md:block">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">Live Preview</h2>
            <div className="sticky top-24">
                <div className="w-full h-56 relative mb-4 rounded-lg overflow-hidden shadow-lg">
                    <Image
                        src={editPreview.image || '/placeholder.png'}
                        alt={editPreview.title}
                        fill
                        className="object-cover"
                    />
                    {user?.role === 'creator' && (
                      <div className="absolute top-3 right-3 flex items-center gap-2">
                        {/* Gemini generate button */}
                        <button
                          type="button"
                          onClick={generateImageFromDescription}
                          disabled={imageGenLoading}
                          className={`inline-flex items-center justify-center w-10 h-10 rounded-full ${imageGenLoading ? 'bg-blue-600/40 cursor-not-allowed' : 'bg-blue-600/50 hover:bg-blue-600/60'} text-white shadow-md backdrop-blur-sm focus:outline-none`}
                          aria-label="Generate image with Gemini"
                          title="Generate image"
                        >
                          <span className="text-lg leading-none">✦</span>
                        </button>
                        {/* Pencil edit button */}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center justify-center p-2 rounded-full bg-black/50 text-white hover:bg-black/60 focus:outline-none"
                          aria-label="Change campaign image"
                          title="Change image"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-.879.88 3.712 3.712.88-.879a2.625 2.625 0 000-3.713z" />
                            <path d="M2.25 21.75h3.943c.464 0 .909-.184 1.237-.513l11.5-11.5-3.712-3.712-11.5 11.5c-.329.328-.513.773-.513 1.237v3.988z" />
                          </svg>
                        </button>
                      </div>
                    )}
                </div>
                <CampaignCard campaign={editPreview as Campaign} variant="minimal" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">{campaign.title}</h1>
            <div className="flex items-center mt-2 text-gray-600">
              <p>Created by <Link href={`/profile/${campaign.creatorId}`} className="font-semibold text-blue-600 hover:underline">{campaign.creator?.username || 'Anonymous'}</Link></p>
            </div>
          </div>
          {isOwner && (
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
                unoptimized
                className="object-cover"
                onError={() => setImgSrc(CARD_PLACEHOLDER_2x1)}
                priority
              />
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-2xl font-bold mb-4">Story</h2>
              <p className="text-gray-700 whitespace-pre-wrap">{campaign.description}</p>
            </div>
          </div>

          {/* Right/Sidebar Column */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <div className="bg-white p-6 rounded-lg shadow-lg">
                <h3 className="text-xl font-bold mb-4">Donate</h3>
                {/* Supported Chains Display */}
                <div className="mb-4">
                  <p className="text-sm text-gray-600 mb-2">Supported payment methods:</p>
                  <div className="flex gap-2">
                    {supportedChains.map(chain => (
                      <span key={chain} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
                        {chain}
                      </span>
                    ))}
                  </div>
                </div>

                {/* On-Chain Status */}
                {ONCHAIN_ENABLED && (
                  <div className="mb-4 p-3 rounded-lg border border-gray-200 bg-gray-50">
                    <p className="text-sm font-medium text-gray-900 mb-1">On-Chain</p>
                    {campaign.onChain?.campaignId ? (
                      <div className="text-sm text-gray-700 space-y-1">
                        <p>ID: {campaign.onChain.campaignId}</p>
                        <p>Status: {onChainActive === null ? '—' : onChainActive ? 'Active' : 'Paused'}</p>
                      </div>
                    ) : (
                      <div className="text-sm text-red-600">Not synced to blockchain</div>
                    )}
                  </div>
                )}

                <button 
                  onClick={() => setShowPaymentModal(true)} 
                  className="mx-auto block md:inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white px-6 h-12 rounded-full font-semibold text-base transition-colors shadow mb-6"
                >
                  Donate Now
                </button>

                {/* Campaign Stats */}
                <div className="border-t border-gray-200 pt-6 space-y-4">
                  <div className="flex justify-between items-center"><span className="text-gray-600">Total Raised</span><span className="font-bold text-gray-900">{formatCurrency(raisedLocal)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-gray-600">Goal</span><span className="font-bold text-gray-900">{formatCurrency(campaign.goal)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-gray-600">Progress</span><span className="font-bold text-green-600">{progressPercentage}%</span></div>
                  <div className="flex justify-between items-center"><span className="text-gray-600">Donors</span><span className="font-bold text-gray-900">{uniqueDonorCount}</span></div>
                </div>

                {/* Sync UI for creators when on-chain mapping is missing */}
                {ONCHAIN_ENABLED && isOwner && !campaign.onChain?.campaignId && (
                  <div className="mt-6 border-t border-gray-200 pt-6">
                    <p className="text-sm font-medium text-gray-900 mb-2">Sync On-Chain Mapping</p>
                    <p className="text-xs text-gray-600 mb-2">Enter the on-chain campaign ID to link this campaign.</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={syncId}
                        onChange={(e) => setSyncId(e.target.value)}
                        placeholder="On-chain campaign ID"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={handleSyncOnChain}
                        disabled={isSyncing || !syncId.trim()}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium disabled:bg-gray-300"
                      >
                        {isSyncing ? 'Syncing...' : 'Sync'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Donations */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-4">Recent Donations</h2>
          <div className="bg-white p-6 rounded-lg shadow max-h-[28rem] overflow-y-auto">
            {donationsLoading ? (
              <div className="py-6 flex justify-center"><Spinner /></div>
            ) : donationsError ? (
              <p className="text-sm text-red-600">{donationsError}</p>
            ) : donations.length > 0 ? (
              <DonationList donations={donations.slice(0, 10)} />
            ) : (
              <p className="text-gray-500">Be the first to donate!</p>
            )}
          </div>
        </div>
      </div>
      
      {/* Payment Modal */}
      <PaymentModal
        campaign={campaign}
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onPaymentSuccess={handlePaymentSuccess}
      />
    </div>
  )
}
