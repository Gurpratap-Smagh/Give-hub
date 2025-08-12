"use client"

import React from 'react'

interface SpinnerProps {
  size?: number // px
  colorClass?: string // tailwind color classes for border
  className?: string
}

export default function Spinner({ size = 24, colorClass = 'border-blue-600', className = '' }: SpinnerProps) {
  const style: React.CSSProperties = { width: size, height: size }
  return (
    <div
      className={`animate-spin rounded-full border-2 border-gray-200 ${colorClass} border-t-transparent ${className}`}
      style={style}
      aria-label="Loading"
      role="status"
    />
  )
}
