# GiveHub Complete System Configuration

## 🎯 Overview
This document provides a complete configuration guide for the updated GiveHub crowdfunding platform with multi-chain support, automatic MetaMask switching, and enhanced AI context.

## 📋 What's New

### 1. Campaign Creation with Payout Details
Users can now specify:
- **Payout Address** - Destination wallet for campaign funds
- **Preferred Payout Token** - Token type for receiving donations (USDC, WZETA, etc.)
- **Accepted Chains** - Which blockchains donors can use

### 2. Multi-Chain Donations
- Donors can select any supported chain when donating
- MetaMask automatically switches to the selected chain
- Different tokens available per chain (USDC on Sepolia, WZETA on ZetaChain, etc.)

### 3. AI Enhanced Context
- AI remembers recent donations and their details
- AI understands token names and infers correct chains
- AI can handle follow-up donations with context awareness

## 🔧 Configuration Files

### Environment Variables (.env)

```env
# ==========================================
# CRITICAL: Contract & RPC Configuration
# ==========================================

# Your deployed CrossChainCrowdfund contract address
NEXT_PUBLIC_CROWDFUND_ADDRESS=0xffa7CA1AEEEbBc30C874d32C7e22F052BbEa0429

# ZetaChain Network Configuration
NEXT_PUBLIC_ZETA_CHAIN_ID=7001
NEXT_PUBLIC_ZETA_RPC_URL=https://rpc.athens.zetachain.com
NEXT_PUBLIC_ZETA_CHAIN_NAME=ZetaChain Athens
NEXT_PUBLIC_ZETA_NATIVE_SYMBOL=ZETA
NEXT_PUBLIC_ZETA_EXPLORER_URL=https://athens.explorer.zetachain.com

# Token Addresses on ZetaChain
NEXT_PUBLIC_WZETA_ADDRESS=0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf
NEXT_PUBLIC_WZETA_ATHENS=0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf

# System Contract (for ZetaChain interactions)
NEXT_PUBLIC_SYSTEM_CONTRACT_ADDRESS=0x239e96c8f17C85c30100AC26F635EA15f23d4590

# ==========================================
# Supported Networks Configuration
# ==========================================

# Ethereum Sepolia
NEXT_PUBLIC_ETHEREUM_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
NEXT_PUBLIC_ETHEREUM_CHAIN_ID=11155111

# Gateway addresses for cross-chain communication
NEXT_PUBLIC_GATEWAY_SEPOLIA=0x... # Ethereum Sepolia Gateway address
NEXT_PUBLIC_ERC20_SEPOLIA_USDC=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48

# ==========================================
# Payment Provider Configuration
# ==========================================

# Options: 'zetachain' (production) | 'mock' (development)
NEXT_PUBLIC_PAYMENT_PROVIDER=zetachain

# ==========================================
# AI Configuration
# ==========================================

# Gemini API Key for AI features
GEMINI_API_KEY=your_gemini_api_key_here

# Use default AI prompts (optimized for GiveHub)
DEFAULT_PROMPT=true

# ==========================================
# Database Configuration
# ==========================================

# Set to 'true' for MongoDB, 'false' for local JSON
USE_MONGODB=false
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/givehub
MONGODB_DB=Give-hub

# ==========================================
# Feature Flags
# ==========================================

# Enable on-chain campaign tracking
NEXT_PUBLIC_ENABLE_ONCHAIN_SYNC=true

# Enable multi-chain donations
NEXT_PUBLIC_ENABLE_MULTICHAIN=true
```

## 🔐 Network Details

### ZetaChain Athens (Testnet)
```
Chain ID: 7001
RPC: https://rpc.athens.zetachain.com
Explorer: https://athens.explorer.zetachain.com
Native Token: ZETA
Tokens Available: WZETA, zETH, sBTC
```

### Ethereum Sepolia (Testnet)
```
Chain ID: 11155111
RPC: https://sepolia.infura.io/v3/{key}
Explorer: https://sepolia.etherscan.io
Native Token: ETH
Tokens Available: ETH, USDC, zETH (from ZetaChain)
```

### Bitcoin (Testnet)
```
Chain ID: 18332
Token: BTC
Available: sBTC (on ZetaChain)
```

### Solana (Devnet)
```
Chain ID: 901
RPC: https://api.devnet.solana.com
Token: SOL
```

## 📦 Token Addresses

### ZetaChain Athens
```typescript
WZETA: 0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf
zETH:  0x05ba149a7bd6dc1f937fa9046a9e05c05f3b18b0
sBTC:  0x65a45c57636f9BcCeD4fe193A602008578BcA90b
```

### Ethereum Sepolia
```typescript
ETH:   0x0000000000000000000000000000000000000000 (native)
USDC:  0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
zETH:  0x... (bridged from ZetaChain)
```

## 🎛️ Component Configuration

### Campaign Form
**Location:** `components/campaign-form.tsx`

**Configuration:**
- Payout token list updates dynamically based on selected chains
- Accepts EVM addresses and Bitcoin addresses
- Validates address format before submission
- Shows appropriate tokens per chain

