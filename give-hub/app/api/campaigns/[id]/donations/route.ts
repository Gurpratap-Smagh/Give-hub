import { NextRequest, NextResponse } from 'next/server'
import { mongoDb as db } from '../../../../../lib/mongodb/database'
import { toUSD } from '../../../../../lib/prices/converter'
import { CampaignModel } from '../../../../../lib/mongodb/models/campaign'

/**
 * GET /api/campaigns/[id]/donations
 * Fetch donations for a specific campaign
 * 
 * MIGRATION NOTES:
 * 1. MongoDB: Replace db.getDonationsByCampaign() with MongoDB aggregation
 * 2. Smart Contract: Query blockchain for donation transactions
 * 3. AI: Add donation analytics and insights
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params

    // Resolve campaignId: allow either DB id (campaign_...) or on-chain numeric id
    let resolvedId = rawId
    let campaign = await db.findCampaignById(resolvedId)
    if (!campaign) {
      // Ensure DB connection via previous call; then try on-chain mapping
      const envChainId = process.env.NEXT_PUBLIC_ZETA_CHAIN_ID ? Number(process.env.NEXT_PUBLIC_ZETA_CHAIN_ID) : undefined
      const envContract = process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT || process.env.NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS
      const onChainQuery: Record<string, string | number> = { 'onChain.campaignId': String(rawId) }
      if (!Number.isNaN(envChainId)) onChainQuery['onChain.chainId'] = Number(envChainId)
      if (envContract) onChainQuery['onChain.contract'] = envContract

      const found = await CampaignModel.findOne(onChainQuery).lean<{ id: string } | null>()
      if (found) {
        resolvedId = found.id
        campaign = await db.findCampaignById(resolvedId)
      } else if (/^\d+$/.test(rawId)) {
        const legacy = await CampaignModel.findOne({ onchainId: Number(rawId) }).lean<{ id: string } | null>()
        if (legacy) {
          resolvedId = legacy.id
          campaign = await db.findCampaignById(resolvedId)
        }
      }
    }

    // Validate campaign exists after resolution
    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      )
    }

    // Fetch donations for this campaign
    const donations = await db.getDonationsByCampaign(resolvedId)

    return NextResponse.json(donations)

  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/campaigns/[id]/donations
 * Record a donation for a specific campaign and update campaign totals
 *
 * Body: { amount: number, chain: string, donorName: string, tokenSymbol?: string, txId?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params
    const body = await request.json()
    const amount: number = body.amount
    const rawChain: string = body.chain
    const donorName: string = body.donorName ?? body.name
    const tokenSymbol: string = body.tokenSymbol || 'USD'
    const txId: string | undefined = body.txId
    const timestamp: Date | undefined = body.timestamp ? new Date(body.timestamp) : undefined

    // Normalize chain names for consistency
    const chainMapping: Record<string, string> = {
      'ethereum sepolia': 'Ethereum Sepolia',
      'sepolia': 'Ethereum Sepolia',
      'zetachain': 'ZetaChain',
      'zeta': 'ZetaChain',
      'local': 'Local'
    }
    const chain = chainMapping[rawChain.toLowerCase()] || rawChain

    // Basic validation
    if (!rawId) {
      return NextResponse.json(
        { error: 'Missing campaign id' },
        { status: 400 }
      )
    }
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount' },
        { status: 400 }
      )
    }
    if (typeof chain !== 'string' || !chain) {
      return NextResponse.json(
        { error: 'Invalid chain' },
        { status: 400 }
      )
    }
    if (typeof donorName !== 'string' || !donorName.trim()) {
      return NextResponse.json(
        { error: 'Invalid donorName' },
        { status: 400 }
      )
    }

    // Resolve and find campaign (supports DB id or on-chain numeric id)
    let resolvedId = rawId
    let campaign = await db.findCampaignById(resolvedId)
    if (!campaign) {
      const envChainId = process.env.NEXT_PUBLIC_ZETA_CHAIN_ID ? Number(process.env.NEXT_PUBLIC_ZETA_CHAIN_ID) : undefined
      const envContract = process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT || process.env.NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS
      const onChainQuery: Record<string, string | number> = { 'onChain.campaignId': String(rawId) }
      if (!Number.isNaN(envChainId)) onChainQuery['onChain.chainId'] = Number(envChainId)
      if (envContract) onChainQuery['onChain.contract'] = envContract
      const found = await CampaignModel.findOne(onChainQuery).lean<{ id: string } | null>()
      if (found) {
        resolvedId = found.id
        campaign = await db.findCampaignById(resolvedId)
      } else if (/^\d+$/.test(rawId)) {
        const legacy = await CampaignModel.findOne({ onchainId: Number(rawId) }).lean<{ id: string } | null>()
        if (legacy) {
          resolvedId = legacy.id
          campaign = await db.findCampaignById(resolvedId)
        }
      }
    }
    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      )
    }

    // Dev logging to surface on-chain mapping and linkage
    if (process.env.NODE_ENV === 'development') {
      console.debug('[donations] Incoming donation', {
        rawId,
        resolvedId,
        amount,
        chain,
        donorName,
        hasOnChain: !!campaign.onChain,
        onchainId: campaign.onChain?.campaignId ?? null,
      })
      if (chain.toLowerCase().includes('zeta') && !campaign.onChain) {
        console.warn('[donations] Donation on Zeta-like chain but campaign lacks onChain mapping. Verify creation persisted onChain.campaignId and onchainId for campaign', resolvedId)
      }
    }

    // Check if campaign supports the selected chain when defined
    const supportedChains: string[] = Array.isArray(campaign.chains) ? campaign.chains : []
    if (supportedChains.length > 0 && !supportedChains.includes(chain)) {
      return NextResponse.json(
        { error: `Campaign does not support ${chain} payments` },
        { status: 400 }
      )
    }

    // Convert token amount to USD value using price table (skip if already USD)
    const usdValue = tokenSymbol === 'USD' ? amount : toUSD(amount, tokenSymbol)

    // Build donation document for embedded array
    const effectiveTimestamp: Date = timestamp ?? new Date()
    const donationDoc = {
      name: donorName,
      amount,
      chain,
      timestamp: effectiveTimestamp,
      ...(txId ? { txHash: txId } : {}),
    }

    let incremented = false

    if (txId && typeof txId === 'string') {
      // Atomically push donation and increment raised only if there is no existing element with this txHash
      const res = await CampaignModel.updateOne(
        { id: resolvedId, donations: { $not: { $elemMatch: { txHash: txId } } } },
        {
          $push: { donations: donationDoc },
          $inc: { raised: usdValue },
          $set: { updatedAt: new Date() },
        }
      )
      incremented = (res.modifiedCount || 0) > 0
    } else {
      // No txId provided: fallback to create then increment (non-idempotent)
      await db.createDonation({
        campaignId: resolvedId,
        name: donorName,
        amount,
        chain,
        timestamp,
      })
      const updated = await db.incrementCampaignRaised(resolvedId, usdValue)
      incremented = !!updated
    }

    // Update creator stats only if the campaign total was incremented
    if (incremented) {
      const creator = await db.findUserById(campaign.creatorId)
      if (creator && creator.role === 'creator') {
        const currentRaised = ('totalRaised' in creator && typeof creator.totalRaised === 'number')
          ? creator.totalRaised
          : 0
        await db.updateUser(creator.id, { totalRaised: currentRaised + usdValue })
      }
    }

    // Fetch current campaign state for response
    const finalCampaign = await db.findCampaignById(resolvedId)
    if (!finalCampaign) {
      return NextResponse.json(
        { error: 'Failed to load campaign' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      duplicate: txId ? !incremented : false,
      donation: {
        id: txId || `tx_${Date.now()}`,
        campaignId: resolvedId,
        amount,
        chain,
        donorName,
        timestamp: effectiveTimestamp,
      },
      campaign: {
        id: finalCampaign.id,
        raised: finalCampaign.raised,
        goal: finalCampaign.goal,
        progress: (finalCampaign.goal > 0)
          ? (finalCampaign.raised / finalCampaign.goal) * 100
          : 0,
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
