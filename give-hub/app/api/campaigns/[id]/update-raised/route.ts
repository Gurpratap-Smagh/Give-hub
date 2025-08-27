import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authService } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const token = request.cookies.get('auth-token')?.value
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const verify = await authService.verifyToken(token)
    if (!verify.success || !verify.userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const { id } = params
    const body = await request.json()
    const { amount } = body

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Invalid donation amount' }, { status: 400 })
    }
    
    // Convert amount to cents for storage as integer in MongoDB
    const amountInCents = Math.round(amount * 100)

    // Get current campaign
    const campaign = await db.findCampaignById(id)
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Update raised amount - storing as cents (integer)
    const currentRaisedCents = campaign.raised || 0
    const updatedCampaign = await db.updateCampaign(id, {
      raised: currentRaisedCents + amountInCents
    })

    if (!updatedCampaign) {
      return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
    }

    // Return campaign data - client code should divide raised by 100 for display
    return NextResponse.json({ 
      success: true, 
      campaign: {
        ...updatedCampaign,
        // Include display amount for convenience
        displayRaised: updatedCampaign.raised / 100
      },
      newTotal: updatedCampaign.raised,
      newTotalDisplay: updatedCampaign.raised / 100
    })
  } catch (error) {
    console.error('Update raised amount error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
