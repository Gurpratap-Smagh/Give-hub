import { NextRequest, NextResponse } from 'next/server'
import { mongoDb as db } from '../../../../../lib/mongodb/database'

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
    const { id: campaignId } = await params

    // Validate campaign exists
    const campaign = await db.findCampaignById(campaignId)
    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      )
    }

    // Fetch donations for this campaign
    const donations = await db.getDonationsByCampaign(campaignId)

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
 * Body: { amount: number, chain: string, donorName: string, txId?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params
    const body = await request.json()
    const amount: number = body.amount
    const chain: string = body.chain
    const donorName: string = body.donorName ?? body.name
    const txId: string | undefined = body.txId
    const timestamp: Date | undefined = body.timestamp ? new Date(body.timestamp) : undefined

    // Basic validation
    if (!campaignId) {
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

    // Find campaign
    const campaign = await db.findCampaignById(campaignId)
    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      )
    }

    // Check if campaign supports the selected chain when defined
    const supportedChains: string[] = Array.isArray(campaign.chains) ? campaign.chains : []
    if (supportedChains.length > 0 && !supportedChains.includes(chain)) {
      return NextResponse.json(
        { error: `Campaign does not support ${chain} payments` },
        { status: 400 }
      )
    }

    // Create donation record
    const donation = await db.createDonation({
      campaignId,
      name: donorName,
      amount,
      chain,
      // timestamp is set by adapter if omitted
      timestamp,
    })

    // Update campaign raised amount (allow exceeding goal)
    const newTotal = (campaign.raised || 0) + amount
    const updatedCampaign = await db.updateCampaign(campaignId, { raised: newTotal })
    if (!updatedCampaign) {
      return NextResponse.json(
        { error: 'Failed to update campaign totals' },
        { status: 500 }
      )
    }

    // Optional: update creator stats when applicable
    const creator = await db.findUserById(campaign.creatorId)
    if (creator && creator.role === 'creator') {
      const currentRaised = ('totalRaised' in creator && typeof creator.totalRaised === 'number')
        ? creator.totalRaised
        : 0
      await db.updateUser(creator.id, { totalRaised: currentRaised + amount })
    }

    return NextResponse.json({
      success: true,
      donation: {
        id: txId || `tx_${Date.now()}`,
        campaignId,
        amount,
        chain,
        donorName,
        timestamp: donation.timestamp,
      },
      campaign: {
        id: updatedCampaign.id,
        raised: updatedCampaign.raised,
        goal: updatedCampaign.goal,
        progress: (updatedCampaign.goal > 0)
          ? (updatedCampaign.raised / updatedCampaign.goal) * 100
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
