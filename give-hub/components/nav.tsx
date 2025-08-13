"use client"

import Link from 'next/link'
import { useState, useRef, useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/auth-context'
import type { User, Creator } from '@/_dev/mock-db/database'
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
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [showProfileDropdown, setShowProfileDropdown] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchParam, setSearchParam] = useState<'title' | 'creator' | 'category'>('title')
  const [showAI, setShowAI] = useState(false)
  const { user, signout } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const searchParamsNav = useSearchParams()
  const searchRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const profileDropdownRef = useRef<HTMLDivElement>(null)

  // Hide search UX on studio pages
  const isStudio = pathname?.startsWith('/studio')

  // Handle clicks outside search area to close search
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchRef.current && !searchRef.current.contains(event.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
        profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)
      ) {
        setShowSearch(false)
        setShowSearchDropdown(false)
        setShowProfileDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Clear search UI and input when landing on home without search params
  useEffect(() => {
    if (pathname === '/' && !searchParamsNav.get('search')) {
      setSearchQuery('')
      setShowSearch(false)
      setShowSearchDropdown(false)
    }
  }, [pathname, searchParamsNav])

  /**
   * Handle search functionality with parameter-based filtering
   */
  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (query.trim()) {
      // Always redirect to home with search params so results show on the home page
      const params = new URLSearchParams()
      params.set('search', query.trim())
      params.set('param', searchParam)
      const target = `/?${params.toString()}`
      if (pathname !== '/') {
        // First go home to show all cards immediately, then apply search
        router.push('/')
        // Push search URL on next tick for smooth transition
        setTimeout(() => router.push(target), 0)
      } else {
        router.push(target)
      }
    }
  }

  const handleSearchSubmit = () => {
    if (searchQuery.trim()) {
      handleSearch(searchQuery)
      setShowSearch(false)
      setShowSearchDropdown(false)
    }
  }

  const searchParamLabels = {
    title: 'Title',
    creator: 'Creator', 
    category: 'Category'
  }

  return (
    <>
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo - Building Block: Brand identity */}
          <div className="flex items-center space-x-8">
            <Link href="/" className="text-xl font-bold text-gray-900">
              <span className="tracking-tight">Give</span>
              <span className="text-blue-600 tracking-tight">Hub</span>
            </Link>
          </div>

          {/* Search Bar - show when active on any page */}
          {showSearch && !isStudio && (
            <div className="flex-1 max-w-md mx-8 flex items-center gap-2">
              <div ref={searchRef} className="relative flex-1">
                <input
                  type="text"
                  placeholder={`Search campaigns by ${searchParam}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setShowSearch(false)
                      setShowSearchDropdown(false)
                    } else if (e.key === 'Enter') {
                      e.preventDefault()
                      handleSearchSubmit()
                    }
                  }}
                  className="w-full pl-10 pr-4 py-2 rounded-full border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
                  autoFocus
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <button
                  onClick={handleSearchSubmit}
                  className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-9 w-9 rounded-full bg-white border border-gray-300 text-gray-500 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="Submit search"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>
              
              {/* Search Parameter Dropdown */}
              <div ref={dropdownRef} className="relative">
                <button
                  onClick={() => setShowSearchDropdown(!showSearchDropdown)}
                  className="h-10 px-3 border border-gray-300 rounded-full hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm bg-white flex items-center gap-1"
                >
                  <span className="text-sm font-medium text-gray-700">{searchParamLabels[searchParam]}</span>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${showSearchDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {showSearchDropdown && (
                  <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[120px]">
                    {Object.entries(searchParamLabels).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => {
                          setSearchParam(key as 'title' | 'creator' | 'category')
                          setShowSearchDropdown(false)
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                          searchParam === key ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* User Actions - Building Block: Authentication state */}
          <div className="flex items-center space-x-4">
            {/* Search Toggle - Building Block: Search functionality */}
            {pathname !== '/studio' && !showSearch && (
              <button
                className="h-9 w-9 inline-flex items-center justify-center rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors shadow-sm border border-gray-200"
                onClick={() => { setShowAI(false); setShowSearch(!showSearch) }}
                aria-label="Toggle search"
                aria-expanded={showSearch}
              >
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            )}
            {/* Creator action inline on md+; moved into profile dropdown for <md */}
            {user?.role === 'creator' && (
              isStudio ? (
                <Link href="/create" className="hidden md:inline-flex items-center px-4 py-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                  Create Campaign
                </Link>
              ) : (
                <Link href="/studio" className="hidden md:inline-flex items-center px-4 py-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                  Creator Studio
                </Link>
              )
            )}
            {/* User Profile - Building Block: User authentication state */}
            {user ? (
              <div className="relative" ref={profileDropdownRef}>
                <button
                  onClick={() => { setShowAI(false); setShowProfileDropdown(!showProfileDropdown) }}
                  className="inline-flex items-center space-x-2 px-2 py-1 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label="User menu"
                >
                  <ProfilePictureUpload
                    currentUser={user as User | Creator}
                    currentPicture={(user as User & { profilePicture?: string })?.profilePicture}
                    onPictureChange={() => {}}
                    isEditing={false}
                    size="sm"
                  />
                  <svg 
                    className={`w-4 h-4 text-gray-600 transition-transform ${showProfileDropdown ? 'rotate-180' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {showProfileDropdown && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                    {user?.role === 'creator' && (
                      isStudio ? (
                        <Link 
                          href="/create" 
                          className="md:hidden flex items-center px-4 py-2 text-sm text-blue-700 hover:bg-blue-50"
                          onClick={() => setShowProfileDropdown(false)}
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Create Campaign
                        </Link>
                      ) : (
                        <Link 
                          href="/studio" 
                          className="md:hidden flex items-center px-4 py-2 text-sm text-blue-700 hover:bg-blue-50"
                          onClick={() => setShowProfileDropdown(false)}
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 1.343-3 3v5h6v-5c0-1.657-1.343-3-3-3z" />
                          </svg>
                          Creator Studio
                        </Link>
                      )
                    )}
                    <Link 
                      href="/profile" 
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setShowProfileDropdown(false)}
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      Edit Profile
                    </Link>
                    <button
                      onClick={() => { setShowProfileDropdown(false); signout(); }}
                      className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/auth?mode=signin" className="hidden md:inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                Login
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* REGION: Mobile Menu (Dropdown) */}
      {/* This menu appears when the hamburger icon is clicked on smaller screens. */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 w-full bg-white shadow-lg rounded-b-lg border-t border-gray-200 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex flex-col p-4 space-y-4">
            {user?.role === 'creator' && (
              isStudio ? (
                <Link href="/create" onClick={() => { setShowAI(false); setIsMobileMenuOpen(false) }} className="w-full text-center bg-blue-600 text-white py-2 px-4 rounded-full hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Create Campaign</Link>
              ) : (
                <Link href="/studio" onClick={() => { setShowAI(false); setIsMobileMenuOpen(false) }} className="w-full text-center bg-blue-600 text-white py-2 px-4 rounded-full hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Creator Studio</Link>
              )
            )}
            {user ? (
              <>
                <Link href="/profile" onClick={() => { setShowAI(false); setIsMobileMenuOpen(false) }} className="inline-flex items-center px-2 py-1 rounded-md" aria-label="Profile" title="Profile">
                  <ProfilePictureUpload
                    currentUser={user as User | Creator}
                    currentPicture={(user as User & { profilePicture?: string })?.profilePicture}
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
              <Link href="/auth?mode=signin" onClick={() => { setShowAI(false); setIsMobileMenuOpen(false) }} className="w-full text-center bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                Login
              </Link>
            )}
          </div>
        </div>
      )}
      {/* END_REGION: Mobile Menu (Dropdown) */}

    </nav>
    {/* Floating AI button (bottom-right) */}
    <button
      onClick={() => { setIsMobileMenuOpen(false); setShowSearch(false); setShowAI((v) => !v) }}
      className="fixed bottom-[25px] right-[25px] h-14 w-14 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 z-[60] inline-flex items-center justify-center"
      aria-label="Open AI Assistant"
      title="Open AI Assistant"
    >
      <span className="text-2xl">🤖</span>
    </button>
    {showAI && <AIOverlay open={showAI} onClose={() => setShowAI(false)} />}
    </>
  )
}
