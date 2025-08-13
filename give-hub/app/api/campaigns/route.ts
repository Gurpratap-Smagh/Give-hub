/**
 * FILE: app/api/campaigns/route.ts
 * PURPOSE: Server API to fetch list of campaigns from the JSON mock DB
 * ACCESS: GET /api/campaigns
 * NOTE: Keep interface stable for easy MongoDB swap
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/_dev/mock-db/database'
import type { User, Creator } from '@/_dev/mock-db/database'

export async function GET(req: NextRequest) {
  try {
    // Touch request to satisfy no-unused-vars lint without altering behavior
    void req.nextUrl;
    const campaigns = db.getAllCampaigns()
    return NextResponse.json({ success: true, campaigns })
  } catch (error) {
    console.error('GET /api/campaigns error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      title,
      description,
      goal,
      chains,
      category,
      creatorId,
      image
    } = body as {
      title: string;
      description: string;
      goal: number;
      chains: ("Ethereum" | "Solana" | "Bitcoin")[];
      category?: string;
      creatorId?: string;
      image?: string;
    }

    if (!title || !description || !goal || !chains || chains.length === 0) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    const newCampaign = db.createCampaign({
      title,
      description,
      goal: Number(goal),
      raised: 0,
      chains,
      category,
      // ensure campaigns are linked to their creator for /studio filtering
      creatorId: creatorId || '',
      image
    })

    // Optionally link to creator profile
    if (creatorId) {
      const user = db.findUserById(creatorId) as User | Creator | null
      if (user && user.role === 'creator') {
        const creator = user as Creator
        const existing = Array.isArray(creator.createdCampaigns) ? creator.createdCampaigns : []
        db.updateUser(creatorId, { createdCampaigns: [...existing, newCampaign.id] })
      }
    }

    return NextResponse.json({ success: true, campaign: newCampaign }, { status: 201 })
  } catch (error) {
    console.error('POST /api/campaigns error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
