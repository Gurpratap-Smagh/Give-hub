import { NextRequest, NextResponse } from 'next/server'
import { authService } from '@/lib/auth/auth'
import { db } from '@/lib/db'
import type { Campaign } from '@/lib/db'

function normalizeCampaign(campaign: Campaign) {
  const goal = Number(campaign.goal || 0)
  const raised = Number(campaign.raised || 0)
  const progressPct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0
  const donors = Array.isArray(campaign.donations) ? campaign.donations.length : 0
  return { ...campaign, goal, raised, progressPct, donors }
}

// PUT /api/campaigns/[id]/edit - Update campaign (creator only)
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get('auth-token')?.value
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const authResult = await authService.verifyToken(token)
    if (!authResult.success || !authResult.userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const user = await db.findUserById(authResult.userId)
    if (!user || user.role !== 'creator') {
      return NextResponse.json({ error: 'Only creators can edit campaigns' }, { status: 403 })
    }

    const { id: campaignId } = await context.params
    const campaign = await db.findCampaignById(campaignId)
    
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Check if user owns this campaign
    if (campaign.creatorId !== user.id) {
      return NextResponse.json({ error: 'You can only edit your own campaigns' }, { status: 403 })
    }

    const body = await request.json()
    const { title, description, goal, category, image, chains, onChain, preferredToken } = body || {}
    
    // Ensure preferredToken is WZETA
    const WZETA_ADDRESS = process.env.NEXT_PUBLIC_WZETA_ADDRESS
    if (preferredToken && WZETA_ADDRESS && preferredToken.address !== WZETA_ADDRESS) {
      return NextResponse.json({ error: 'Only WZETA token is supported as preferred token' }, { status: 400 })
    }

    // Build partial update object, validating only provided fields
    const updateData: Record<string, unknown> = {}

    if (typeof title === 'string' && title.trim()) {
      updateData.title = title.trim()
    }
    if (typeof description === 'string' && description.trim()) {
      updateData.description = description.trim()
    }
    if (goal !== undefined) {
      if (typeof goal !== 'number' || !(goal > 0)) {
        return NextResponse.json({ error: 'Goal must be a positive number' }, { status: 400 })
      }
      updateData.goal = goal
    }
    if (typeof category === 'string') {
      const c = category.trim()
      if (c) updateData.category = c
    }
    if (image !== undefined) {
      if (image && typeof image === 'string' && !image.startsWith('data:image/')) {
        return NextResponse.json({ error: 'Invalid image format' }, { status: 400 })
      }
      updateData.image = image || undefined
    }
    if (Array.isArray(chains)) {
      updateData.chains = chains
    }
    if (onChain !== undefined) {
      // Validate onChain mapping when provided
      const oc = onChain as { chainId?: unknown; contract?: unknown; campaignId?: unknown }
      const chainId = Number(oc.chainId)
      const contract = typeof oc.contract === 'string' ? oc.contract : ''
      const campaignId = typeof oc.campaignId === 'string' ? oc.campaignId : ''

      if (!Number.isFinite(chainId) || chainId <= 0) {
        return NextResponse.json({ error: 'onChain.chainId must be a positive number' }, { status: 400 })
      }
      if (!contract || typeof contract !== 'string') {
        return NextResponse.json({ error: 'onChain.contract is required' }, { status: 400 })
      }
      if (!campaignId || typeof campaignId !== 'string') {
        return NextResponse.json({ error: 'onChain.campaignId is required' }, { status: 400 })
      }

      updateData.onChain = { chainId, contract, campaignId }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const updatedCampaign = await db.updateCampaign(campaignId, updateData)
    
    if (!updatedCampaign) {
      return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
    }

    return NextResponse.json(normalizeCampaign(updatedCampaign))
    
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
