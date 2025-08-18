import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
    // Support both legacy and current env var names
    const addrFromEnv = process.env.NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_CROWDFUND_ADDRESS
    const chainFromEnv = process.env.NEXT_PUBLIC_ZETA_CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID
    const wzetaFromEnv = process.env.NEXT_PUBLIC_WZETA_ADDRESS || process.env.NEXT_PUBLIC_WZETA
    if (addrFromEnv && chainFromEnv && wzetaFromEnv) {
      return NextResponse.json({ address: addrFromEnv, chainId: Number(chainFromEnv), wzeta: wzetaFromEnv })
    }

    // Fallback: read from sibling contracts/deployments/latest.json
    // App cwd is give-hub/, so contracts is ../contracts
    const deploymentsPath = path.resolve(process.cwd(), '..', 'contracts', 'deployments', 'latest.json')
    if (!fs.existsSync(deploymentsPath)) {
      return NextResponse.json({ error: 'Deployment file not found. Set NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS (or NEXT_PUBLIC_CROWDFUND_ADDRESS), NEXT_PUBLIC_ZETA_CHAIN_ID (or NEXT_PUBLIC_CHAIN_ID) and NEXT_PUBLIC_WZETA_ADDRESS (or NEXT_PUBLIC_WZETA).' }, { status: 404 })
    }
    const raw = fs.readFileSync(deploymentsPath, 'utf8')
    const json = JSON.parse(raw)
    // Support both new (CrossChainCrowdfund) and legacy (GiveHubCrowdfund) keys
    const address: string | undefined =
      json?.contracts?.CrossChainCrowdfund?.address ||
      json?.contracts?.GiveHubCrowdfund?.address
    const chainIdRaw = json?.chainId
    const chainId = typeof chainIdRaw === 'string' ? Number(chainIdRaw) : Number(chainIdRaw)
    const wzeta: string | undefined = json?.systemContracts?.wzeta
    if (!address || !chainId || Number.isNaN(chainId)) {
      return NextResponse.json({ error: 'Invalid deployment file contents.' }, { status: 500 })
    }
    return NextResponse.json({ address, chainId, wzeta })
  } catch (e) {
    console.error('[api/web3/deployment] error', e)
    return NextResponse.json({ error: 'Failed to read deployment info' }, { status: 500 })
  }
}
