/**
 * FILE: app/api/campaigns/route.ts
 * PURPOSE: Server API to fetch list of campaigns from MongoDB or mock DB
 * ACCESS: GET /api/campaigns
 * NOTE: Environment determines MongoDB vs mock DB usage via USE_MONGODB
 */

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authMiddleware, type AuthedRequest } from '@/lib/auth'
import type { Campaign } from '@/lib/db'
import { serverGetAllSyncedCampaignIds } from '@/lib/web3/server'

// Note: authMiddleware reads 'auth-token' cookie, verifies JWT, and attaches request.user

// Normalize campaign payloads so clients get consistent computed fields from the API
type CampaignDTO = Campaign & { progressPct: number; donors: number }
function normalizeCampaignForApi(c: Campaign): CampaignDTO {
  const goal = Number(c.goal || 0)
  const raised = Number(c.raised || 0)
  const progressPct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0
  const donors = Array.isArray(c.donations) ? c.donations.length : 0
  // Ensure cents remain numbers and attach computed fields
  return { ...c, goal, raised, progressPct, donors }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const showUnsynced = searchParams.get('showUnsynced')
    const skipBlockchainCheck = searchParams.get('skipBlockchain') === 'true'
    // MongoDB status is managed internally by the db adapter
    
    // Get campaigns based on database config and filter params
    const searchQuery = searchParams.get('search')?.trim();
    const searchParam = searchParams.get('param') as 'all' | 'title' | 'creator' | 'category' || 'all';
    const creatorId = searchParams.get('creatorId')?.trim() || undefined;
    
    // Fetch campaigns, optionally filtered by creatorId at the DB level for efficiency
    const allCampaigns = creatorId
      ? await db.searchCampaigns({ creatorId })
      : await db.getAllCampaigns()
    
    // Handle search filtering
    let filteredCampaigns = allCampaigns;
    // Safety: If creatorId is provided but DB adapter didn't filter (future-proof), ensure filter here
    if (creatorId) {
      filteredCampaigns = filteredCampaigns.filter(c => c.creatorId === creatorId)
    }
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      filteredCampaigns = allCampaigns.filter(campaign => {
        // Default search in all fields
        if (searchParam === 'all' || !searchParam) {
          return (
            campaign.title.toLowerCase().includes(searchLower) ||
            campaign.description.toLowerCase().includes(searchLower) ||
            (campaign.category && campaign.category.toLowerCase().includes(searchLower))
          );
        }
        
        // Search by specific field
        if (searchParam === 'title') {
          return campaign.title.toLowerCase().includes(searchLower);
        }
        if (searchParam === 'creator') {
          return campaign.creatorId.toLowerCase().includes(searchLower);
        }
        if (searchParam === 'category') {
          return campaign.category?.toLowerCase().includes(searchLower);
        }
        
        return false;
      });
    }
    
    // If skipBlockchainCheck is true, return all campaigns quickly without verification
    if (skipBlockchainCheck) {
      // For quick loading, just filter based on whether campaigns have onChain property
      let campaigns = filteredCampaigns
      if (showUnsynced === 'true') {
        // Show campaigns without onChain property
        campaigns = filteredCampaigns.filter(campaign => !campaign.onChain)
      } else if (showUnsynced === 'all') {
        campaigns = filteredCampaigns // All campaigns for studio (with search applied)
      } else {
        // Show campaigns with onChain property
        campaigns = filteredCampaigns.filter(campaign => !!campaign.onChain)
      }
      return NextResponse.json({ 
        success: true, 
        campaigns: campaigns.map(normalizeCampaignForApi), 
        verificationStatus: 'skipped'
      }, { status: 200 })
    }
    
    // Process using contract view: get all synced on-chain campaign IDs
    const syncedOnChainIds = await serverGetAllSyncedCampaignIds(100)

    // Filter campaigns based on verified on-chain sync status
    let campaigns = filteredCampaigns
    if (showUnsynced === 'true') {
      // Only show campaigns that are not verified on-chain
      campaigns = filteredCampaigns.filter(campaign => {
        const onChainId = campaign.onChain?.campaignId
        return !onChainId || !syncedOnChainIds.has(onChainId)
      })
    } else if (showUnsynced === 'all') {
      campaigns = filteredCampaigns // All campaigns for studio
    } else {
      // Only show campaigns whose onChain id is present in the view results
      campaigns = filteredCampaigns.filter(campaign => {
        const onChainId = campaign.onChain?.campaignId
        return !!onChainId && syncedOnChainIds.has(onChainId)
      })
    }
    
    return NextResponse.json({ 
      success: true, 
      campaigns: campaigns.map(normalizeCampaignForApi), 
      verificationStatus: 'complete' 
    }, { status: 200 })
  } catch (err) {
    // Handle API errors and log only in development
    if (process.env.NODE_ENV === 'development') {
      console.error('GET /api/campaigns error:', err)
    }
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

export const POST = authMiddleware(async (req: AuthedRequest) => {
  try {
    const body = await req.json()
    const { title, imgSrc, description, category, goal, onChain, preferredToken } = body || {}
    if (process.env.NODE_ENV === 'development') {
      console.debug('POST /api/campaigns received payload', {
        hasOnChain: !!onChain,
        title: !!title,
        category: !!category,
        hasGoal: goal !== undefined && goal !== null,
      })
    }
    if (!title || !category || goal === undefined || goal === null) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }
    
    // Ensure preferredToken is WZETA
    const WZETA_ADDRESS = process.env.NEXT_PUBLIC_WZETA_ADDRESS
    if (!WZETA_ADDRESS) {
      return NextResponse.json({ success: false, error: 'WZETA token address not configured' }, { status: 500 })
    }
    
    // Validate that preferredToken is WZETA
    if (preferredToken && preferredToken.address !== WZETA_ADDRESS) {
      return NextResponse.json({ 
        success: false, 
        error: 'Only WZETA token is supported as preferred token' 
      }, { status: 400 })
    }

    // Build data to satisfy DB adapter type Omit<Campaign, 'id'>
    const campaignData: Omit<Campaign, 'id'> & { onChain?: Campaign['onChain']; onchainId?: number } = {
      // Required
      title: String(title),
      goal: Number(goal),
      raised: 0,
      description: String(description ?? ''),
      category: String(category),
      creatorId: req.user.id,
      // Ensure required string field
      image: String(imgSrc ?? ''),
      // Core arrays
      chains: [],
      donations: [],
      contractOwnership: [],
      // Timestamps
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

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
      // Also persist numeric onchainId so the indexer can upsert to this document
      campaignData.onchainId = Number(campaignId)
      if (process.env.NODE_ENV === 'development') {
        console.debug('[campaigns] Persisting onChain mapping', {
          chainId,
          contract,
          campaignId,
          onchainId: campaignData.onchainId,
        })
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.debug('[campaigns] Creating campaign', {
        hasOnChain: !!campaignData.onChain,
        onchainId: campaignData.onchainId,
      })
    }
    const newCampaign = await db.createCampaign(campaignData)
    return NextResponse.json({ success: true, campaign: newCampaign }, { status: 201 })
  } catch (error) {
    console.error('POST /api/campaigns error:', error)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
})
