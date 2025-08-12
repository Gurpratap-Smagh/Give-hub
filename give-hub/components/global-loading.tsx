"use client"

import React from 'react'
import Spinner from './spinner'
import { useAuth } from '@/lib/auth-context'

export default function GlobalLoading() {
  const { isLoading } = useAuth()
  if (!isLoading) return null
  return (
    <div className="fixed top-20 right-4 z-[60] pointer-events-none">
      <div className="flex items-center gap-2 bg-white/80 backdrop-blur rounded-full px-3 py-2 shadow border border-gray-200">
        <Spinner size={16} />
        <span className="text-xs text-gray-600">Loading...</span>
      </div>
    </div>
  )
}
