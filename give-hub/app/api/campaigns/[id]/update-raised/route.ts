import { NextRequest, NextResponse } from 'next/server'
import { CampaignModel } from '../../../../../lib/mongodb/models/campaign'
import { connectDb } from '../../../../../lib/mongodb/database'

interface CampaignData {
  goal: number;
  raised: number;
  donations?: any[];
  [key: string]: any;
}

function normalizeCampaign(campaign: CampaignData) {
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

    // Connect to database
    await connectDb()

    // Use atomic $inc operation for thread-safe raised amount update
    const updatedCampaign = await CampaignModel.findOneAndUpdate(
      { id: id },
      { 
        $inc: { raised: amount },
        $set: { updatedAt: new Date() }
      },
      { new: true, runValidators: true }
    )

    if (!updatedCampaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Return campaign data
    return NextResponse.json({
      success: true,
      campaign: normalizeCampaign(updatedCampaign.toObject()),
      newTotal: updatedCampaign.raised,
      newTotalDisplay: updatedCampaign.raised,
    })
  } catch (error) {
    console.error('[UpdateRaised] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
