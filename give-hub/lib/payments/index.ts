// lib/payments/index.ts
// Simple payment adapter to keep payment logic swappable (e.g., for ZetaChain)
// Default: mock REST endpoint at /api/payments

export type ProcessDonationInput = {
  campaignId: string
  amount: number
  chain: string
  donorName: string
}

export type ProcessDonationResult = {
  ok: boolean
  txId?: string
  receiptUrl?: string
  error?: string
}

// Provider selection via env (future: 'zetachain', 'stripe', etc.)
const PROVIDER = (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER || 'mock').toLowerCase()

async function processWithMock(input: ProcessDonationInput): Promise<ProcessDonationResult> {
  const res = await fetch('/api/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    let msg = 'Payment failed'
    try {
      const j = await res.json()
      msg = j?.error || j?.message || msg
    } catch {}
    return { ok: false, error: msg }
  }
  let txId: string | undefined
  let receiptUrl: string | undefined
  try {
    const j = await res.json()
    txId = j?.txId
    receiptUrl = j?.receiptUrl
  } catch {}
  return { ok: true, txId, receiptUrl }
}

// Placeholder for ZetaChain provider; to be implemented when integrating
async function processWithZetaChain(_input: ProcessDonationInput): Promise<ProcessDonationResult> {
  // Reference the argument to satisfy no-unused-vars lint until implemented
  void _input
  return { ok: false, error: 'ZetaChain payments not yet implemented' }
}

export async function processDonation(input: ProcessDonationInput): Promise<ProcessDonationResult> {
  switch (PROVIDER) {
    case 'zetachain':
      return processWithZetaChain(input)
    case 'mock':
    default:
      return processWithMock(input)
  }
}
