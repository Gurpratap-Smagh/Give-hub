"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import AIOverlay from "./ai-overlay"
import PaymentModal from "./payment-modal"
import type { Campaign } from "@/lib/db"

export default function AILauncher() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
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

  return (
    <>
      {/* Floating launcher button bottom-right */}
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="fixed bottom-[25px] right-[25px] h-9 w-9 rounded-full bg-blue-600 bg-opacity-5 text-white shadow-lg hover:bg-blue-700 hover:bg-opacity-20 focus:outline-none focus:ring-2 focus:ring-blue-500 z-[80] inline-flex items-center justify-center"
        data-testid="ai-launcher-button"
        aria-label={open ? "Close GiveHub AI" : "Open GiveHub AI"}
        aria-pressed={open}
        title="Open GiveHub AI"
      >
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full ${theme === 'dark' ? 'bg-black' : 'bg-white'} text-xl text-blue-500 ring-1 ring-blue-500 shadow-sm`}>✦</span>
      </button>

      {/* Overlay (mount only when open) */}
      {open && (
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
            console.error("[AI] open_payment wiring failed:", e)
          }
          }}
        />
      )}

      {/* Payment Modal for AI-triggered donations */}
      {payCampaign && (
        <PaymentModal
          campaign={payCampaign}
          isOpen={payOpen}
          onClose={() => { setPayOpen(false); setPayCampaign(null); setPayAutoSubmit(false) }}
          onPaymentSuccess={() => { /* optionally toast */ setPayOpen(false); setPayCampaign(null); setPayAutoSubmit(false) }}
          onPaymentError={() => { /* optionally toast */ }}
          initialAmount={payInitialAmount}
          initialChain={payInitialChain}
          initialToken={payInitialToken}
          autoSubmit={payAutoSubmit}
        />
      )}
    </>
  )
}
