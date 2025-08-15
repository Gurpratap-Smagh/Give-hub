import { NextRequest, NextResponse } from 'next/server'
import { authService } from '@/lib/auth/auth'
import { db } from '@/_dev/mock-db/database'

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
    const campaign = db.findCampaignById(campaignId)
    
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Check if user owns this campaign
    if (campaign.creatorId !== user.id) {
      return NextResponse.json({ error: 'You can only edit your own campaigns' }, { status: 403 })
    }

    const body = await request.json()
    const { title, description, goal, category, image, chains } = body

    // Validate required fields
    if (!title || !description || !goal || !chains || chains.length === 0) {
      return NextResponse.json({ 
        error: 'Title, description, goal, and at least one blockchain are required' 
      }, { status: 400 })
    }

    // Validate goal
    if (typeof goal !== 'number' || goal <= 0) {
      return NextResponse.json({ error: 'Goal must be a positive number' }, { status: 400 })
    }

    // Validate chains
    const validChains = ['Ethereum', 'Solana', 'Bitcoin']
    if (!Array.isArray(chains) || !chains.every(chain => validChains.includes(chain))) {
      return NextResponse.json({ error: 'Invalid blockchain selection' }, { status: 400 })
    }

    // Validate image if provided
    if (image && !image.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Invalid image format' }, { status: 400 })
    }

    // Update campaign
    const updateData = {
      title: title.trim(),
      description: description.trim(),
      goal,
      category: category?.trim() || undefined,
      image: image || undefined,
      chains
    }

    const updatedCampaign = db.updateCampaign(campaignId, updateData)
    
    if (!updatedCampaign) {
      return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
    }

    return NextResponse.json(updatedCampaign)
    
  } catch (error) {
    console.error('Campaign edit error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
