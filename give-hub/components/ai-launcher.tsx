"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import AIOverlay from "./ai-overlay"
import MobileSidePanel from "./mobile-side-panel"
import PaymentModal from "./payment-modal"
import type { Campaign } from "@/lib/db"

export default function AILauncher() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [isMobile, setIsMobile] = useState(false)
  // Payment modal wiring for AI-triggered donations
  const [payOpen, setPayOpen] = useState(false)
  const [payCampaign, setPayCampaign] = useState<Campaign | null>(null)
  const [payInitialAmount, setPayInitialAmount] = useState<number | undefined>(undefined)
  const [payInitialChain, setPayInitialChain] = useState<string | undefined>(undefined)
  const [payInitialToken, setPayInitialToken] = useState<string | undefined>(undefined)
  const [payAutoSubmit, setPayAutoSubmit] = useState(false)

  // Resolve theme from document or system once on mount
  useEffect(() => {
    try {
      const d = document.documentElement?.dataset?.theme
      if (d === 'light' || d === 'dark') { setTheme(d); return }
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      setTheme(prefersDark ? 'dark' : 'light')
    } catch { /* noop */ }
  }, [])

  // Check if mobile/tablet on mount and window resize
  useEffect(() => {
    const compute = () => {
      try {
        const vv = typeof window !== 'undefined' ? window.visualViewport : undefined
        const vw = vv?.width ?? window.innerWidth
        const coarse = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          ? window.matchMedia('(pointer: coarse)').matches
          : false
        setIsMobile(vw <= 1024 || coarse)
      } catch {
        setIsMobile(window.innerWidth <= 1024)
      }
    }
    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('orientationchange', compute)
    const vv = typeof window !== 'undefined' ? window.visualViewport : undefined
    vv?.addEventListener('resize', compute)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('orientationchange', compute)
      vv?.removeEventListener('resize', compute)
    }
  }, [])

  return (
    <>
      {/* Floating launcher button bottom-right - hide on mobile when panel is open */}
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className={`fixed bottom-[25px] right-[25px] h-12 w-12 rounded-full bg-white bg-opacity-100 dark:bg-slate-800 dark:bg-opacity-100 border border-blue-600 text-blue-600 text-[20px] shadow-lg hover:bg-blue-600/10 focus:outline-none focus:ring-2 focus:ring-blue-500 z-[80] inline-flex items-center justify-center transition-all duration-200 ${
          isMobile && open ? 'opacity-0 pointer-events-none scale-75' : 'opacity-100 pointer-events-auto scale-100'
        }`}
        data-testid="ai-launcher-button"
        aria-label={open ? "Close GiveHub AI" : "Open GiveHub AI"}
        aria-pressed={open}
        title="Open GiveHub AI"
      >
        <span className="transform scale-75">✦</span>
      </button>

      {/* Overlay for desktop, side panel for mobile */}
      {open && (
        isMobile ? (
          <MobileSidePanel
            open={open}
            theme={theme}
            onClose={() => setOpen(false)}
            onAction={async (action) => {
              if (action.type === "open_search") {
                const search = encodeURIComponent(action.search || "")
                const param = encodeURIComponent(action.param || "title")
                router.push(`/?search=${search}&param=${param}`)
                return
              }
              if (action.type !== "open_payment" && action.type !== "fill_payment") return
              try {
                // Fetch campaign details by id so PaymentModal has full data
                const res = await fetch(`/api/campaigns/${encodeURIComponent(action.campaignId)}`, { cache: "no-store" })
                if (!res.ok) throw new Error(`Failed to load campaign (${res.status})`)
                const data = await res.json() as { success?: boolean; campaign?: Campaign }
                const campaign = (data && ("campaign" in data) ? data.campaign : null) as Campaign | null
                if (!campaign) throw new Error("Campaign not found")

                setPayCampaign(campaign)
                setPayInitialAmount(typeof action.amount === "number" && Number.isFinite(action.amount) ? action.amount : undefined)
                setPayInitialChain(action.chain || undefined)
                setPayInitialToken((action as { token?: string }).token || undefined)
                setPayAutoSubmit(Boolean(action.confirm))
                setPayOpen(true)
              } catch (e) {
                if (process.env.NODE_ENV === 'development') {
                  console.error("[AI] open_payment wiring failed:", e)
                }
              }
            }}
          />
        ) : (
          <AIOverlay
            open={open}
            theme={theme}
            onClose={() => setOpen(false)}
            onAction={async (action) => {
              if (action.type === "open_search") {
                const search = encodeURIComponent(action.search || "")
                const param = encodeURIComponent(action.param || "title")
                router.push(`/?search=${search}&param=${param}`)
                return
              }
              if (action.type !== "open_payment" && action.type !== "fill_payment") return
              try {
                // Fetch campaign details by id so PaymentModal has full data
                const res = await fetch(`/api/campaigns/${encodeURIComponent(action.campaignId)}`, { cache: "no-store" })
                if (!res.ok) throw new Error(`Failed to load campaign (${res.status})`)
                const data = await res.json() as { success?: boolean; campaign?: Campaign }
                const campaign = (data && ("campaign" in data) ? data.campaign : null) as Campaign | null
                if (!campaign) throw new Error("Campaign not found")

                setPayCampaign(campaign)
                setPayInitialAmount(typeof action.amount === "number" && Number.isFinite(action.amount) ? action.amount : undefined)
                setPayInitialChain(action.chain || undefined)
                setPayInitialToken((action as { token?: string }).token || undefined)
                setPayAutoSubmit(Boolean(action.confirm))
                setPayOpen(true)
              } catch (e) {
                if (process.env.NODE_ENV === 'development') {
                  console.error("[AI] open_payment wiring failed:", e)
                }
              }
            }}
          />
        )
      )}

      {/* Payment Modal for AI-triggered donations */}
      {payCampaign && (
        <PaymentModal
          campaign={payCampaign}
          isOpen={payOpen}
          onClose={() => { setPayOpen(false); setPayCampaign(null); setPayAutoSubmit(false) }}
          onPaymentSuccess={() => { /* optionally toast */ setPayOpen(false); setPayCampaign(null); setPayAutoSubmit(false) }}
          initialAmount={payInitialAmount}
          initialChain={payInitialChain}
          initialToken={payInitialToken}
          autoSubmit={payAutoSubmit}
        />
      )}
    </>
  )
}
