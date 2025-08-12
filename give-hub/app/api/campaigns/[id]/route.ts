/**
 * FILE: app/api/campaigns/[id]/route.ts
 * PURPOSE: Server API to fetch a single campaign (and its donations) from the JSON mock DB
 * ACCESS: GET /api/campaigns/:id
 * NOTE: This runs on the server, so it's safe to use the JSON mock DB (fs/path)
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/mock-db/database'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const campaign = db.findCampaignById(id)
    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 })
    }

    const donations = db.getDonationsByCampaign(id)

    return NextResponse.json({
      success: true,
      campaign,
      donations
    })
  } catch (error) {
    console.error('GET /api/campaigns/[id] error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
