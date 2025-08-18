/**
 * FILE: app/api/campaigns/route.ts
 * PURPOSE: Server API to fetch list of campaigns from the JSON mock DB
 * ACCESS: GET /api/campaigns
 * NOTE: Keep interface stable for easy MongoDB swap
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authMiddleware, type AuthedRequest } from '@/lib/auth'
import type { Campaign } from '@/lib/db'

// Note: authMiddleware reads 'auth-token' cookie, verifies JWT, and attaches request.user

export async function GET() {
  try {
    const campaigns = await db.getAllCampaigns()
    return NextResponse.json({ success: true, campaigns }, { status: 200 })
  } catch (error) {
    console.error('GET /api/campaigns error:', error)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

export const POST = authMiddleware(async (req: AuthedRequest) => {
  try {
    const body = await req.json()
    const { title, imgSrc, description, category, goal, onChain } = body || {}
    if (!title || !category || goal === undefined || goal === null) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    // Build data to satisfy DB adapter type Omit<Campaign, 'id'>
    const campaignData: Omit<Campaign, 'id'> & { onChain?: Campaign['onChain'] } = {
      // Required
      title: String(title),
      goal: Number(goal),
      raised: 0,
      description: String(description ?? ''),
      category: String(category),
      creatorId: req.user.id,
      // Optional/extra fields
      image: imgSrc ? String(imgSrc) : undefined,
      active: true,
      verified: false,
      chains: [],
      // Leave uuid/contract fields undefined; DB layer/schema will ignore extras
    } as Omit<Campaign, 'id'>

    // Optionally attach on-chain mapping if provided (validated)
    if (onChain !== undefined) {
      const oc = onChain as { chainId?: unknown; contract?: unknown; campaignId?: unknown }
      const chainId = Number(oc.chainId)
      const contract = typeof oc.contract === 'string' ? oc.contract : ''
      const campaignId = typeof oc.campaignId === 'string' ? oc.campaignId : ''

      if (!Number.isFinite(chainId) || chainId <= 0) {
        return NextResponse.json({ success: false, error: 'onChain.chainId must be a positive number' }, { status: 400 })
      }
      if (!contract) {
        return NextResponse.json({ success: false, error: 'onChain.contract is required' }, { status: 400 })
      }
      if (!campaignId) {
        return NextResponse.json({ success: false, error: 'onChain.campaignId is required' }, { status: 400 })
      }

      campaignData.onChain = { chainId, contract, campaignId }
    }

    const newCampaign = await db.createCampaign(campaignData)
    return NextResponse.json({ success: true, campaign: newCampaign }, { status: 201 })
  } catch (error) {
    console.error('POST /api/campaigns error:', error)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
})
