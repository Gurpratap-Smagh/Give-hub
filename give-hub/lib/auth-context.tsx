/**
 * FILE: lib/auth-context.tsx
 * PURPOSE: React context for authentication state management
 * ACCESS: Wrap app with AuthProvider, use useAuth hook in components
 * MIGRATION NOTES:
 * - Replace localStorage with secure cookie management
 * - Add token refresh functionality
 * - Integrate with MongoDB user data
 * TODO:
 * - Add automatic token refresh
 * - Add user profile data caching
 * - Add role-based component access controls
 */

'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import Spinner from '@/components/spinner'
import { useRouter } from 'next/navigation'

interface User {
  id: string
  username: string
  email: string
  role: 'user' | 'creator'
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  signin: (emailOrUsername: string, password: string) => Promise<{ success: boolean; error?: string }>
  signup: (username: string, email: string, password: string, role: 'user' | 'creator') => Promise<{ success: boolean; error?: string }>
  signout: () => Promise<void>
  checkAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  // Check authentication status on mount
  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include'
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setUser(data.user)
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const signin = async (emailOrUsername: string, password: string) => {
    try {
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emailOrUsername, password }),
        credentials: 'include'
      })

      const data = await response.json()

      if (data.success) {
        setUser(data.user)
        return { success: true }
      } else {
        return { success: false, error: data.error }
      }
    } catch (error) {
      console.error('Signin error:', error)
      return { success: false, error: 'Network error' }
    }
  }

  const signup = async (username: string, email: string, password: string, role: 'user' | 'creator') => {
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, email, password, role }),
        credentials: 'include'
      })

      const data = await response.json()

      if (data.success) {
        setUser(data.user)
        return { success: true }
      } else {
        return { success: false, error: data.error }
      }
    } catch (error) {
      console.error('Signup error:', error)
      return { success: false, error: 'Network error' }
    }
  }

  const signout = async () => {
    try {
      await fetch('/api/auth/signout', {
        method: 'POST',
        credentials: 'include'
      })
    } catch (error) {
      console.error('Signout error:', error)
    } finally {
      setUser(null)
      router.push('/')
    }
  }

  const value: AuthContextType = {
    user,
    isLoading,
    signin,
    signup,
    signout,
    checkAuth
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// HOC for protected routes
export function withAuth<P extends object>(Component: React.ComponentType<P>) {
  return function AuthenticatedComponent(props: P) {
    const { user, isLoading } = useAuth()
    const router = useRouter()

    useEffect(() => {
      if (!isLoading && !user) {
        router.push('/auth')
      }
    }, [user, isLoading, router])

    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <Spinner size={32} />
            <p className="text-gray-600 mt-3">Loading...</p>
          </div>
        </div>
      )
    }

    if (!user) {
      return null // Will redirect to auth page
    }

    return <Component {...props} />
  }
}

// HOC for role-based access
export function withRole<P extends object>(Component: React.ComponentType<P>, allowedRoles: string[]) {
  return function RoleProtectedComponent(props: P) {
    const { user, isLoading } = useAuth()
    const router = useRouter()

    useEffect(() => {
      if (!isLoading && (!user || !allowedRoles.includes(user.role))) {
        router.push('/auth')
      }
    }, [user, isLoading, router])

    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <Spinner size={32} />
            <p className="text-gray-600 mt-3">Loading...</p>
          </div>
        </div>
      )
    }

    if (!user || !allowedRoles.includes(user.role)) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-gray-600 mb-4">You do not have permission to access this page.</p>
            <button
              onClick={() => router.push('/')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Go Home
            </button>
          </div>
        </div>
      )
    }

    return <Component {...props} />
  }
}
