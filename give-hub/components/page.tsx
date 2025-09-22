/**
 * FILE: app/create/page.tsx
 * PURPOSE: Campaign creation form - validates input and creates new campaigns
 * WHAT CALLS THIS: Next.js App Router for /create route, linked from Nav component
 * WHAT IT RENDERS: Multi-step campaign creation form with validation
 * ACCESS: Default export, automatically routed by Next.js
 * MIGRATION NOTES:
 * - Replace handleSubmit alert with POST /api/campaigns (MongoDB)
 * - Add zod validation schema for form data before submission
 * - Integrate with AI for content optimization and fraud detection
 * - Add image upload for campaign media
 * TODO:
 * - Add form validation with react-hook-form + zod
 * - Implement draft saving (localStorage or MongoDB)
 * - Add rich text editor for description
 * - Integrate Gemini AI for content suggestions and validation
 */

'use client'

import React, { useRef, useState, useContext, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { AuthContext } from '../lib/auth/auth-context' // Corrected path
import type { AuthContextType } from '../lib/auth/auth-context' // Assume type export if available, otherwise define it
import { showError, showSuccess, showInfo } from '@/components/notification-manager'
import { 
  connectWallet, 
  ensureWalletOnChain, 
  createCampaignOnChain, 
  isCreator
} from '@/lib/web3/client'
import { isAddress } from '@/lib/address'
import ErrorModal from '@/components/error-modal'
import TokenPicker from '@/components/TokenPicker'

// ZRC-20 options are fetched from the server via /api/zrc20-options

interface Token {
  address: string;
  symbol: string;
  decimals: number;
  chain: string;
}

function parseRpcError(e: unknown): string {
  if (e && typeof e === 'object') {
    const obj = e as Record<string, unknown>
    const shortMsg = typeof obj.shortMessage === 'string' ? obj.shortMessage : undefined
    const msg = typeof obj.message === 'string' ? obj.message : undefined
    const out = shortMsg || msg
    if (out) return String(out).slice(0, 280)
  }
  try {
    return String(e ?? 'Transaction failed').slice(0, 280)
  } catch {
    return 'Transaction failed'
  }
}

/**
 * Campaign creation page component
 * @returns JSX element with campaign creation form
 */
export default function CreateCampaignPage() {
  // REGION: State management
  const context = useContext(AuthContext) as AuthContextType | null // Type context safely
  const router = useRouter()
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    goal: '',
  })
  const [aiLoading, setAiLoading] = useState(false)
  const [image, setImage] = useState<string>('')
  const [txPhase, setTxPhase] = useState<'idle' | 'confirming' | 'mining' | 'done' | 'error'>('idle')
  const [submitLoading, setSubmitLoading] = useState(false)
  const [submitMessage, setSubmitMessage] = useState('')
  const [txHash, setTxHash] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [otherCategory, setOtherCategory] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [imageGenLoading, setImageGenLoading] = useState(false)
  // Web3/payment prefs
  const [preferredToken, setPreferredToken] = useState('')
  const [zrc20Options, setZrc20Options] = useState<{ symbol: string; address: string }[]>([])
  const requiresOnChain = (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER || '').toLowerCase() === 'zetachain'
  const wzetaAddrEnv = (process.env.NEXT_PUBLIC_WZETA_ADDRESS || '').trim()
  const [isTokenValid, setIsTokenValid] = useState(false)
  // Error modal state (popup on wallet/testnet issues)
  const [errorOpen, setErrorOpen] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [errorDetails, setErrorDetails] = useState<unknown>(null)

  // Fetch ZRC-20 options from API
  useEffect(() => {
    if (!requiresOnChain) return
    const fetchTokens = async () => {
      try {
        const res = await fetch('/api/zrc20-options')
        if (!res.ok) throw new Error('Failed to fetch tokens')
        const data = await res.json()
        const allTokens = data?.byChain || {}
        setZrc20Options(allTokens)
        // Default to WZETA if available, otherwise first token in first chain
        const wzeta = (Object.values(allTokens) as Token[][])
          .flat()
          .find((t: Token) => t.symbol === 'WZETA')
        if (wzeta) {
          setPreferredToken(wzeta.address)
        } else if ((Object.values(allTokens) as Token[][]).flat().length > 0) {
          setPreferredToken((Object.values(allTokens) as Token[][])[0][0].address)
        }
      } catch (e) {
        console.error('Failed to fetch ZRC-20 options:', e)
        showError('Failed to fetch ZRC-20 options', 'Could not load token options.')
      }
    }
    fetchTokens()
  }, [requiresOnChain])

  // Validate token when preferredToken changes
  useEffect(() => {
    if (!requiresOnChain || !preferredToken) {
      setIsTokenValid(true)
      return
    }

    const validateToken = async () => {
      try {
        // Skip validation for WZETA and zETH
        if (preferredToken.includes('WZETA') || preferredToken.includes('zETH')) {
          setIsTokenValid(true)
          return
        }

        // Additional validation for zBTC
        if (preferredToken.includes('zBTC')) {
          showError('Please select a different token', 'zBTC is currently not supported for campaigns')
          setIsTokenValid(false)
          return
        }

        // Default validation
        setIsTokenValid(isAddress(preferredToken))
      } catch (e) {
        console.error('Token validation failed:', e)
        showError('Invalid token address', 'Token validation failed. Please try another token.')
        setIsTokenValid(false)
      }
    }

    validateToken()
  }, [preferredToken, requiresOnChain])

  if (!context) {
    throw new Error('AuthContext must be used within an AuthProvider')
  }
  const { user } = context // Type-safe access if AuthContextType defines user

  // REGION: Event handlers
  /**
   * Handle form input changes
   * @param e - Input change event
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  // Image upload helpers (base64 inline like edit form)
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
      showError('Invalid file type', 'Please select an image file')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      showError('File too large', 'Image size must be less than 5MB')
      return
    }
    const base64 = await convertToBase64(file)
    setImage(base64)
  }

  // Generate an image from current description using Gemini (creator-only)
  const generateImageFromDescription = async () => {
    if (!user || user.role !== 'creator') {
      return showError('Permission denied', 'Only creators can generate images.')
    }
    try {
      setImageGenLoading(true)
      const selectedCategory = formData.category === 'other' ? (otherCategory || 'other') : (formData.category || 'general')
      const prompt = `TASK: Generate an image for this campaign.\n\nCampaign details:\n${JSON.stringify({ title: formData.title, description: formData.description, goal: formData.goal, category: selectedCategory })}\n\nGenerate a compelling image that represents this campaign.`
      const res = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prompt })
      })
      const data: { imageBase64?: string; mime?: string; error?: string; message?: string; details?: string } = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = data.error || data.details || data.message || 'Failed to generate image.'
        showError('Image generation failed', msg)
        return
      }
      const base64 = data.imageBase64
      if (!base64) {
        return showError('No image generated', 'The AI did not return an image. Try refining the description.')
      }
      const dataUrl = `data:${data.mime || 'image/png'};base64,${base64}`
      setImage(dataUrl)
      showSuccess('AI image generation completed', 'Generated image applied')
    } catch (e) {
      console.error(e)
      const msg = parseRpcError(e)
      showError('AI request failed', msg)
      showError('Generation failed', msg)
    } finally {
      setImageGenLoading(false)
    }
  }

  /**
   * Handle form submission with Web3 integration
   * Creates campaign on-chain first, then saves to database
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!user) {
      showError('Authentication required', 'Please sign in to create a campaign')
      router.push('/auth?next=/create')
      return
    }

    setSubmitLoading(true)
    setSubmitMessage('Validating campaign data...')
    if (!formData.title || !formData.description || !formData.goal || !formData.category) {
      showError('Missing information', 'Please fill in all required fields')
      setSubmitLoading(false)
      setSubmitMessage('')
      return
    }
    if (formData.category === 'other' && !otherCategory.trim()) {
      showError('Category required', 'Please specify your category')
      return
    }

    setIsSubmitting(true)
    
    let onChainCampaignId: bigint | string | null = null
    
    try {
      // Step 4: Create on-chain campaign if payment provider is ZetaChain
      
      if (requiresOnChain) {
        setSubmitMessage('Creating on-chain campaign...')
        showInfo('Blockchain processing', 'Creating on-chain campaign…')
        // Step 3: Connect wallet (will trigger metamask if not connected)
        setSubmitMessage('Connecting wallet...')
        showInfo('Wallet connection', 'Connecting wallet…')
        
        // Step 2: Connect wallet and ensure correct network
        const { address, chainId } = await connectWallet()
        const targetChainId = parseInt(process.env.NEXT_PUBLIC_ZETA_CHAIN_ID || '7001')
        
        if (chainId !== targetChainId) {
          showInfo('Network switch required', `Switching to ZetaChain network...`)
          await ensureWalletOnChain(targetChainId)
        }
        
        // Step 3: Check if creator already exists on-chain
        const creatorExists = await isCreator(address)
        if (!creatorExists) {
          showInfo('Creator registration', 'Registering as creator on-chain...')
        }
        
        // Step 4: Create campaign on-chain
        setTxPhase('confirming')
        showInfo('Transaction approval', 'Confirm in MetaMask…')
        const res = await createCampaignOnChain({
          preferredZRC20: preferredToken,
          onSent: (hash) => {
            setTxPhase('mining')
            setTxHash(hash)
            const base = process.env.NEXT_PUBLIC_ZETA_EXPLORER_URL
            if (base) {
              showSuccess('Transaction submitted', `Transaction sent: ${base}/tx/${hash}`)
            } else {
              showSuccess('Transaction submitted', `Transaction sent: ${hash}`)
            }
          }
        })
        setTxPhase('done')
        onChainCampaignId = res.id
        console.debug('[create] On-chain campaign created. ID:', onChainCampaignId?.toString(), 'tx:', res.txHash)
      }

      // Step 5: Save campaign to off-chain database
      setSubmitMessage('Saving campaign to database...')
      const campaignData: Record<string, unknown> = {
        title: formData.title,
        imgSrc: image,
        description: formData.description,
        category: formData.category === 'other' ? otherCategory.trim() : formData.category,
        goal: parseFloat(formData.goal),
        creatorId: user.id,
        preferredZRC20: preferredToken || undefined,
      }
      // Attach on-chain mapping if we created on-chain and have required envs
      if (onChainCampaignId) {
        const chainId = parseInt(process.env.NEXT_PUBLIC_ZETA_CHAIN_ID || '7001')
        const contract = process.env.NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS || ''
        if (contract && contract.length === 42) {
          campaignData.onChain = {
            chainId,
            contract,
            campaignId: onChainCampaignId.toString(),
          }
          console.debug('[create] Attaching onChain mapping to payload:', campaignData.onChain)
        } else {
          console.error('[create] Missing or invalid NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS; on-chain mapping will NOT be persisted.', { contract })
          showError('On-chain campaign created, but missing contract env to save mapping. Please set NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS.', 'Configuration error')
        }
      } else if (requiresOnChain) {
        console.warn('[create] Expected on-chain campaign ID but did not obtain one; saving off-chain only.')
      }
      
      const response = await fetch('/api/campaigns', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(campaignData),
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          showError('Session expired', 'Your session has expired. Please sign in again.')
          router.push('/auth?next=/create')
          return
        }
        let details = ''
        try {
          const data = await response.json()
          details = data?.error || data?.message || ''
        } catch {}
        throw new Error(details || 'Failed to create campaign')
      }
      
      const result = await response.json()
      showSuccess('Campaign saved', 'Campaign created successfully!')
      console.debug('[create] API response:', result)
      const persistedOnChain = Boolean(result?.campaign?.onChain || result?.onChain)
      if (persistedOnChain) {
        console.log('[create] On-chain mapping persisted on server:', (result?.campaign?.onChain || result?.onChain))
      } else if (requiresOnChain) {
        console.error('[create] Server saved campaign WITHOUT on-chain mapping. Verify env and API handling.')
      }
      // Optionally trigger a backend sync to ensure on-chain events are persisted before redirect
      if (requiresOnChain) {
        try {
          setSubmitMessage('Syncing on-chain data...')
          showInfo('Data synchronization', 'Syncing on-chain data…')
          const syncRes = await fetch(`/api/sync?range=2000`, { method: 'GET' })
          const syncJson = await syncRes.json().catch(() => null)
          if (syncRes.ok && (syncJson?.success ?? false)) {
            console.debug('[create] Sync complete:', syncJson)
          } else {
            console.warn('[create] Sync did not report success:', syncJson)
          }
        } catch (e) {
          console.error('[create] Sync call failed:', e)
        }
      }

      // Navigate to the created campaign (robust)
      const newId = result?.campaign?.id || result?.id
      if (!newId) {
        console.error('[create] Missing campaign id in response, cannot navigate. Result:', result)
        showError('Navigation error', 'Campaign saved but navigation failed: missing id.')
      } else {
        const path = `/campaign/${newId}`
        console.debug('[create] Navigating to', path)
        router.push(path)
      }
      
    } catch (error) {
      const errorMsg = (error as Error).message || 'An error occurred'
      showError('Campaign creation failed', errorMsg)
      // Show modal for wallet/testnet errors in on-chain mode
      if (requiresOnChain) {
        const hint = `Creators must have ZetaChain Athens testnet funds (ZETA for gas and WZETA as preferred token).\n\nDetails: ${errorMsg}`
        setErrorText(hint)
        setErrorDetails(error)
        setErrorOpen(true)
      }
      
      // If on-chain creation succeeded but off-chain failed, show different message
      if (onChainCampaignId) {
        showError('Sync error', `Campaign created on blockchain (ID: ${onChainCampaignId}) but failed to save locally. Please contact support.`)
      }
    } finally {
      setIsSubmitting(false)
      setTxPhase('idle')
      setSubmitLoading(false)
      setSubmitMessage('')
    }
  }

  const handleAiEdit = async () => {
    if (aiLoading) return;
    console.debug('[Create] handleAiEdit: clicked')
    setAiLoading(true);
    try {
      const payload = {
        title: formData.title,
        description: formData.description,
        goal: formData.goal,
        category: formData.category === 'other' ? (otherCategory || 'Other') : formData.category,
      }
      const prompt = `TASK: Rewrite the campaign title and description.\n\nRules:\n- Keep the title short and clear.\n- Description: 2–5 concise sentences, inspiring and specific.\n- Do not invent facts.\n- No headings, no lists, no markdown, no commentary.\n\nInput JSON:\n${JSON.stringify(payload)}\n\nOutput: Return ONLY a strict JSON object with keys \"title\" and \"description\".`
      console.debug('[Create] handleAiEdit: POST /api/ai/assist (rewrite)')
      const res = await fetch('/api/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ prompt, mode: 'rewrite' })
      })
      console.debug('[Create] handleAiEdit: response status', res.status)
      if (!res.ok) {
        const errData: unknown = await res.json().catch(() => ({}))
        const errObj = (typeof errData === 'object' && errData) ? errData as { error?: string; message?: string } : {}
        const msg = errObj.error || errObj.message || 'AI request failed.'
        showError('AI request failed', msg)
        return
      }
      const data = await res.json().catch(() => ({})) as { text?: string }
      const text = (data.text || '').trim()
      let update: Partial<{ title: string; description: string }> | null = null
      // Robust: remove Markdown fences and extract JSON
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
        // Fallback: treat text as improved description
        update = { description: text }
      }
      setFormData(prev => ({
        ...prev,
        title: typeof update?.title === 'string' && update.title.trim() ? update.title : prev.title,
        description: typeof update?.description === 'string' && update.description.trim() ? update.description : prev.description
      }))
      console.debug('[Create] handleAiEdit: applied update', update)
      showSuccess('AI enhancement completed', 'Applied AI suggestions')
    } catch (error) {
      console.error('Error creating campaign:', error)
      showError('Campaign creation failed', error instanceof Error ? error.message : 'Failed to create campaign')
    } finally {
      setTxPhase('idle')
      setSubmitLoading(false)
      setSubmitMessage('')
      setAiLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Create a Campaign</h1>
          <p className="text-gray-600 mt-1">Describe your cause, set a goal, and share a compelling image.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAiEdit}
            disabled={aiLoading}
            className="px-4 py-2 rounded-full border-2 border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300"
          >
            {aiLoading ? 'Thinking...' : 'Edit with AI'}
          </button>
          <button
            type="submit"
            disabled={aiLoading || txPhase !== 'idle' || submitLoading}
            onClick={(e) => {e.preventDefault(); handleSubmit(e)}}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[150px]"
          >
            {submitLoading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Creating...</span>
              </div>
            ) : txPhase === 'confirming' ? 'Confirming...' : txPhase === 'mining' ? 'Creating...' : 'Create Campaign'}
          </button>
        </div>
      </div>

      {/* Tx status area */}
      {txPhase === 'confirming' && (
        <div className="mb-4 p-3 rounded-lg border border-blue-200 bg-blue-50 text-sm text-blue-800">
          <span className="font-medium">Waiting for wallet confirmation...</span>
        </div>
      )}
      {txPhase === 'mining' && (
        <div className="mb-4 p-3 rounded-lg border border-yellow-200 bg-yellow-50 text-sm text-yellow-800">
          <span className="font-medium">Transaction pending...</span>
        </div>
      )}
      {txHash && (
        <div className="mb-4 p-3 rounded-lg border border-green-200 bg-green-50 text-sm text-green-800">
          <span className="font-medium">Transaction:</span>{' '}
          {process.env.NEXT_PUBLIC_ZETA_EXPLORER_URL ? (
            <a className="underline" href={`${process.env.NEXT_PUBLIC_ZETA_EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer">
              View on explorer
            </a>
          ) : (
            <span className="break-all">{txHash}</span>
          )}
        </div>
      )}
      
      {/* Two-column layout: Form left, Live preview right */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
            {/* Campaign Title */}
            <div>
              <label className="block text-lg font-semibold text-gray-900 mb-3">
                Campaign Title *
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-lg"
                placeholder="Enter a compelling title for your campaign"
                required
              />
            </div>
            {/* Campaign Description */}
            <div>
              <label className="block text-lg font-semibold text-gray-900 mb-3">
                Campaign Description *
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={6}
                className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-lg resize-none"
                placeholder="Describe your campaign, its goals, and how the funds will be used. Be detailed and transparent to build trust with potential donors."
                required
              />
            </div>

            {/* Funding Goal */}
            <div>
              <label className="block text-lg font-semibold text-gray-900 mb-3">
                Funding Goal
              </label>
              <div className="relative">
                <input
                  type="number"
                  name="goal"
                  value={formData.goal}
                  onChange={handleInputChange}
                  className="w-full pl-4 pr-4 py-4 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-lg"
                  placeholder="50000"
                  min="1"
                  required
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-lg font-semibold text-gray-900 mb-3">
                Campaign Category *
              </label>
              <select
                name="category"
                value={formData.category}
                onChange={handleInputChange}
                className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-lg"
                required
              >
                <option value="">Select a category</option>
                <option value="humanitarian">Humanitarian Aid</option>
                <option value="education">Education</option>
                <option value="healthcare">Healthcare</option>
                <option value="environment">Environment</option>
                <option value="animals">Animal Welfare</option>
                <option value="community">Community Development</option>
                <option value="emergency">Emergency Relief</option>
                <option value="tech">Technology</option>
                <option value="open-source">Open Source</option>
                <option value="research">Scientific Research</option>
                <option value="arts">Arts & Culture</option>
                <option value="other">Other</option>
              </select>
              {formData.category === 'other' && (
                <div className="mt-3">
                  <input
                    type="text"
                    value={otherCategory}
                    onChange={(e) => setOtherCategory(e.target.value)}
                    placeholder="Enter your custom category"
                    className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-lg"
                  />
                  <p className="text-sm text-gray-500 mt-1">This will be shown on your card.</p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-lg font-semibold text-gray-900 mb-3">
                Preferred Payout Token {requiresOnChain ? '*' : ''}
              </label>
              <TokenPicker
                creatorMode // ensures WZETA/ZETA dropdown for campaign creation
                value={preferredToken ? { chain: 'ZETA', symbol: '', address: preferredToken } : undefined}
                onChange={(picked) => {
                  // picked = { chain, symbol, address?, isNative? }
                  setPreferredToken(picked.address || '')
                }}
              />
              {preferredToken && (
                <p className="text-xs text-gray-500 mt-1">
                  Token address: {preferredToken}
                </p>
              )}
            </div>


            {/* Preferred Token (ZRC-20) */}
            <div>
              <label className="block text-lg font-semibold text-gray-900 mb-3">
                Preferred Payout Token {requiresOnChain ? '*' : ''}
              </label>
              <div className="space-y-2">
                {Object.entries(zrc20Options).map(([chain, tokens]) => (
                  <div key={chain} className="space-y-1">
                    <div className="text-sm text-gray-500">{chain}</div>
                    <div className="flex flex-wrap gap-2">
                      {tokens && Array.isArray(tokens) && tokens.map((token) => (
                        <button
                          key={token.address}
                          type="button"
                          className={`px-3 py-1 text-sm rounded-full ${preferredToken === token.address ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 hover:bg-gray-200'}`}
                          onClick={() => setPreferredToken(token.address)}
                        >
                          {token.symbol}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {preferredToken && (
                <p className="text-xs text-gray-500 mt-1">Token address: {preferredToken}</p>
              )}
              {!isTokenValid && requiresOnChain && (
                <p className="text-sm text-red-600 mt-1">A valid token must be selected.</p>
              )}
              {isTokenValid && (
                <p className="text-sm text-gray-500 mt-1">Donations will be automatically swapped to this token.</p>
              )}
            </div>

            {/* Submit moved to header */}
          </form>
          {submitMessage && (
            <div className="mt-4 text-sm text-gray-600 text-center animate-pulse">
              {submitMessage}
            </div>
          )}
        </div>

        {/* Live Preview Card - matches home page minimal card style */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-0 overflow-hidden">
          {/* Image header */}
          <div className="relative w-full h-56 bg-gray-100">
            {image ? (
              <Image
                src={image}
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
                  className={`inline-flex items-center justify-center w-10 h-10 rounded-full ${imageGenLoading ? 'bg-blue-600/40 cursor-not-allowed' : 'bg-white hover:bg-gray-50 dark:bg-blue-600/50 dark:hover:bg-blue-600/60'} text-blue-600 dark:text-white border border-gray-200 dark:border-transparent shadow-md focus:outline-none`}
                  title={imageGenLoading ? 'Generating…' : 'Generate image'}
                  aria-busy={imageGenLoading}
                >
                  {imageGenLoading ? (
                    // Spinner
                    <svg className="animate-spin h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="black" viewBox="0 0 24 24" role="status" aria-label="Loading">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                    </svg>
                  ) : (
                    <span className="text-4xl leading-none">✦</span>
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
                {/* Pencil icon */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M16.862 3.487a1.5 1.5 0 0 1 2.121 0l1.53 1.53a1.5 1.5 0 0 1 0 2.121l-9.9 9.9a1.5 1.5 0 0 1-.67.386l-4.019 1.004a.75.75 0 0 1-.91-.91l1.003-4.02a1.5 1.5 0 0 1 .386-.669l9.9-9.9Zm-2.828 2.828L5.9 14.45a.5.5 0 0 0-.129.223l-.692 2.773 2.773-.692a.5.5 0 0 0 .223-.129l8.134-8.133-2.167-2.167Z" />
                </svg>
              </button>
            </div>
          </div>
          {/* Content */}
          <div className="p-5">
            <div className="flex items-center gap-2 mb-2">
              {formData.category ? (
                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                  {formData.category === 'other' ? (otherCategory || 'Other') : formData.category}
                </span>
              ) : null}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 line-clamp-2">
              {formData.title || 'Your campaign title'}
            </h3>
            <p className="mt-2 text-sm text-gray-600 line-clamp-3">
              {formData.description || 'Write a compelling description to inspire donations.'}
            </p>
            <div className="mt-4">
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: '0%' }} />
              </div>
              <div className="mt-2 text-sm text-gray-700 flex items-center justify-between">
                <span>Goal: {formData.goal}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file input for image upload */}
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
      {/* Error display removed - using notify system instead */}
      <ErrorModal
        isOpen={errorOpen}
        title="Wallet issue or missing testnet funds"
        message={errorText}
        details={errorDetails}
        onClose={() => { setErrorOpen(false); setErrorDetails(null) }}
      />
    </div>
  )
}
