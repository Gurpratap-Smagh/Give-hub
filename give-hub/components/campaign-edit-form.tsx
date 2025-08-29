'use client'

import React, { useImperativeHandle, useRef, useState, forwardRef } from 'react'
import type { Campaign } from '@/lib/db'
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
  })
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

  // Removed effect-based onChange to prevent update depth issues

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => {
      return {
        ...prev,
        [name]: name === 'goal' ? parseFloat(value) || 0 : value
      }
    })
    // Push granular updates to parent without causing loops
    const next = { ...formData, [name]: name === 'goal' ? (parseFloat(value) || 0) : value }
    const mappedCategory = (next.category === 'other' ? otherCategory : next.category) as string
    onChange?.({ ...next, category: mappedCategory })
  }

  // Token update state is managed above

  // Store token changes to be applied on form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) return notify('Campaign title is required', 'error')
    if (!formData.description.trim()) return notify('Campaign description is required', 'error')
    if (formData.goal <= 0) return notify('Funding goal must be positive', 'error')

    const finalCategory = formData.category === 'other' ? otherCategory : formData.category
    if (!finalCategory.trim()) return notify('Category is required', 'error')
    
    // No token updates - removed token editing functionality
    
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

      {/* Token editing section removed - tokens can only be set during initial campaign creation */}
      {/* Chains selection removed */}
    </form>
  )
});

CampaignEditForm.displayName = 'CampaignEditForm';

export default CampaignEditForm;
