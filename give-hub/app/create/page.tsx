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

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useAuth } from '@/lib/auth/auth-context'
import { notify } from '@/lib/utils/notify'
// TODO: import { createCampaign } from '@/lib/api' // Future API integration
// TODO: import { validateCampaign } from '@/lib/validation' // Zod schema validation
// TODO: import { optimizeContent } from '@/lib/ai' // AI content enhancement

/**
 * Campaign creation page component
 * @returns JSX element with campaign creation form
 */
export default function CreateCampaignPage() {
  // REGION: State management
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    goal: '',
    chains: [] as string[],
    category: ''
  })
  const [image, setImage] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [otherCategory, setOtherCategory] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()
  const { user } = useAuth()

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
      notify('Please select an image file', 'error')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      notify('Image size must be less than 5MB', 'error')
      return
    }
    const base64 = await convertToBase64(file)
    setImage(base64)
  }

  /**
   * Toggle blockchain selection
   * @param chain - Blockchain name to toggle
   */
  const handleChainToggle = (chain: string) => {
    setFormData({
      ...formData,
      chains: formData.chains.includes(chain)
        ? formData.chains.filter(c => c !== chain)
        : [...formData.chains, chain]
    })
  }

  /**
   * Handle form submission - currently placeholder
   * MIGRATION: Replace with API call and validation
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.category) {
      notify('Please select a category', 'error')
      return
    }
    if (formData.category === 'other' && !otherCategory.trim()) {
      notify('Please specify your category', 'error')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          goal: Number(formData.goal),
          chains: formData.chains as ('Ethereum' | 'Solana' | 'Bitcoin')[],
          category: formData.category === 'other' ? otherCategory.trim() : formData.category,
          creatorId: user?.id,
          image
        })
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create campaign')
      }
      // Redirect to the new campaign page; campaign page shows its own loading
      router.push(`/campaign/${data.campaign.id}`)
    } catch (error) {
      console.error('Campaign creation failed:', error)
      notify('Failed to create campaign. Please try again.', 'error')
    } finally {
      setIsSubmitting(false)
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
            onClick={() => {
              const friendlyGoal = formData.goal ? ` a goal of $${Number(formData.goal).toLocaleString()}` : ''
              const rawCategory = formData.category === 'other' ? (otherCategory || 'Other') : formData.category
              const categoryText = rawCategory ? ` in the ${rawCategory} category` : ''
              const suggested = `We are launching "${formData.title || 'our campaign'}"${categoryText} on GiveHub to create meaningful impact.${friendlyGoal}. Your support will help us reach more people, deliver transparent updates, and turn generosity into real-world change. Join us and share this campaign to amplify the mission.`
              setFormData(prev => ({ ...prev, description: suggested }))
            }}
            className="px-4 py-2 rounded-full border-2 border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300"
          >
            Edit with AI
          </button>
          <button
            type="button"
            onClick={() => formRef.current?.requestSubmit()}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-full bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-70"
          >
            {isSubmitting ? 'Creating...' : 'Create Campaign'}
          </button>
        </div>
      </div>

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
                Funding Goal (USD) *
              </label>
              <div className="relative">
                <span className="absolute left-4 top-4 text-gray-500 text-lg font-medium">$</span>
                <input
                  type="number"
                  name="goal"
                  value={formData.goal}
                  onChange={handleInputChange}
                  className="w-full pl-8 pr-4 py-4 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:outline-none text-lg"
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

            {/* Blockchain Selection */}
            <div>
              <label className="block text-lg font-semibold text-gray-900 mb-3">
                Supported Blockchains *
              </label>
              <p className="text-gray-600 mb-4">
                Choose which blockchains you want to accept donations from:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {['Ethereum', 'Solana', 'Bitcoin'].map((chain) => (
                  <button
                    key={chain}
                    type="button"
                    onClick={() => handleChainToggle(chain)}
                    className={`p-4 rounded-lg border-2 transition-all font-semibold ${
                      formData.chains.includes(chain)
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-center">
                      <div className="text-2xl mb-2">
                        {chain === 'Ethereum' ? '⟠' : chain === 'Solana' ? '◎' : '₿'}
                      </div>
                      <div>{chain}</div>
                    </div>
                  </button>
                ))}
              </div>
              {formData.chains.length === 0 && (
                <p className="text-red-500 text-sm mt-2">Please select at least one blockchain</p>
              )}
            </div>

            {/* Image selection moved to preview card pencil overlay */}

            {/* Submit moved to header */}
          </form>
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
            {/* Pencil overlay trigger */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute top-3 right-3 inline-flex items-center justify-center w-10 h-10 rounded-full bg-black/50 hover:bg-black/60 transition text-white shadow-md"
              title="Change image"
            >
              {/* Pencil icon */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M16.862 3.487a1.5 1.5 0 0 1 2.121 0l1.53 1.53a1.5 1.5 0 0 1 0 2.121l-9.9 9.9a1.5 1.5 0 0 1-.67.386l-4.019 1.004a.75.75 0 0 1-.91-.91l1.003-4.02a1.5 1.5 0 0 1 .386-.669l9.9-9.9Zm-2.828 2.828L5.9 14.45a.5.5 0 0 0-.129.223l-.692 2.773 2.773-.692a.5.5 0 0 0 .223-.13l8.134-8.133-2.167-2.167Z" />
              </svg>
            </button>
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
                <span>$0 raised</span>
                <span>Goal: ${formData.goal || '0'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Placeholder Notice */}
      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-center">
          <div className="text-blue-600 mr-3">ℹ️</div>
          <div>
            <p className="text-sm text-blue-800 font-medium">Enhanced with AI</p>
            <p className="text-xs text-blue-700 mt-1">
              Campaign creation will be enhanced with Gemini AI for content optimization and validation.
            </p>
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
    </div>
  )
}
