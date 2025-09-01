/**
 * FILE: app/api/campaigns/[id]/route.ts
 * PURPOSE: Server API to fetch a single campaign (and its donations) from the JSON mock DB
 * ACCESS: GET /api/campaigns/:id
 * NOTE: This runs on the server, so it's safe to use the JSON mock DB (fs/path)
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { Campaign } from '@/lib/db'

// Ensure consistent computed fields
type CampaignDTO = Campaign & { progressPct: number; donors: number }
function normalizeCampaign(campaign: Campaign): CampaignDTO {
  const goal = Number(campaign.goal || 0)
  const raised = Number(campaign.raised || 0)
  const progressPct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0
  const donors = Array.isArray(campaign.donations) ? campaign.donations.length : 0
  return { ...campaign, goal, raised, progressPct, donors }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const campaign = await db.findCampaignById(id)
    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 })
    }

    const donations = await db.getDonationsByCampaign(id)

    return NextResponse.json({
      success: true,
      campaign: normalizeCampaign(campaign),
      donations
    })
  } catch (error) {
    console.error('GET /api/campaigns/[id] error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
