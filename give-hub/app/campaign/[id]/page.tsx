import { db } from '@/_dev/mock-db/database'
import { notFound } from 'next/navigation'
import type { Campaign, User, Creator } from '@/_dev/mock-db/database'
import CampaignPageContent from './CampaignPageContent'

/**
 * FILE: app/campaign/[id]/page.tsx
 * PURPOSE: Campaign detail page, server component for data fetching.
 * Fetches campaign and donation data and passes it to a client component for rendering.
 */

// Re-enabling on-demand caching for this page.
export const revalidate = 0

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params
  const campaignId = resolvedParams.id

  // Fetch data on the server
  const campaignData = db.findCampaignById(campaignId)
  if (!campaignData) {
    notFound()
  }

  // Fetch creator details
  const creator = db.findUserById(campaignData.creatorId) as User | Creator | null

  // Combine campaign with creator info
  const campaign: Campaign & { creator?: User | Creator | null } = {
    ...campaignData,
    creator,
  }

  const donationsData = db.getDonationsByCampaign(campaignId)

  // Render the client component with the fetched data
  return (
    <CampaignPageContent
      initialCampaign={JSON.parse(JSON.stringify(campaign))}
      initialDonations={JSON.parse(JSON.stringify(donationsData))}
    />
  )
}
