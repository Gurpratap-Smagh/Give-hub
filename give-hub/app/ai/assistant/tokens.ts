// app/ai/assistant/tokens.ts
// Token and chain mapping for planner

export interface ChainTokenMap {
  [chain: string]: string[];
}

// Chain to available tokens mapping
export const CHAIN_TO_TOKENS: ChainTokenMap = {
  "ZETA": ["WZETA"],
  "SEPOLIA": ["zETH", "USDC"],
  "BTC": ["sBTC"]
};

// Normalize user input chain names to standardized chain keys
export function normalizeChainName(input: string): string | null {
  const normalized = input?.toLowerCase()?.trim();
  
  if (!normalized) return null;
  
  // Direct matches and aliases
  if (/\b(zeta|zetachain)\b/.test(normalized)) return "ZETA";
  if (/\b(sepolia|eth|ethereum)\b/.test(normalized)) return "SEPOLIA";
  if (/\b(btc|bitcoin|bitcoin testnet)\b/.test(normalized)) return "BTC";
  
  // No match found
  return null;
}

// Normalize user input token names to standardized token names for a given chain
export function normalizeTokenName(input: string, chain: string): string | null {
  if (!input || !chain) return null;
  
  const normalized = input?.toLowerCase()?.trim();
  const availableTokens = CHAIN_TO_TOKENS[chain] || [];
  
  // Direct matching with case-insensitive comparison
  for (const token of availableTokens) {
    if (token.toLowerCase() === normalized) {
      return token;
    }
  }
  
  // Alias matching
  if (chain === "ZETA") {
    if (/\b(zeta|native)\b/.test(normalized)) return "WZETA";
  } 
  else if (chain === "SEPOLIA") {
    if (/\b(eth|ethereum)\b/.test(normalized)) return "zETH";
    if (/\b(usdc|usd|dollar|dollars)\b/.test(normalized)) return "USDC";
  }
  else if (chain === "BTC") {
    if (/\b(btc|bitcoin)\b/.test(normalized)) return "sBTC";
  }
  
  // Default to first available token for the chain if we can't determine
  return availableTokens.length > 0 ? availableTokens[0] : null;
}

// Get default token for a chain
export function getDefaultToken(chain: string): string | null {
  const tokens = CHAIN_TO_TOKENS[chain];
  return tokens && tokens.length > 0 ? tokens[0] : null;
}

// Extract chain and token information from user text
export function extractChainAndToken(text: string): {
  chain: string | null;
  token: string | null;
  chainExplicit: boolean;
  tokenExplicit: boolean;
} {
  const normalized = text.toLowerCase();

  // --- Detect chain ---
  let detectedChain: string | null = null;
  let chainExplicit = false;

  for (const chain of Object.keys(CHAIN_TO_TOKENS)) {
    if (normalized.includes(chain.toLowerCase())) {
      detectedChain = chain;
      chainExplicit = true;
      break;
    }
  }

  if (!detectedChain) {
    if (/\b(zeta|zetachain)\b/.test(normalized)) { detectedChain = "ZETA"; chainExplicit = true; }
    else if (/\b(sepolia|eth|ethereum)\b/.test(normalized)) { detectedChain = "SEPOLIA"; chainExplicit = true; }
    else if (/\b(btc|bitcoin)\b/.test(normalized)) { detectedChain = "BTC"; chainExplicit = true; }
    else {
      // Default chain inference (non-explicit)
      detectedChain = "ZETA";
      chainExplicit = false;
    }
  }

  // --- Detect token ---
  let detectedToken: string | null = null;
  let tokenExplicit = false;

  if (detectedChain) {
    const chainTokens = CHAIN_TO_TOKENS[detectedChain] || [];

    // Direct token mentions
    for (const token of chainTokens) {
      if (normalized.includes(token.toLowerCase())) {
        detectedToken = token;
        tokenExplicit = true;
        break;
      }
    }

    // Alias-based explicit mentions
    if (!detectedToken) {
      if (detectedChain === "ZETA" && /\b(zeta|native)\b/.test(normalized)) {
        detectedToken = "WZETA";
        tokenExplicit = true;
      } else if (detectedChain === "SEPOLIA") {
        if (/\b(eth|ethereum)\b/.test(normalized)) { detectedToken = "zETH"; tokenExplicit = true; }
        else if (/\b(usdc|usd|dollar|dollars)\b/.test(normalized)) { detectedToken = "USDC"; tokenExplicit = true; }
      } else if (detectedChain === "BTC" && /\b(btc|bitcoin)\b/.test(normalized)) {
        detectedToken = "sBTC";
        tokenExplicit = true;
      }
    }

    // If still no token, infer a default but mark as non-explicit
    if (!detectedToken) {
      detectedToken = getDefaultToken(detectedChain);
      tokenExplicit = false;
    }
  }

  return { chain: detectedChain, token: detectedToken, chainExplicit, tokenExplicit };
}
