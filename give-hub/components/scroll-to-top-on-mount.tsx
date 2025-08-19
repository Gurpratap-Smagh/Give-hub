"use client"

import { useEffect } from 'react'

export default function ScrollToTopOnMount({ behavior = 'auto' as ScrollBehavior }: { behavior?: ScrollBehavior }) {
  useEffect(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior })
    } catch {
      // fallback
      window.scrollTo(0, 0)
    }
  }, [behavior])
  return null
}
