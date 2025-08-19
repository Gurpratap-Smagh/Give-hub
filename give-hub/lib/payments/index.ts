// lib/payments/index.ts
// Simple payment adapter to keep payment logic swappable (e.g., for ZetaChain)
// Default: mock REST endpoint at /api/payments

import { donateToCampaign, connectWallet, ensureWalletOnChain, getCampaignInfo, fetchDeployment, getProvider, getContract } from '@/lib/web3/client'
import { ethers } from 'ethers'
import { CrossChainCrowdfundABI } from '@/lib/web3/abi/GiveHubCrowdfund'

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

export type ProcessDonationInput = {
  campaignId: string
  amount: number
  chain: string
  donorName: string
  note?: string
  /** Off-chain campaign id for recording donations after on-chain tx (required for zetachain) */
  offchainCampaignId?: string
}

export type ProcessDonationResult = {
  ok: boolean
  txId?: string
  receiptUrl?: string
  error?: string
  paymentStatus?: 'preferred' | 'WZETA'
  swapMessage?: string
}

// Best-effort extraction of Ethers v6 custom error name without using `any`
function extractErrorName(err: unknown): string | undefined {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    if (typeof e.errorName === 'string') return e.errorName
    const data = e.data
    if (data && typeof data === 'object' && typeof (data as Record<string, unknown>).errorName === 'string') {
      return (data as Record<string, unknown>).errorName as string
    }
    const info = e.info
    if (info && typeof info === 'object') {
      const inf = info as Record<string, unknown>
      const nestedErr = inf.error
      if (nestedErr && typeof nestedErr === 'object' && typeof (nestedErr as Record<string, unknown>).errorName === 'string') {
        return (nestedErr as Record<string, unknown>).errorName as string
      }
      // Try decode from nested revert data
      const nestedData = (inf.error as Record<string, unknown> | undefined)?.data
      const hex = typeof nestedData === 'string' ? nestedData :
        (nestedData && typeof nestedData === 'object' && typeof (nestedData as Record<string, unknown>).data === 'string'
          ? (nestedData as Record<string, unknown>).data as string : undefined)
      if (hex && hex.startsWith('0x')) {
        try {
          const iface = new ethers.Interface(CrossChainCrowdfundABI)
          const parsed = iface.parseError(hex)
          if (parsed?.name) return parsed.name
        } catch {}
      }
    }
    // Try top-level revert data
    const topHex = typeof e.data === 'string' ? e.data :
      (e.data && typeof e.data === 'object' && typeof (e.data as Record<string, unknown>).data === 'string'
        ? (e.data as Record<string, unknown>).data as string : undefined)
    if (topHex && topHex.startsWith('0x')) {
      try {
        const iface = new ethers.Interface(CrossChainCrowdfundABI)
        const parsed = iface.parseError(topHex)
        if (parsed?.name) return parsed.name
      } catch {}
    }
  }
  return undefined
}

// Provider selection via env (future: 'zetachain', 'stripe', etc.)
// Default to 'local' to avoid server API writes; stores donations in localStorage
const PROVIDER = (process.env.NEXT_PUBLIC_PAYMENT_PROVIDER || 'local').toLowerCase()

function genTxId(prefix = 'tx') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

async function processWithLocal(input: ProcessDonationInput): Promise<ProcessDonationResult> {
  try {
    if (typeof window === 'undefined') {
      // SSR safeguard: shouldn't be called server-side
      return { ok: false, error: 'Local payments unavailable on server' }
    }
    const key = 'gh_donations'
    const raw = window.localStorage.getItem(key)
    let list: Array<{ campaignId: string; name: string; amount: number; chain: string; timestamp: string; address?: string; note?: string }>
    try {
      list = raw ? JSON.parse(raw) : []
      if (!Array.isArray(list)) list = []
    } catch {
      list = []
    }
    // Best-effort read of currently connected wallet without prompting the user
    let addr: string | undefined
    try {
      const accounts = await window.ethereum?.request({ method: 'eth_accounts' }) as string[] | undefined
      if (accounts && accounts.length > 0) addr = accounts[0]
    } catch {}
    const entry = {
      campaignId: input.campaignId,
      name: input.donorName,
      amount: input.amount,
      chain: input.chain,
      timestamp: new Date().toISOString(),
      address: addr,
      note: input.note,
    }
    list.push(entry)
    window.localStorage.setItem(key, JSON.stringify(list))
    return { ok: true, txId: genTxId('local') }
  } catch (e) {
    console.error('Local payment error:', e)
    return { ok: false, error: 'Failed to save local donation' }
  }
}

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

