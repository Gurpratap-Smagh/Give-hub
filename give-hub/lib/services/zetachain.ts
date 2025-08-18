import { ethers } from 'ethers'
import path from 'path'
import fs from 'fs'

// Minimal ABI with events we index; avoids requiring build artifacts at runtime
export const GIVEHUB_ABI = [
  {
    type: 'event',
    name: 'CampaignCreated',
    inputs: [
      { name: 'campaignId', type: 'uint256', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'title', type: 'string', indexed: false },
      { name: 'category', type: 'string', indexed: false },
      { name: 'preferredZRC20', type: 'address', indexed: false },
      { name: 'goal', type: 'uint256', indexed: false },
      { name: 'deadline', type: 'uint64', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'DonationReceived',
    inputs: [
      { name: 'donationId', type: 'uint256', indexed: true },
      { name: 'campaignId', type: 'uint256', indexed: true },
      { name: 'donor', type: 'address', indexed: true },
      { name: 'originalToken', type: 'address', indexed: false },
      { name: 'originalAmount', type: 'uint256', indexed: false },
      { name: 'convertedAmount', type: 'uint256', indexed: false },
      { name: 'originChain', type: 'string', indexed: false },
      { name: 'donorName', type: 'string', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'CampaignUpdated',
    inputs: [
      { name: 'campaignId', type: 'uint256', indexed: true },
      { name: 'title', type: 'string', indexed: false },
      { name: 'description', type: 'string', indexed: false },
      { name: 'active', type: 'bool', indexed: false },
    ],
    anonymous: false,
  },
]

export function getContractAddress(): string | null {
  // Prefer env
  const viaEnv = process.env.GIVEHUB_CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS
  if (viaEnv && /^0x[a-fA-F0-9]{40}$/.test(viaEnv)) return viaEnv

  // Attempt reading contracts/deployments/latest.json
  try {
    const p = path.join(process.cwd(), '..', 'contracts', 'deployments', 'latest.json')
    const raw = fs.readFileSync(p, 'utf-8')
    const j = JSON.parse(raw)
    if (j?.address && /^0x[a-fA-F0-9]{40}$/.test(j.address)) return j.address
  } catch {}

  return null
}

export function getStartBlock(): number | undefined {
  const v = process.env.GIVEHUB_START_BLOCK
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined
}

export function getProvider(): ethers.Provider {
  const url = process.env.ZETA_RPC_URL || process.env.NEXT_PUBLIC_ZETA_RPC_URL
  if (!url) throw new Error('ZETA_RPC_URL is not set')
  return new ethers.JsonRpcProvider(url)
}

export function getContract(): { contract: ethers.Contract, address: string, iface: ethers.Interface } {
  const address = getContractAddress()
  if (!address) throw new Error('GiveHub contract address not configured')
  const provider = getProvider()
  const iface = new ethers.Interface(GIVEHUB_ABI)
  const contract = new ethers.Contract(address, GIVEHUB_ABI, provider)
  return { contract, address, iface }
}
