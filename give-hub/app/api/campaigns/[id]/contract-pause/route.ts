import { NextRequest, NextResponse } from 'next/server'
import { authService } from '@/lib/auth/auth'
import { db } from '@/lib/db'
import { ethers } from 'ethers'
import CrossChainCrowdfundABI from '@/abis/CrossChainCrowdfund.json'
import { getServerDeployment, getServerProvider } from '@/lib/web3/server'
import { toBigInt, toBoolean } from '@/lib/utils/contract-coercion'

// POST /api/campaigns/[id]/contract-pause
// Body: { campaignId: string | number, pause: boolean }
// Requires: auth-token cookie (creator must own the campaign)
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // 1) Auth
    const token = request.cookies.get('auth-token')?.value
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const authResult = await authService.verifyToken(token)
    if (!authResult.success || !authResult.userId) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 })
    }

    const user = await db.findUserById(authResult.userId)
    if (!user || user.role !== 'creator') {
      return NextResponse.json({ success: false, error: 'Only creators can manage campaigns' }, { status: 403 })
    }

    // 2) Ownership check
    const { id: campaignIdParam } = await context.params
    const campaign = await db.findCampaignById(campaignIdParam)
    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 })
    }
    if (campaign.creatorId !== user.id) {
      return NextResponse.json({ success: false, error: 'You can only manage your own campaigns' }, { status: 403 })
    }

    // 3) Parse body
    const body = await request.json().catch(() => ({})) as { campaignId?: unknown; pause?: unknown }
    const inputCampaignId = body?.campaignId
    const pauseInput = body?.pause
    
    // Use coercion utility to ensure boolean type
    const pause = toBoolean(pauseInput)
    
    // Still validate the input was provided (not undefined/null)
    if (pauseInput === undefined || pauseInput === null) {
      return NextResponse.json({ success: false, error: 'pause must be provided as a boolean' }, { status: 400 })
    }

    // Validate on-chain campaignId using coercion utility
    if (inputCampaignId === undefined || inputCampaignId === null) {
      return NextResponse.json({ success: false, error: 'campaignId is required' }, { status: 400 })
    }
    
    // Use coercion utility to safely convert to BigInt
    let onChainCampaignId: bigint
    try {
      // Convert the unknown input to string first to ensure compatibility
      const campaignIdStr = String(inputCampaignId)
      onChainCampaignId = toBigInt(campaignIdStr)
      if (onChainCampaignId === 0n) {
        throw new Error('Invalid campaign ID')
      }
    } catch {
      return NextResponse.json({ success: false, error: 'campaignId must be a valid integer' }, { status: 400 })
    }

    // Optional: ensure provided on-chain id matches stored mapping when present
    if (campaign.onChain?.campaignId && String(campaign.onChain.campaignId) !== String(inputCampaignId)) {
      return NextResponse.json({ success: false, error: 'Mismatched on-chain campaignId' }, { status: 400 })
    }

    // 4) Setup signer using server-side private key and provider
    const { address: contractAddress } = await getServerDeployment()
    if (!contractAddress) {
      return NextResponse.json({ success: false, error: 'Contract address not configured' }, { status: 500 })
    }

    const provider = await getServerProvider()

    const privateKey =
      process.env.SERVER_WALLET_PRIVATE_KEY ||
      process.env.ADMIN_PRIVATE_KEY ||
      process.env.SIGNER_PRIVATE_KEY ||
      ''

    if (!privateKey || !privateKey.trim()) {
      return NextResponse.json({ success: false, error: 'Server signer not configured' }, { status: 500 })
    }

    const wallet = new ethers.Wallet(privateKey, provider)
    const contract = new ethers.Contract(contractAddress, CrossChainCrowdfundABI, wallet)

    // 5) Execute transaction
    try {
      const tx = pause
        ? await contract.pauseCampaign(onChainCampaignId)
        : await contract.resumeCampaign(onChainCampaignId)

      const receipt = await tx.wait()

      return NextResponse.json({
        success: true,
        action: pause ? 'paused' : 'resumed',
        txHash: tx.hash,
        blockNumber: receipt?.blockNumber ?? null,
      })
    } catch (chainError: unknown) {
      // Try to surface a readable error message
      const errorObj = chainError as { reason?: string; error?: { message?: string }; message?: string }
      const message = errorObj?.reason || errorObj?.error?.message || errorObj?.message || 'Blockchain transaction failed'
      console.error('Contract pause/resume error:', chainError)
      return NextResponse.json({ success: false, error: message }, { status: 500 })
    }
  } catch (error) {
    console.error('POST /api/campaigns/[id]/contract-pause error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
