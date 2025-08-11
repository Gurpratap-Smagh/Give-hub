export interface DonationIntent {
  intent: 'donate'
  campaignId: string
  amount: number
  chain: 'Ethereum' | 'Solana' | 'Bitcoin'
}

export interface UnknownIntent {
  intent: 'unknown'
  message: string
}

export type ParsedIntent = DonationIntent | UnknownIntent

/**
 * Parse natural language prompts to extract donation intents
 * This is a simple stub implementation for Gemini function calling
 */
export function parseIntent(prompt: string): ParsedIntent {
  const normalizedPrompt = prompt.toLowerCase().trim()

  // Check if this is a donation intent
  const donateKeywords = ['donate', 'give', 'contribute', 'send', 'transfer']
  const hasDonateKeyword = donateKeywords.some(keyword => 
    normalizedPrompt.includes(keyword)
  )

  if (!hasDonateKeyword) {
    return {
      intent: 'unknown',
      message: 'I can help you donate to campaigns. Try saying something like "donate 0.1 ETH to campaign 1"'
    }
  }

  // Extract amount
  const amountMatches = normalizedPrompt.match(/(\d+(?:\.\d+)?)\s*(eth|btc|sol|usd|\$)/i)
  if (!amountMatches) {
    return {
      intent: 'unknown', 
      message: 'Please specify an amount to donate (e.g., "0.1 ETH" or "$100")'
    }
  }

  const amount = parseFloat(amountMatches[1])
  const currency = amountMatches[2].toLowerCase()

  // Convert to USD if needed (using rough estimates)
  let usdAmount = amount
  if (currency === 'eth') {
    usdAmount = amount * 2000 // Rough ETH price
  } else if (currency === 'btc') {
    usdAmount = amount * 45000 // Rough BTC price
  } else if (currency === 'sol') {
    usdAmount = amount * 100 // Rough SOL price
  }

  // Extract campaign ID
  const campaignMatches = normalizedPrompt.match(/campaign\s*(\d+|[a-z0-9]+)/i)
  if (!campaignMatches) {
    return {
      intent: 'unknown',
      message: 'Please specify which campaign to donate to (e.g., "campaign 1" or "campaign abc123")'
    }
  }

  const campaignId = campaignMatches[1]

  // Determine chain based on currency or explicit mention
  let chain: 'Ethereum' | 'Solana' | 'Bitcoin' = 'Ethereum'
  if (currency === 'btc' || normalizedPrompt.includes('bitcoin')) {
    chain = 'Bitcoin'
  } else if (currency === 'sol' || normalizedPrompt.includes('solana')) {
    chain = 'Solana'
  } else if (currency === 'eth' || normalizedPrompt.includes('ethereum')) {
    chain = 'Ethereum'
  }

  return {
    intent: 'donate',
    campaignId,
    amount: Math.round(usdAmount * 100) / 100, // Round to 2 decimal places
    chain
  }
}

/**
 * Generate example prompts for testing
 */
export const examplePrompts = [
  'donate 0.1 ETH to campaign 1',
  'give $50 to campaign 2',
  'I want to contribute 0.5 SOL to campaign 3',
  'send 0.001 BTC to campaign abc123',
  'transfer $100 using Ethereum to campaign 1',
  'donate $25 with Bitcoin to campaign 2'
]

/**
 * Validate a parsed intent before processing
 */
export function validateIntent(intent: ParsedIntent): { valid: boolean; error?: string } {
  if (intent.intent === 'unknown') {
    return { valid: false, error: intent.message }
  }

  if (intent.amount <= 0) {
    return { valid: false, error: 'Donation amount must be greater than 0' }
  }

  if (intent.amount > 10000) {
    return { valid: false, error: 'Donation amount cannot exceed $10,000' }
  }

  if (!intent.campaignId) {
    return { valid: false, error: 'Campaign ID is required' }
  }

  const validChains = ['Ethereum', 'Solana', 'Bitcoin']
  if (!validChains.includes(intent.chain)) {
    return { valid: false, error: 'Invalid blockchain specified' }
  }

  return { valid: true }
}
