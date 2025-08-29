/**
 * FILE: components/skeleton-loader.tsx
 * PURPOSE: Reusable skeleton loading components for consistent loading states
 */

"use client"

import React from 'react'

interface SkeletonProps {
  className?: string
  animate?: boolean
}

export function Skeleton({ className = '', animate = true }: SkeletonProps) {
  return (
    <div 
      className={`bg-gray-200 dark:bg-gray-700 rounded ${animate ? 'animate-pulse' : ''} ${className}`}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-sm">
      <div className="animate-pulse">
        {/* Image placeholder */}
        <div className="w-full h-32 bg-gray-200 dark:bg-gray-700 rounded-lg mb-4" />
        
        {/* Category chip */}
        <div className="flex justify-end mb-2">
          <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
        </div>
        
        {/* Title */}
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3" />
        
        {/* Progress section */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4" />
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-full" />
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
        </div>
      </div>
    </div>
  )
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {Array(count).fill(0).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

export function SkeletonText({ lines = 1, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array(lines).fill(0).map((_, i) => (
        <div 
          key={i} 
          className={`h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse ${
            i === lines - 1 ? 'w-3/4' : 'w-full'
          }`} 
        />
      ))}
    </div>
  )
}

export function SkeletonButton({ className = '' }: { className?: string }) {
  return (
    <div className={`h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse ${className}`} />
  )
}

export function SkeletonAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12', 
    lg: 'w-16 h-16'
  }
  
  return (
    <div className={`${sizeClasses[size]} bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse`} />
  )
}

export function SkeletonStats() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {Array(3).fill(0).map((_, i) => (
        <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
            <div className="h-8 bg-gray-200 rounded w-3/4" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonForm() {
  return (
    <div className="space-y-6">
      <div className="animate-pulse">
        {/* Form fields */}
        {Array(4).fill(0).map((_, i) => (
          <div key={i} className="space-y-2 mb-4">
            <div className="h-4 bg-gray-200 rounded w-1/4" />
            <div className="h-10 bg-gray-200 rounded-lg w-full" />
          </div>
        ))}
        
        {/* Submit button */}
        <div className="h-12 bg-gray-200 rounded-lg w-full" />
      </div>
    </div>
  )
}
