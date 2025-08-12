'use client'

import { useState, useRef } from 'react'
import { Campaign } from '@/lib/mock-db/database'

interface CampaignEditFormProps {
  campaign: Campaign
  onSave: (updatedCampaign: Partial<Campaign>) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
  /** When true, goal and chains are read-only (locked) */
  lockGoalAndChains?: boolean
  /** Optional disclaimer text shown at top of form */
  disclaimerText?: string
  /** Optional live-change callback for preview */
  onChange?: (partial: Partial<Campaign>) => void
}

export default function CampaignEditForm({ 
  campaign, 
  onSave, 
  onCancel, 
  isLoading = false,
  lockGoalAndChains = false,
  disclaimerText,
  onChange
}: CampaignEditFormProps) {
  const presetCategories = [
    'Education',
    'Healthcare',
    'Environment',
    'Animals',
    'Community',
    'Emergency Relief',
    'Technology',
    'Arts & Culture',
    'Sports'
  ] as const

  const initialCategory = campaign.category
    ? (presetCategories.includes(campaign.category as any) ? campaign.category : 'other')
    : ''

  const [formData, setFormData] = useState({
    title: campaign.title,
    description: campaign.description,
    goal: campaign.goal,
    category: initialCategory as string,
    image: campaign.image || '',
    chains: campaign.chains
  })
  const [otherCategory, setOtherCategory] = useState(
    campaign.category && !presetCategories.includes(campaign.category as any)
      ? campaign.category
      : ''
  )
  const [imageUploading, setImageUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Emit changes upstream for live preview
  const emitChange = (next: typeof formData, otherCat: string = otherCategory) => {
    const mappedCategory = next.category === 'other' ? otherCat : next.category
    const partial: Partial<Campaign> = { ...next, category: mappedCategory }
    onChange?.(partial)
  }

  // Convert file to base64
  const convertToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // Handle image upload
  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      alert('Image size must be less than 5MB')
      return
    }

    setImageUploading(true)
    try {
      const base64 = await convertToBase64(file)
      setFormData(prev => {
        const next = { ...prev, image: base64 }
        emitChange(next)
        return next
      })
    } catch (error) {
      console.error('Error converting image:', error)
      alert('Error processing image. Please try again.')
    } finally {
      setImageUploading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => {
      const next = {
        ...prev,
        [name]: name === 'goal' ? parseFloat(value) || 0 : value
      } as typeof formData
      emitChange(next)
      return next
    })
  }

  const handleChainToggle = (chain: "Ethereum" | "Solana" | "Bitcoin") => {
    setFormData(prev => {
      const next = {
        ...prev,
        chains: prev.chains.includes(chain)
          ? prev.chains.filter(c => c !== chain)
          : [...prev.chains, chain]
      }
      emitChange(next as typeof formData)
      return next as typeof formData
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.title.trim()) {
      alert('Campaign title is required')
      return
    }
    
    if (!formData.description.trim()) {
      alert('Campaign description is required')
      return
    }
    
    if (formData.goal <= 0) {
      alert('Campaign goal must be greater than 0')
      return
    }
    
    if (formData.chains.length === 0) {
      alert('Please select at least one blockchain')
      return
    }

    // If user selected Other, ensure custom text and map it
    if (formData.category === 'other' && !otherCategory.trim()) {
      alert('Please specify your category')
      return
    }

    const categoryToSend = formData.category === 'other'
      ? otherCategory.trim()
      : formData.category

    await onSave({ ...formData, category: categoryToSend })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-0 overflow-hidden">
      {/* Header image with pencil overlay (matches create page style) */}
      <div className="relative w-full h-56 bg-gray-100">
        {formData.image ? (
          <img
            src={formData.image}
            alt="Campaign image"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">No image selected</div>
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={imageUploading}
          className="absolute top-3 right-3 inline-flex items-center justify-center w-10 h-10 rounded-full bg-black/50 hover:bg-black/60 transition text-white shadow-md disabled:opacity-50"
          title="Change image"
          aria-label="Change image"
        >
          {/* Pencil icon */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M16.862 3.487a1.5 1.5 0 0 1 2.121 0l1.53 1.53a1.5 1.5 0 0 1 0 2.121l-9.9 9.9a1.5 1.5 0 0 1-.67.386l-4.019 1.004a.75.75 0 0 1-.91-.91l1.003-4.02a1.5 1.5 0 0 1 .386-.669l9.9-9.9Zm-2.828 2.828L5.9 14.45a.5.5 0 0 0-.129.223l-.692 2.773 2.773-.692a.5.5 0 0 0 .223-.13l8.134-8.133-2.167-2.167Z" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleImageUpload(f)
          }}
          className="hidden"
        />
      </div>
      <div className="p-6">
      {disclaimerText && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
          {disclaimerText}
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Edit Campaign</h2>
        <button
          onClick={onCancel}
          className="text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Campaign Title */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Campaign Title
          </label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleInputChange}
            className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
            placeholder="Enter campaign title"
            required
          />
        </div>

        {/* Campaign Description */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-semibold text-gray-700">
              Description
            </label>
            <button
              type="button"
              onClick={() => {
                const friendlyGoal = formData.goal ? ` a goal of $${Number(formData.goal).toLocaleString()}` : ''
                const categoryText = formData.category ? ` in the ${formData.category} category` : ''
                const suggested = `This campaign, "${formData.title || 'Untitled Campaign'}"${categoryText}, aims to create real-world impact on GiveHub.${friendlyGoal}. Your support helps us reach more people, share transparent updates, and turn generosity into action. Join us and spread the word to amplify our mission.`
                setFormData(prev => ({ ...prev, description: suggested }))
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-gray-200 text-gray-700 hover:border-blue-500 hover:text-blue-600 hover:shadow-sm transition-all"
              title="Edit with AI"
            >
              <span className="text-base">✨</span>
              Edit with AI
            </button>
          </div>
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

        {/* Goal and Category Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Funding Goal ($)
            </label>
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
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Category
            </label>
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
                onChange={(e) => { setOtherCategory(e.target.value); emitChange(formData, e.target.value) }}
                placeholder="Specify your category"
                className="mt-2 w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
              />
            )}
          </div>
        </div>

        {/* Blockchain Selection */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-3">
            Supported Blockchains
          </label>
          <div className="flex flex-wrap gap-3">
            {(['Ethereum', 'Solana', 'Bitcoin'] as const).map((chain) => (
              <button
                key={chain}
                type="button"
                onClick={() => !lockGoalAndChains && handleChainToggle(chain)}
                className={`px-4 py-2 rounded-full border-2 transition-all ${
                  formData.chains.includes(chain)
                    ? (lockGoalAndChains ? 'border-gray-300 bg-gray-50 text-gray-500' : 'border-blue-500 bg-blue-50 text-blue-700')
                    : (lockGoalAndChains ? 'border-gray-200 bg-gray-50 text-gray-400' : 'border-gray-200 text-gray-600 hover:border-gray-300')
                } ${lockGoalAndChains ? 'cursor-not-allowed' : ''}`}
                aria-disabled={lockGoalAndChains}
              >
                {chain}
              </button>
            ))}
          </div>
        </div>

        {/* AI placeholder note */}
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center">
            <div className="text-green-600 mr-2">🤖</div>
            <div>
              <p className="text-sm text-green-800 font-medium">AI Editing Coming Soon</p>
              <p className="text-xs text-green-700 mt-1">You&apos;ll soon be able to use AI to improve your campaign content directly here.</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : 'Finish'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
      </div>
    </div>
  )
}
