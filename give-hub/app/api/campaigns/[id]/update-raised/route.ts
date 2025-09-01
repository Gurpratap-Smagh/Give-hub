import { NextRequest, NextResponse } from 'next/server'
import { mongoDb as db } from '../../../../../lib/mongodb/database'
import type { Campaign } from '@/lib/db'

function normalizeCampaign(campaign: Campaign) {
  const goal = Number(campaign.goal || 0)
  const raised = Number(campaign.raised || 0)
  const progressPct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0
  const donors = Array.isArray(campaign.donations) ? campaign.donations.length : 0
  return { ...campaign, goal, raised, progressPct, donors }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params
    const body = await request.json()
    const { amount } = body

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Invalid donation amount' }, { status: 400 })
    }
    // Get current campaign
    const campaign = await db.findCampaignById(id)
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Update raised amount - store as number in same units used across app
    const currentRaised = campaign.raised || 0
    const updatedCampaign = await db.updateCampaign(id, {
      raised: currentRaised + amount
    })

    if (!updatedCampaign) {
      return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
    }

    // Return campaign data
    return NextResponse.json({
      success: true,
      campaign: normalizeCampaign(updatedCampaign),
      newTotal: updatedCampaign.raised,
      newTotalDisplay: updatedCampaign.raised,
    })
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
