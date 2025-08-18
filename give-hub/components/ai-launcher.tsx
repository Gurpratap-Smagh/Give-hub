"use client"

import { useState } from "react"
import AIOverlay from "./ai-overlay"
import PaymentModal from "./payment-modal"
import type { Campaign } from "@/lib/db"

export default function AILauncher() {
  const [open, setOpen] = useState(false)
  // Payment modal wiring for AI-triggered donations
  const [payOpen, setPayOpen] = useState(false)
  const [payCampaign, setPayCampaign] = useState<Campaign | null>(null)
  const [payInitialAmount, setPayInitialAmount] = useState<number | undefined>(undefined)
  const [payInitialChain, setPayInitialChain] = useState<string | undefined>(undefined)
  const [payAutoSubmit, setPayAutoSubmit] = useState(false)

  return (
    <>
      {/* Floating launcher button bottom-right */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-[60] h-12 w-12 rounded-full bg-black text-blue-500 ring-1 ring-blue-500 shadow-xl hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-400 inline-flex items-center justify-center"
        aria-label="Open GiveHub AI"
        title="Open GiveHub AI"
      >
        <span className="text-2xl leading-none">✦</span>
      </button>

      {/* Overlay */}
      <AIOverlay
        open={open}
        onClose={() => setOpen(false)}
        onAction={async (action) => {
          if (action.type !== "open_payment") return
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
            setPayAutoSubmit(Boolean(action.confirm))
            setPayOpen(true)
          } catch (e) {
            console.error("[AI] open_payment wiring failed:", e)
          }
        }}
      />

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
          autoSubmit={payAutoSubmit}
        />
      )}
    </>
  )
}
