import { NextResponse } from 'next/server'

/**
 * GET /api/web3/deployment
 * Returns contract deployment info for client-side blockchain interactions
 * Public endpoint - no authentication required
 */
export async function GET() {
  try {
    // Use primary env vars
    const address = process.env.NEXT_PUBLIC_CROWDFUND_ADDRESS || process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT
    const chainId = process.env.NEXT_PUBLIC_ZETA_CHAIN_ID || process.env.NEXT_PUBLIC_CHAIN_ID
    const wzeta = process.env.NEXT_PUBLIC_WZETA_ADDRESS || process.env.NEXT_PUBLIC_WZETA
    const systemContract = process.env.NEXT_PUBLIC_SYSTEM_CONTRACT_ADDRESS
    const rpcUrl = process.env.NEXT_PUBLIC_ZETA_RPC_URL
    const gatewayZeta = process.env.NEXT_PUBLIC_GATEWAY_ZETA

    if (!address || !chainId) {
      return NextResponse.json(
        { error: 'Missing required deployment configuration: NEXT_PUBLIC_CROWDFUND_ADDRESS and NEXT_PUBLIC_ZETA_CHAIN_ID' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      address,
      chainId: Number(chainId),
      wzeta,
      systemContract,
      rpcUrl,
      gatewayZeta,
    })
  } catch (error) {
    console.error('[deployment] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch deployment info' },
      { status: 500 }
    )
  }
}