// ZetaChain provider implementation for on-chain donations
async function processWithZetaChain(input: ProcessDonationInput): Promise<ProcessDonationResult> {
  try {
    // Basic validation
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return { ok: false, error: 'Enter a positive amount' }
    }

    // Step 1: Connect wallet and ensure correct network
    const { chainId } = await connectWallet()
    const targetChainId = parseInt(process.env.NEXT_PUBLIC_ZETA_CHAIN_ID || '7001')
    
    if (chainId !== targetChainId) {
      await ensureWalletOnChain(targetChainId)
    }
    
    // Step 2: Validate campaign exists and is active on-chain to avoid revert
    // For CrossChainCrowdfund, we need the campaign's on-chain ID
    // The campaignId from input should be the on-chain campaign ID
    const campaignOnChainId = BigInt(input.campaignId)
    try {
      const info = await getCampaignInfo(campaignOnChainId)
      console.debug('[donation] campaign info', info)
      if (!info || !info.creator || info.creator.toLowerCase() === '0x0000000000000000000000000000000000000000') {
        return { ok: false, error: 'Invalid campaign on-chain (not found). Please refresh or contact the creator.' }
      }
      if (!info.active) {
        return { ok: false, error: 'This campaign is inactive on-chain.' }
      }

      // Local preflight: ensure Zeta infra exists when running on localhost (31337)
      try {
        const dep = await fetchDeployment()
        const provider = await getProvider()
        const depRec = dep as Record<string, unknown>
        const sysContracts = (depRec.systemContracts as Record<string, unknown> | undefined) || undefined
        const envWzeta = process.env.NEXT_PUBLIC_WZETA_ADDRESS
        const envSys = process.env.NEXT_PUBLIC_SYSTEM_CONTRACT_ADDRESS
        const wzeta = (depRec.wzeta as string | undefined) || (sysContracts?.wzeta as string | undefined) || envWzeta
        const sys = (depRec.systemContract as string | undefined) || (sysContracts?.systemContract as string | undefined) || envSys
        console.debug('[donation] deployment preflight', { chainId: dep?.chainId, contract: dep?.address, wzeta, systemContract: sys })
        // Verify the actual ZETA token the contract uses exists on-chain
        try {
          const contract = await getContract()
          const actualZeta = await (contract as unknown as { ZETA_TOKEN: () => Promise<string> }).ZETA_TOKEN()
          const zetaCode = await provider.getCode(actualZeta)
          if (!zetaCode || zetaCode === '0x' || zetaCode === '0x00') {
            return { ok: false, error: `Contract ZETA_TOKEN ${actualZeta} is not deployed on this chain. Redeploy with a valid WZETA or switch NEXT_PUBLIC_PAYMENT_PROVIDER=local.` }
          }
          if (wzeta && actualZeta.toLowerCase() !== wzeta.toLowerCase()) {
            console.warn('[donation] ZETA mismatch: contract uses', actualZeta, 'but deployment shows', wzeta)
          }
        } catch (zerr) {
          console.warn('[donation] failed to read ZETA_TOKEN from contract', zerr)
        }
        if (wzeta && /^0x[a-fA-F0-9]{40}$/.test(wzeta)) {
          const code = await provider.getCode(wzeta)
          if (!code || code === '0x' || code === '0x00') {
            return { ok: false, error: 'Zeta WZETA token is not deployed on this chain. For local dev, run Zeta mocks or switch NEXT_PUBLIC_PAYMENT_PROVIDER=local.' }
          }
        }
        // If preferred token differs from WZETA, swap path needs SystemContract
        if (wzeta && info.preferredZRC20 && wzeta.toLowerCase() !== info.preferredZRC20.toLowerCase()) {
          if (sys && /^0x[a-fA-F0-9]{40}$/.test(sys)) {
            const sysCode = await provider.getCode(sys)
            if (!sysCode || sysCode === '0x' || sysCode === '0x00') {
              return { ok: false, error: 'Zeta SystemContract is not deployed; token swap cannot occur on this chain. Use WZETA as preferred token or run Zeta mocks.' }
            }
          } else {
            return { ok: false, error: 'Zeta SystemContract address is missing; swap cannot occur on this chain. Use WZETA or run Zeta mocks.' }
          }
        }
      } catch (preErr) {
        console.warn('[donation] preflight check failed (continuing):', preErr)
      }
    } catch (e) {
      // If we cannot read, proceed but surface a clearer failure later
      console.warn('Failed to prefetch campaign info; continuing to donation...', e)
    }
    
    // Step 3: Call donation function
    let txHash: string
    try {
      txHash = await donateToCampaign(
        campaignOnChainId,
        input.amount.toString(),
        input.donorName,
        input.note || `Donation from ${input.donorName} via GiveHub`
      )
    } catch (err: unknown) {
      const anyErr = err as { code?: number; message?: string; shortMessage?: string }
      const msg = (anyErr.shortMessage || anyErr.message || '').toLowerCase()
      const errName = extractErrorName(err)
      if (errName === 'InvalidCampaign') {
        return { ok: false, error: 'Invalid campaign on-chain (not found).' }
      }
      if (errName === 'CampaignInactive') {
        return { ok: false, error: 'This campaign is inactive on-chain.' }
      }
      if (errName === 'ZeroAmount') {
        return { ok: false, error: 'Zero amount specified; enter a positive amount.' }
      }
      if (errName === 'SwapFailed') {
        return { ok: false, error: 'Swap failed on-chain. Ensure Zeta SystemContract and token pool exist or set preferred token to WZETA.' }
      }
      if (errName === 'InvalidToken') {
        return { ok: false, error: 'Invalid token configured for this campaign. Use a valid ZRC-20 or WZETA on this network.' }
      }
      if (anyErr?.code === 4001 || /user rejected|rejected the request|request rejected|denied/i.test(msg)) {
        return { ok: false, error: 'User cancelled the transaction' }
      }
      if (/insufficient funds/i.test(msg)) {
        return { ok: false, error: 'Insufficient funds for gas or value' }
      }
      if (/execution reverted|call exception|bad data|decode/i.test(msg)) {
        return { ok: false, error: 'Transaction failed on-chain (possibly invalid or inactive campaign).' }
      }
      return { ok: false, error: anyErr.shortMessage || anyErr.message || 'On-chain donation failed' }
    }
    
    // Step 4: Wait for transaction receipt and decode events
    let receiptUrl: string | undefined
    let paymentStatus: 'preferred' | 'WZETA' = 'WZETA' // default fallback
    let swapMessage = ''
    
    try {
      const provider = await getProvider()
      const receipt = await provider.waitForTransaction(txHash)
      
      // Decode swap events to determine payment outcome
      const iface = new ethers.Interface(CrossChainCrowdfundABI)
      for (const log of receipt?.logs ?? []) {
        try {
          const decoded = iface.parseLog({ topics: log.topics, data: log.data })
          if (decoded?.name === 'SwapExecuted') {
            paymentStatus = 'preferred'
            swapMessage = 'Paid in preferred token'
            break
          }
          if (decoded?.name === 'PaidInWZETA') {
            paymentStatus = 'WZETA'
            swapMessage = 'Swap unavailable, paid in WZETA (fallback used)'
            break
          }
        } catch {
          // Skip logs that don't match our ABI
        }
      }
    } catch (receiptErr) {
      console.warn('Could not decode transaction receipt:', receiptErr)
      // Continue with default values
    }
    
    const explorerUrl = process.env.NEXT_PUBLIC_ZETA_EXPLORER_URL
    if (explorerUrl) {
      receiptUrl = `${explorerUrl}/tx/${txHash}`
    }
    // Step 5: Persist donation off-chain
    const offId = input.offchainCampaignId
    if (!offId) {
      throw new Error('Missing off-chain campaign id for recording donation')
    }
    const resp = await fetch(`/api/campaigns/${offId}/donations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: input.amount,
        chain: input.chain,
        donorName: input.donorName,
        note: input.note,
        txId: txHash,
      }),
    })
    if (!resp.ok) {
      let msg = 'Failed to persist donation'
      try {
        const j = await resp.json()
        msg = j?.error || j?.message || msg
      } catch {}
      return { ok: false, error: msg }
    }
    
    return {
      ok: true,
      txId: txHash,
      receiptUrl,
      paymentStatus,
      swapMessage,
    }
    
  } catch (error: unknown) {
    console.error('ZetaChain donation error:', error)
    const errorMsg = (error as Error).message || 'On-chain donation failed'
    return { 
      ok: false, 
      error: errorMsg 
    }
  }
}

export async function processDonation(input: ProcessDonationInput): Promise<ProcessDonationResult> {
  switch (PROVIDER) {
    case 'zetachain':
      return processWithZetaChain(input)
    case 'local':
      return processWithLocal(input)
    case 'mock':
    default:
      return processWithMock(input)
  }
}
