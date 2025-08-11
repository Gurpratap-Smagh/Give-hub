/**
 * FILE: app/layout.tsx
 * PURPOSE: Root layout for Next.js App Router - wraps all pages with global navigation and styles
 * WHAT CALLS THIS: Next.js App Router automatically wraps all pages with this layout
 * WHAT IT RENDERS: HTML shell with Nav component and main content area
 * ACCESS: Automatically applied to all routes in app/ directory
 * MIGRATION NOTES:
 * - Add Providers wrapper here for global state (Auth, React Query, etc.)
 * - Global CSS imports happen here (./globals.css contains Tailwind base)
 * - Nav component handles authentication state display
 * TODO:
 * - Wrap children with AuthProvider when implementing MongoDB auth
 * - Add QueryClient provider for React Query (API caching)
 * - Consider adding theme provider for dark/light mode
 * - Add error boundary for global error handling
 */

import type { Metadata } from 'next'
import './globals.css' // ACCESS: Tailwind CSS base styles, custom utilities
import { Nav } from '@/components/nav' // ACCESS: Global navigation component

// SEO metadata for all pages (can be overridden in individual pages)
export const metadata: Metadata = {
  title: 'GiveHub - Decentralized Donation Platform',
  description: 'Create and donate to campaigns on multiple blockchains',
}

/**
 * Root layout component - wraps all pages in the application
 * @param children - Page content to render inside the layout
 * @returns JSX element with global navigation and main content area
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {/* MIGRATION: Wrap with providers here */}
        {/* TODO: <AuthProvider><QueryClientProvider client={queryClient}> */}
        
        {/* Global navigation - handles auth state, wallet connection */}
        <Nav />
        
        {/* Main content area - pt-20 accounts for fixed nav height */}
        <main className="pt-20">
          {children}
        </main>
        
        {/* TODO: </QueryClientProvider></AuthProvider> */}
      </body>
    </html>
  )
}
