'use client'

import { useState, useRef, forwardRef, useImperativeHandle, useEffect } from 'react'
import type { Campaign } from '@/_dev/mock-db/database'
import { notify } from '@/lib/utils/notify'

interface CampaignEditFormProps {
  campaign: Campaign
  onSave: (updatedCampaign: Partial<Campaign>) => Promise<void>

  lockGoalAndChains?: boolean
  onChange?: (partial: Partial<Campaign>) => void
  hasDonations?: boolean
}

const CampaignEditForm = forwardRef<HTMLFormElement, CampaignEditFormProps>((
  { 
    campaign, 
    onSave, 
    lockGoalAndChains = false,
    onChange
  }, 
  ref
) => {
  const presetCategories = [
    'Education', 'Healthcare', 'Environment', 'Animals', 'Community', 
    'Emergency Relief', 'Technology', 'Arts & Culture', 'Sports'
  ] as const

  type PresetCategory = typeof presetCategories[number];

  const initialCategory = campaign.category
    ? (presetCategories.includes(campaign.category as PresetCategory) ? campaign.category : 'other')
    : ''

  const [formData, setFormData] = useState({
    title: campaign.title,
    description: campaign.description,
    goal: campaign.goal,
    category: initialCategory as string,
    chains: campaign.chains as string[]
  })
  const [customChain, setCustomChain] = useState('')
  const [otherCategory, setOtherCategory] = useState(
    campaign.category && !presetCategories.includes(campaign.category as PresetCategory)
      ? campaign.category
      : ''
  )
  const formRef = useRef<HTMLFormElement>(null)
  useImperativeHandle(ref, () => {
    const el = formRef.current as HTMLFormElement & { requestSubmit: () => void };
    return Object.assign((el || ({} as unknown)) as HTMLFormElement & { requestSubmit: () => void }, {
      applyAI: (partial: Partial<Pick<typeof formData, 'title' | 'description' | 'category'>>) => {
        setFormData(prev => ({ ...prev, ...partial }))
      }
    })
  });

  // Defer parent onChange notifications to the commit phase
  useEffect(() => {
    const mappedCategory = formData.category === 'other' ? otherCategory : formData.category
    const partial: Partial<Campaign> = { ...formData, category: mappedCategory }
    onChange?.(partial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, otherCategory])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => {
      return {
        ...prev,
        [name]: name === 'goal' ? parseFloat(value) || 0 : value
      }
    })
  }

  const handleChainToggle = (chain: string) => {
    setFormData(prev => {
      const next = {
        ...prev,
        chains: prev.chains.includes(chain)
          ? prev.chains.filter(c => c !== chain)
          : [...prev.chains, chain]
      }
      return next
    })
  }

  const addCustomChain = () => {
    if (lockGoalAndChains) return
    const raw = (customChain || '').trim()
    if (!raw) return
    const normalized = raw.replace(/\s+/g, ' ').trim()
    setFormData(prev => (
      prev.chains.includes(normalized)
        ? prev
        : { ...prev, chains: [...prev.chains, normalized] }
    ))
    setCustomChain('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) return notify('Campaign title is required', 'error')
    if (!formData.description.trim()) return notify('Campaign description is required', 'error')
    if (formData.goal <= 0) return notify('Funding goal must be positive', 'error')

    const finalCategory = formData.category === 'other' ? otherCategory : formData.category
    if (!finalCategory.trim()) return notify('Category is required', 'error')

    await onSave({ ...formData, category: finalCategory })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Campaign Title</label>
        <input
          type="text"
          name="title"
          value={formData.title}
          onChange={handleInputChange}
          className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
          placeholder="Enter a compelling title for your campaign"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
        <textarea
          name="description"
          value={formData.description}
          onChange={handleInputChange}
          rows={4}
          className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 resize-none"
          placeholder="Describe your campaign..."
          required
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Funding Goal ($)</label>
          <input
            type="number"
            name="goal"
            value={formData.goal}
            onChange={handleInputChange}
            min="1"
            step="0.01"
            className={`w-full p-3 border-2 rounded-lg focus:outline-none ${lockGoalAndChains ? 'border-gray-200 bg-gray-50 cursor-not-allowed' : 'border-gray-200 focus:border-blue-500'}`}
            disabled={lockGoalAndChains}
            placeholder="0.00"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Category</label>
          <select
            name="category"
            value={formData.category}
            onChange={handleInputChange}
            className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="">Select a category</option>
            {presetCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
            <option value="other">Other</option>
          </select>
          {formData.category === 'other' && (
            <input
              type="text"
              value={otherCategory}
              onChange={(e) => { setOtherCategory(e.target.value) }}
              placeholder="Specify your category"
              className="mt-2 w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
            />
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">Supported Blockchains</label>
        {/* Selected chains with remove */}
        <div className="flex flex-wrap gap-2 mb-3">
          {formData.chains.map((chain) => (
            <span key={chain} className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${lockGoalAndChains ? 'bg-gray-100 border border-gray-200 text-gray-500' : 'bg-white/10 border border-white/15'}`}>
              {chain}
              {!lockGoalAndChains && (
                <button type="button" onClick={() => setFormData(prev => ({ ...prev, chains: prev.chains.filter(c => c !== chain) }))} className="hover:text-red-500">×</button>
              )}
            </span>
          ))}
        </div>
        {/* Suggestions */}
        <div className="flex flex-wrap gap-2 mb-3">
          {['Ethereum','Solana','Bitcoin','ZetaChain'].filter(s => !formData.chains.includes(s)).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => !lockGoalAndChains && handleChainToggle(s)}
              className={`px-3 py-1 rounded-full text-sm ${lockGoalAndChains ? 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed' : 'bg-white/5 border border-gray-200/30 text-gray-600 hover:bg-white/10 hover:border-gray-300 hover:text-gray-800'}`}
              aria-disabled={lockGoalAndChains}
            >
              + {s}
            </button>
          ))}
        </div>
        {/* Custom chain input */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customChain}
            onChange={(e) => setCustomChain(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomChain() } }}
            placeholder="Add chain (e.g., ZetaChain)"
            disabled={lockGoalAndChains}
            className={`flex-1 p-2 border-2 rounded-lg ${lockGoalAndChains ? 'border-gray-200 bg-gray-50 cursor-not-allowed' : 'border-gray-200 focus:outline-none focus:border-blue-500'}`}
          />
          <button type="button" onClick={addCustomChain} disabled={lockGoalAndChains} className={`px-4 py-2 rounded-lg ${lockGoalAndChains ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-gray-800 text-white hover:bg-black'}`}>Add</button>
        </div>
      </div>
    </form>
  )
});

CampaignEditForm.displayName = 'CampaignEditForm';

export default CampaignEditForm;
