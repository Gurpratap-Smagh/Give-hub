import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { Campaign } from '@/lib/db';

function normalizeCampaign(campaign: Campaign) {
  const goal = Number(campaign.goal || 0);
  const raised = Number(campaign.raised || 0);
  const progressPct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
  const donors = Array.isArray(campaign.donations) ? campaign.donations.length : 0;
  return { ...campaign, goal, raised, progressPct, donors };
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const { 
      amount, 
      donor, 
      txHash
    } = body;

    // Validate required fields
    if (!amount || !donor || !txHash) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing required donation data' 
      }, { status: 400 });
    }

    // Find the campaign
    const campaign = await db.findCampaignById(id);
    if (!campaign) {
      return NextResponse.json({ 
        success: false, 
        error: 'Campaign not found' 
      }, { status: 404 });
    }

    // Convert amount from Wei/blockchain units to cents for storage
    // Assuming amount comes in as a decimal string (e.g., "1.5" for 1.5 ZETA)
    const amountInCents = Math.round(parseFloat(amount) * 100);

    // Update campaign raised amount
    const newRaised = (campaign.raised || 0) + amountInCents;
    
    // Update campaign raised amount only for now
    const updatedCampaign = await db.updateCampaign(id, {
      raised: newRaised
    });

    if (!updatedCampaign) {
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to update campaign' 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      campaign: normalizeCampaign(updatedCampaign),
      newRaised
    });

  } catch (error) {
    console.error('Error updating campaign donation:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
