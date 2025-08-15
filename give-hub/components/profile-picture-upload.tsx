'use client'

import { useState, useRef, useEffect } from 'react'
import type { User, Creator } from '@/lib/utils/types'
import { notify } from '@/lib/utils/notify'

interface ProfilePictureUploadProps {
  currentUser: User | Creator
  currentPicture?: string
  onPictureChange: (newPicture: string) => void
  isEditing: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function ProfilePictureUpload({ 
  currentUser, 
  currentPicture, 
  onPictureChange, 
  isEditing,
  size = 'lg'
}: ProfilePictureUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Size configurations
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-20 h-20', 
    lg: 'w-32 h-32'
  }

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
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

  // Handle file selection
  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      notify('Please select an image file', 'error')
      return
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      notify('Image size must be less than 5MB', 'error')
      return
    }

    setIsUploading(true)
    try {
      const base64 = await convertToBase64(file)
      onPictureChange(base64)
    } catch (error) {
      console.error('Error converting image:', error)
      notify('Error processing image. Please try again.', 'error')
    } finally {
      setIsUploading(false)
    }
  }

  // Handle drag and drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  // Handle click to upload
  const handleClick = () => {
    if (isEditing && fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  // Narrow currentUser for display-only properties
  type SafeUser = Pick<User, 'name' | 'profilePicture'> & Partial<Pick<Creator, 'username'>>
  const cu = currentUser as unknown as SafeUser

  // Generate default avatar if no picture
  const getDefaultAvatar = () => {
    const colors = ['#4F96FF', '#FF6565', '#10B981', '#F59E0B', '#8B5CF6', '#6366F1']
    const display = cu.username || cu.name || 'U'
    const color = colors[display.length % colors.length]
    const initial = String(display).charAt(0).toUpperCase()
    
    return `data:image/svg+xml;base64,${btoa(`
      <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="50" fill="${color}"/>
        <text x="50" y="50" text-anchor="middle" dominant-baseline="central" fill="white" font-size="36" font-family="system-ui">${initial}</text>
      </svg>
    `)}`
  }

  // Cute fallback avatar if image fails to load
  const getCuteFallback = () => {
    return `data:image/svg+xml;base64,${btoa(`
      <svg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'>
        <defs>
          <linearGradient id='g' x1='0' x2='1' y1='0' y2='1'>
            <stop offset='0%' stop-color='#60a5fa'/>
            <stop offset='100%' stop-color='#a78bfa'/>
          </linearGradient>
        </defs>
        <rect width='100' height='100' rx='20' fill='url(#g)'/>
        <circle cx='35' cy='40' r='6' fill='white'/>
        <circle cx='65' cy='40' r='6' fill='white'/>
        <path d='M30 63 C 40 75, 60 75, 70 63' stroke='white' stroke-width='6' fill='none' stroke-linecap='round'/>
        <circle cx='30' cy='70' r='6' fill='white' opacity='0.3'/>
        <circle cx='70' cy='70' r='6' fill='white' opacity='0.3'/>
      </svg>
    `)}`
  }

  const displayPicture = currentPicture || cu.profilePicture || getDefaultAvatar()
  const [imageSrc, setImageSrc] = useState(displayPicture)

  // Keep imageSrc in sync when display picture changes (e.g., after upload)
  useEffect(() => {
    setImageSrc(displayPicture)
  }, [displayPicture])

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Profile Picture Display */}
      <div 
        className={`${sizeClasses[size]} relative rounded-full overflow-hidden bg-gray-100 pfp-bg border-4 border-white shadow-lg ${
          isEditing ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
        } ${dragActive ? 'ring-4 ring-blue-500 ring-opacity-50' : ''}`}
        onClick={handleClick}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <img 
          src={imageSrc} 
          alt={`${(cu.username || cu.name || 'User')}'s profile picture`}
          className="w-full h-full object-cover"
          onError={() => setImageSrc(getCuteFallback())}
          draggable={false}
        />
        
        {/* Upload Overlay */}
        {isEditing && (
          <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center">
            <div className="opacity-0 hover:opacity-100 transition-opacity">
              {isUploading ? (
                <div className="animate-spin rounded-full border-2 border-white border-t-transparent w-6 h-6"></div>
              ) : (
                <svg className={`${iconSizes[size]} text-white`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Upload Instructions */}
      {isEditing && (
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-2">
            Click or drag to upload
          </p>
          <p className="text-xs text-gray-500">
            Max 5MB • JPG, PNG, GIF
          </p>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0])
          }
        }}
        className="hidden"
      />
    </div>
  )
}