**Available Tokens Per Chain:**
```typescript
Ethereum: ['ETH', 'USDC']
ZetaChain: ['ZETA', 'WZETA', 'zETH', 'sBTC']
Solana: ['SOL']
Bitcoin: ['BTC']
```

### Chain Selector
**Location:** `components/chain-selector.tsx`

**Features:**
- Automatic MetaMask network switching
- Visual feedback during switching
- Fallback if network switch fails
- Support for chain not yet in MetaMask wallet

**Configuration:**
- Supported chains defined in `SUPPORTED_CHAINS` array
- Can customize chain order, icons, and info
- Auto-adds unknown networks to MetaMask

### Network Switcher
**Location:** `lib/web3/network-switcher.ts`

**Functions:**
```typescript
switchNetwork(chainIdOrKey)     // Switch to chain (uses chainId or key)
addNetwork(networkConfig)        // Add new network to MetaMask
getCurrentChainId()             // Get current connected chain
getNetworkName(chainId)          // Get human-readable name
getNetworkByChainId(chainId)     // Get network config by ID
```

## 🤖 AI Configuration

### Prompts
**Location:** `lib/ai/prompts.ts`

**Key Features:**
- Schema includes token field for better context
- AI understands token→chain mapping
- AI tracks donation sequences
- AI remembers recent donation context

**Supported Commands:**
```
"donate 5 USDC to [campaign]"           → Opens SEPOLIA payment
"donate 10 WZETA to [campaign]"         → Opens ZETA payment
"donate again"                          → Uses previous donation context
"show me [topic] campaigns"             → Searches by topic
"suggest a campaign to support"         → Recommends campaigns
```

## 🔌 API Integration

### Campaign Creation Endpoint
```
POST /api/campaigns

Body:
{
  "title": string,
  "description": string,
  "goal": number,
  "chains": string[],
  "payoutAddress": string,        // NEW
  "payoutToken": string,          // NEW
  "category": string
}

Response:
{
  "id": string,
  "title": string,
  ...
  "payoutAddress": string,
  "payoutToken": string
}
```

### Donation Context Endpoint
```
POST /api/donations

Body:
{
  "campaignId": string,
  "amount": string,
  "chain": string,                // NEW
  "token": string,                // NEW
  "donorName": string,
  "txHash": string,
  "note": string
}
```

## 🧪 Testing Checklist

### Unit Tests
- [ ] Campaign form address validation
- [ ] Campaign form token selection
- [ ] Network switcher chain ID conversion
- [ ] AI prompt JSON generation

### Integration Tests
- [ ] Campaign creation with payout details
- [ ] Donation flow across chains
- [ ] MetaMask network switching
- [ ] AI context persistence

### End-to-End Tests
- [ ] Create campaign → Donate → Confirm
- [ ] Multi-chain donations → Switch networks
- [ ] AI suggestions → Donate -> Repeat
- [ ] Error handling → Recovery

## 📊 Monitoring

### Key Metrics to Track
1. **Campaign Creation Success Rate**
   - With payout address validation
   - With token selection

2. **Donation Success Rate**
   - Per chain
   - Per token type
   - Network switch timing

3. **AI Context Accuracy**
   - Donation context preservation
   - Token inference correctness
   - Chain suggestion accuracy

4. **Network Switch Metrics**
   - Switch time (target < 2s)
   - Failure rate (target < 2%)
   - User manual switches after auto-fail

## 🚀 Deployment Steps

1. **Update Environment Variables**
   - Set all required `.env` variables
   - Configure RPC endpoints
   - Set contract addresses

2. **Database Migration**
   - Add `payoutAddress` field to campaigns
   - Add `payoutToken` field to campaigns
   - Migrate existing campaigns if needed

3. **Smart Contract**
   - Deploy CrossChainCrowdfund on ZetaChain
   - Verify contract addresses
   - Test contract functions

4. **Frontend Build**
   ```bash
   npm install
   npm run build
   npm start
   ```

5. **Verify Configuration**
   - Test MetaMask switching
   - Test donation flow
   - Test AI context
   - Verify error messages

6. **Production Deploy**
   - Deploy to Vercel or hosting provider
   - Verify environment variables
   - Test all features in production
   - Monitor error logs

## 🐛 Troubleshooting

### MetaMask Not Switching
1. Verify MetaMask is installed and unlocked
2. Check RPC URLs are valid
3. Ensure chain IDs match MetaMask format
4. Try manual switch in MetaMask
5. Check browser console for errors

### Token Not Showing
1. Verify chain is selected
2. Check token address in code
3. Verify environment variables are set
4. Clear browser cache and reload

### AI Not Understanding
1. Check prompts are loaded correctly
2. Verify context is passed to AI
3. Check API key is valid
4. Review Gemini response format

### Donation Failing
1. Check wallet has balance
2. Verify contract address is correct
3. Check gas prices aren't too high
4. Verify token is approved (if needed)
5. Review contract error logs

## 📞 Support

For issues or questions:
1. Check logs in browser console
2. Review TESTING_GUIDE.md
3. Review IMPLEMENTATION_SUMMARY.md
4. Check environment variables
5. Verify smart contract deployment

---

**Configuration Complete! Ready for Production Deploy** ✅
