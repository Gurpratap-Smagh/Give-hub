"use client"

import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import type { User, Creator } from '@/lib/mock-db/database'
import ProfilePictureUpload from '@/components/profile-picture-upload'
import AIOverlay from '@/components/ai-overlay'

/**
 * Main Navigation Component
 * 
 * Building Block: Global navigation bar that appears on all pages
 * Features:
 * - Context-aware: Shows search on home page, hides "Explore" when already on home
 * - Search functionality: Filters campaigns by title/description
 * - Responsive design with mobile menu
 * - Consistent styling with shadows and hover effects
 * 
 * Future Extensions:
 * - User authentication state (login/logout)
 * - Profile dropdown menu
 * - Notification badges
 * - Mobile menu implementation
 */
export function Nav() {
  const [showSearch, setShowSearch] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false) // State for mobile menu
  const [searchQuery, setSearchQuery] = useState('')
  const [showAI, setShowAI] = useState(false)
  const { user, signout } = useAuth()
  const pathname = usePathname()

  // Hide search UX on studio pages
  const isStudio = pathname?.startsWith('/studio')

  /**
   * Handle search functionality
   * TODO: Connect to campaign filtering logic when search is implemented
   */
  const handleSearch = (query: string) => {
    setSearchQuery(query)
    // Future: Implement campaign filtering logic here
    console.log('Searching for:', query)
  }

  return (
    <>
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo - Building Block: Brand identity */}
          <Link href="/" onClick={() => setShowAI(false)} className="h-10 inline-flex items-center px-4 rounded-full font-bold text-3xl leading-none tracking-[-0.05em] text-gray-900 hover:text-blue-600 transition-colors">
            Give<span className="text-blue-600">Hub</span>
          </Link>

          {/* Search Bar - show when active on any page */}
          {showSearch && !isStudio && (
            <div className="flex-1 max-w-md mx-8">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search campaigns..."
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  onBlur={() => setShowSearch(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setShowSearch(false)
                    if (e.key === 'Enter') setShowSearch(false)
                  }}
                  className="w-full h-10 px-4 pl-10 pr-4 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                  autoFocus
                />
                <img src="/search.svg" alt="Search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <button
                  onClick={() => setShowSearch(false)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Navigation Links - Building Block: Main navigation */}
          <div className="hidden md:flex items-center gap-4">
            {/* Search Icon - show on all pages when search is not active */}
            {!showSearch && !isStudio && (
              <button
                onClick={() => { setShowAI(false); setShowSearch(true) }}
                className="h-10 w-10 inline-flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors shadow-sm border border-gray-200"
                title="Search campaigns"
              >
                <img src="/search.svg" alt="Search" className="w-5 h-5 text-gray-600" />
              </button>
            )}

            {/* Creator action: Studio link or Create Campaign (on studio) */}
            {user?.role === 'creator' && (
              isStudio ? (
                <Link
                  href="/create"
                  onClick={() => { setShowAI(false); setShowSearch(false) }}
                  className="h-10 inline-flex items-center px-4 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
                >
                  Create Campaign
                </Link>
              ) : (
                <Link
                  href="/studio"
                  onClick={() => { setShowAI(false); setShowSearch(false) }}
                  className="h-10 inline-flex items-center px-4 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
                >
                  Creator Studio
                </Link>
              )
            )}

            {/* AI Button */}
            <button
              onClick={() => setShowAI((v) => !v)}
              className="h-10 inline-flex items-center px-4 rounded-full border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all shadow-sm text-gray-700 hover:text-gray-900"
            >
              AI
            </button>

            {/* Authenticated actions */}
            {user && (
              <>
                {/* Profile Link with Picture only */}
                <Link
                  href="/profile"
                  onClick={() => { setShowAI(false); setShowSearch(false) }}
                  className="inline-flex items-center h-10"
                  aria-label="Profile"
                  title="Profile"
                >
                  <ProfilePictureUpload
                    currentUser={user as unknown as User | Creator}
                    currentPicture={(user as any)?.profilePicture}
                    onPictureChange={() => {}}
                    isEditing={false}
                    size="sm"
                  />
                </Link>
                <button onClick={signout} className="h-10 inline-flex items-center px-4 rounded-full border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all shadow-sm text-gray-700 hover:text-gray-900">
                  Logout
                </button>
              </>
            )}

            {/* Login Button - show only when logged out */}
            {!user && (
              <Link
                href="/auth"
                onClick={() => { setShowAI(false); setShowSearch(false) }}
                className="h-10 inline-flex items-center px-4 rounded-full border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all shadow-sm text-gray-700 hover:text-gray-900"
              >
                Login
              </Link>
            )}
          </div>

          {/* Mobile actions: Search trigger + Menu button */}
          {!showSearch && !isStudio && (
            <button
              className="md:hidden mr-2 h-10 w-10 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors shadow-sm border border-gray-200"
              onClick={() => { setShowAI(false); setShowSearch(true) }}
              aria-label="Open search"
              title="Search campaigns"
            >
              <img src="/search.svg" alt="Search" className="w-6 h-6 text-gray-600" />
            </button>
          )}
          {/* Mobile Menu Button - Building Block: Mobile navigation trigger */}
          <button
            className="md:hidden h-10 w-10 inline-flex items-center justify-center rounded-lg hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors shadow-sm border border-gray-200"
            onClick={() => { setShowAI(false); setIsMobileMenuOpen(!isMobileMenuOpen) }}
            aria-label="Toggle mobile menu"
            aria-expanded={isMobileMenuOpen}
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* REGION: Mobile Menu (Dropdown) */}
      {/* This menu appears when the hamburger icon is clicked on smaller screens. */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-white shadow-lg rounded-b-lg border-t border-gray-200 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex flex-col p-4 space-y-4">
            {user?.role === 'creator' && (
              isStudio ? (
                <Link href="/create" onClick={() => { setShowAI(false); setIsMobileMenuOpen(false) }} className="text-gray-700 hover:text-blue-600 font-medium px-2 py-1 rounded-md">Create Campaign</Link>
              ) : (
                <Link href="/studio" onClick={() => { setShowAI(false); setIsMobileMenuOpen(false) }} className="text-gray-700 hover:text-blue-600 font-medium px-2 py-1 rounded-md">Creator Studio</Link>
              )
            )}
            {user ? (
              <>
                <button
                  onClick={() => { setShowAI((v) => !v); /* AI button toggles itself */ setIsMobileMenuOpen(false) }}
                  className="text-gray-700 hover:text-blue-600 font-medium px-2 py-1 rounded-md text-left"
                >
                  AI
                </button>
                <Link href="/profile" onClick={() => { setShowAI(false); setIsMobileMenuOpen(false) }} className="inline-flex items-center px-2 py-1 rounded-md" aria-label="Profile" title="Profile">
                  <ProfilePictureUpload
                    currentUser={user as any}
                    currentPicture={(user as any)?.profilePicture}
                    onPictureChange={() => {}}
                    isEditing={false}
                    size="sm"
                  />
                </Link>
                <button
                  onClick={() => { setShowAI(false); setIsMobileMenuOpen(false); signout(); }}
                  className="w-full text-center px-4 py-2 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors text-gray-700"
                >
                  Logout
                </button>
              </>
            ) : (
              <Link href="/auth" onClick={() => { setShowAI(false); setIsMobileMenuOpen(false) }} className="w-full text-center bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                Login
              </Link>
            )}
          </div>
        </div>
      )}
      {/* END_REGION: Mobile Menu (Dropdown) */}

    </nav>
    {showAI && <AIOverlay open={showAI} onClose={() => setShowAI(false)} />}
    </>
  )
}
