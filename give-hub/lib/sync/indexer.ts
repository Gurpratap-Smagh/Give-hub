import { ethers } from 'ethers'
import { connectMongo } from '@/lib/mongodb/connection'
import { CampaignModel } from '@/lib/mongodb/models/campaign'
import { EventModel } from '@/lib/mongodb/models/event'
import { SyncStateModel } from '@/lib/mongodb/models/syncState'
import { getContract, getStartBlock } from '@/lib/services/zetachain'

export type SyncResult = {
  fromBlock: number
  toBlock: number
  processed: {
    CampaignCreated: number
    CampaignUpdated: number
    DonationReceived: number
  }
}

function asNum18(v: bigint): number {
  // Assumes 18 decimals (WZETA-like). TODO: fetch token decimals dynamically per token
  return Number(ethers.formatUnits(v, 18))
}

export async function syncOnce(maxRange = 2_000): Promise<SyncResult> {
  await connectMongo()
  const { address, iface } = getContract()

  // Load sync state
  const key = 'givehub:crowdfund'
  const state = await SyncStateModel.findOne({ key })
  const provider = new ethers.JsonRpcProvider(process.env.ZETA_RPC_URL || process.env.NEXT_PUBLIC_ZETA_RPC_URL)
  const latest = await provider.getBlockNumber()

  const start = state?.lastBlock && state.lastBlock > 0
    ? state.lastBlock + 1
    : (getStartBlock() ?? Math.max(0, latest - 25_000))

  const toBlock = Math.min(latest, start + maxRange)
  if (toBlock < start) {
    return { fromBlock: start, toBlock: start, processed: { CampaignCreated: 0, CampaignUpdated: 0, DonationReceived: 0 } }
  }

  const topics = [
    iface.getEventTopic(iface.getEvent('CampaignCreated')),
    iface.getEventTopic(iface.getEvent('DonationReceived')),
    iface.getEventTopic(iface.getEvent('CampaignUpdated')),
  ]

  const logs = await provider.getLogs({ address, fromBlock: start, toBlock, topics: [topics] })

  let created = 0
  let updated = 0
  let donated = 0
  let lastProcessedBlock = state?.lastBlock ?? 0

  for (const log of logs) {
    const parsed = (() => {
      try {
        return iface.parseLog({ topics: [...log.topics], data: log.data })
      } catch {
        return null
      }
    })()
    if (!parsed) continue

    // Idempotency: store raw event first; if already exists, skip applying side-effects
    // Make args JSON-safe
    const safeArgs = (input: unknown): unknown => {
      if (typeof input === 'bigint') return input.toString()
      if (Array.isArray(input)) return (input as unknown[]).map(safeArgs)
      if (input && typeof input === 'object') {
        const out: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(input as Record<string, unknown>)) out[k] = safeArgs(v)
        return out
      }
      return input
    }

    const evUp = await EventModel.updateOne(
      { contract: address.toLowerCase(), txHash: log.transactionHash, logIndex: log.logIndex },
      {
        $setOnInsert: {
          contract: address.toLowerCase(),
          event: parsed.name,
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          args: safeArgs(parsed.args),
          createdAt: new Date(),
        },
      },
      { upsert: true }
    )

    const isNew = (evUp.upsertedCount ?? 0) > 0
    if (!isNew) {
      // Already processed
      lastProcessedBlock = Math.max(lastProcessedBlock, log.blockNumber)
      continue
    }

    if (parsed.name === 'CampaignCreated') {
      const [campaignIdBn, creator, title, category, _preferredZRC20, goalBn, _deadlineBn] = parsed.args as unknown as [bigint, string, string, string, string, bigint, bigint]
      await CampaignModel.updateOne(
        { onchainId: Number(campaignIdBn) },
        {
          $setOnInsert: {
            id: String(Number(campaignIdBn)),
            onchainId: Number(campaignIdBn),
            creatorAddress: creator.toLowerCase(),
            title,
            description: '',
            category,
            goal: asNum18(goalBn),
            raised: 0,
            active: true,
            image: '',
            chains: ['ZetaChain'],
            contractAddress: address,
            verified: true,
          },
          $set: {
            // Keep mutable fields up-to-date if reorgs
            title,
            category,
            active: true,
          },
        },
        { upsert: true }
      )
      created++
    } else if (parsed.name === 'CampaignUpdated') {
      const [campaignIdBn, title, description, active] = parsed.args as unknown as [bigint, string, string, boolean]
      await CampaignModel.updateOne(
        { onchainId: Number(campaignIdBn) },
        {
          $set: {
            title: title || undefined,
            description: description || undefined,
            active,
          },
        }
      )
      updated++
    } else if (parsed.name === 'DonationReceived') {
      const [_donationIdBn, campaignIdBn, donor, _originalToken, _originalAmountBn, convertedAmountBn, originChain, donorName] = parsed.args as unknown as [bigint, bigint, string, string, bigint, bigint, string, string]
      const amount = asNum18(convertedAmountBn)
      await CampaignModel.updateOne(
        { onchainId: Number(campaignIdBn) },
        {
          $push: {
            donations: {
              name: donorName || (donor?.toLowerCase() ?? 'anon'),
              amount,
              chain: originChain || 'ZetaChain',
              timestamp: new Date(),
              txHash: log.transactionHash,
            },
          },
          $inc: { raised: amount },
        }
      )
      donated++
    }

    lastProcessedBlock = Math.max(lastProcessedBlock, log.blockNumber)
  }

  // Persist sync cursor
  await SyncStateModel.updateOne(
    { key },
    { $set: { key, contract: address.toLowerCase(), lastBlock: toBlock, updatedAt: new Date() } },
    { upsert: true }
  )

  return {
    fromBlock: start,
    toBlock,
    processed: {
      CampaignCreated: created,
      CampaignUpdated: updated,
      DonationReceived: donated,
    },
  }
}
