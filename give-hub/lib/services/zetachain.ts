import { ethers } from 'ethers'
import path from 'path'
import fs from 'fs'
import { CrossChainCrowdfundABI } from '@/lib/web3/abi/GiveHubCrowdfund'

// Use the exact deployed CrossChainCrowdfund ABI to ensure event topics/signatures match
export const GIVEHUB_ABI: ethers.InterfaceAbi = CrossChainCrowdfundABI as unknown as ethers.InterfaceAbi

// Lightweight provider wrapper that enforces a per-request timeout.
// Note: this does not cancel the underlying HTTP call, but prevents our code from waiting indefinitely.
class TimeoutJsonRpcProvider extends ethers.JsonRpcProvider {
  private readonly _timeoutMs: number
  constructor(url: string, timeoutMs: number) {
    super(url)
    this._timeoutMs = timeoutMs
  }

  // ethers v6 providers expose send(method, params)
  override send(method: string, params: Array<any>): Promise<any> {
    const p = super.send(method, params)
    if (!this._timeoutMs || this._timeoutMs <= 0) return p
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`rpc_timeout: ${method}`)), this._timeoutMs)
      p.then((v) => { clearTimeout(timer); resolve(v) })
       .catch((e) => { clearTimeout(timer); reject(e) })
    })
  }
}

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
  const timeoutMs = Number(process.env.RPC_TIMEOUT_MS || process.env.ZETA_RPC_TIMEOUT_MS || 12000)
  return new TimeoutJsonRpcProvider(url, timeoutMs)
}

export function getContract(): { contract: ethers.Contract, address: string, iface: ethers.Interface } {
  const address = getContractAddress()
  if (!address) throw new Error('GiveHub contract address not configured')
  const provider = getProvider()
  const iface = new ethers.Interface(GIVEHUB_ABI)
  const contract = new ethers.Contract(address, GIVEHUB_ABI, provider)
  return { contract, address, iface }
}
