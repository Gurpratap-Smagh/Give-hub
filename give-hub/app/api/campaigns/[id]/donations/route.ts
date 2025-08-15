import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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

  } catch (error) {
    console.error('Error fetching campaign donations:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
