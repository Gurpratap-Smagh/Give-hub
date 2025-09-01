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

// Define the route handler for POST requests
export async function POST(request: Request) {
  // Extract the campaign ID from the URL
  const url = new URL(request.url);
  const pathSegments = url.pathname.split('/');
  const id = pathSegments[pathSegments.indexOf('campaigns') + 1];
  
  if (!id) {
    return NextResponse.json({ 
      success: false, 
      message: 'Campaign ID not found in URL' 
    }, { status: 400 });
  }
  
  try {
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
        message: 'Missing required fields' 
      }, { status: 400 });
    }

    // Get the campaign
    const campaign = await db.getCampaign(id);
    if (!campaign) {
      return NextResponse.json({ 
        success: false, 
        message: 'Campaign not found' 
      }, { status: 404 });
    }

    // Update the campaign with the new donation
    const donation = {
      amount: Number(amount),
      donor,
      txHash,
      timestamp: new Date().toISOString()
    };

    // Add donation to campaign
    const donations = Array.isArray(campaign.donations) ? campaign.donations : [];
    donations.push(donation);

    // Update raised amount
    const raised = Number(campaign.raised || 0) + Number(amount);

    // Save to database
    await db.updateCampaign(id, {
      donations,
      raised
    });

    // Get updated campaign
    const updatedCampaign = await db.getCampaign(id);
    if (!updatedCampaign) {
      return NextResponse.json({ 
        success: false, 
        message: 'Failed to retrieve updated campaign' 
      }, { status: 500 });
    }

    // Return normalized campaign data
    return NextResponse.json({ 
      success: true, 
      campaign: normalizeCampaign(updatedCampaign)
    });
  } catch (error) {
    console.error('Error updating donation:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Internal server error' 
    }, { status: 500 });
  }
}
