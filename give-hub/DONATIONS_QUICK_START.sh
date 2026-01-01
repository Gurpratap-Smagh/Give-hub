#!/bin/bash
# Donations Panel Quick Start & Testing Guide

## ✅ System Status Check

# 1. Verify all donations can be fetched from blockchain
echo "🔍 Fetching all historical donations..."
node scripts/validate-donations.js

# 2. Test the complete donation flow (token detection + USD conversion)
echo -e "\n🧪 Testing donation flow..."
node scripts/test-donations-flow.js

## 🔧 Configuration Management

# 1. View current token catalog
echo "📋 Current token catalog in .env:"
grep "NEXT_PUBLIC_ZRC20_TOKENS=" .env

# 2. Update token catalog (add new chain/token)
# Edit .env and modify NEXT_PUBLIC_ZRC20_TOKENS with new tokens:
# Format: {"CHAIN_NAME":[{"symbol":"TOKEN","address":"0x...","decimals":18}]}

# 3. Update price table for USD conversion
# Edit lib/prices/converter.ts TO_USD object to add new token prices

## 🚀 Testing in Development

# 1. Start the Next.js dev server
npm run dev

# 2. Open browser: http://localhost:3000

# 3. Navigate to a campaign page (e.g., /campaign/3)

# 4. Look for "Donations" panel showing:
#    - Donor names
#    - Token amounts with symbols
#    - USD values
#    - Notes

## 📊 Monitor Live Donations

# Watch browser console for donation events:
# Look for logs like:
# [DonationEventService] New donation detected: {
#   campaignId: "3",
#   donor: "g01719983",
#   amount: "0.01",
#   symbol: "ETH",
#   usd: 50,
#   txHash: "0x..."
# }

## 🐛 Debugging

# 1. Check if events are being fetched
#    - Open browser DevTools Console
#    - Look for: "[DonationEventService] Connected at block X"

# 2. Check if tokens are detected
#    - Look for logs with token details
#    - If showing "UNKNOWN", check NEXT_PUBLIC_ZRC20_TOKENS config

# 3. Check USD conversion
#    - Log should show "usd: $X.XX"
#    - If $0, token price not in converter.ts

# 4. Check MongoDB recording
#    - Look for "[DonationEventService] Successfully recorded donation"
#    - If "Invalid amount", check donation amount is number not string

## 📝 Common Tasks

# Add a new token:
# 1. Get token address from blockchain explorer
# 2. Get decimals from token contract
# 3. Add to NEXT_PUBLIC_ZRC20_TOKENS in .env:
#    {"CHAIN":[{"symbol":"TOKEN","address":"0x...","decimals":18}]}
# 4. Add price to lib/prices/converter.ts TO_USD table
# 5. Restart dev server

# Support a new blockchain:
# 1. Deploy CrossChainCrowdfund on that chain via ZetaChain gateway
# 2. Get ZRC20 token addresses for that chain
# 3. Add to NEXT_PUBLIC_ZRC20_TOKENS (new chain object)
# 4. Update RPC URL if needed
# 5. Add prices for native tokens

# Test a specific donation:
# node -e "
#   const ethers = require('ethers');
#   const provider = new ethers.JsonRpcProvider('https://zetachain-athens-evm.blockpi.network/v1/rpc/public');
#   provider.getBlockNumber().then(bn => console.log('Current block:', bn));
# "

## 🎯 Success Indicators

# ✅ Donations panel loads
# ✅ Shows recent donations with donor names
# ✅ Amounts display with correct token symbols
# ✅ USD values calculated correctly
# ✅ New donations appear in real-time
# ✅ Browser console shows no errors
# ✅ MongoDB logs show successful recording

## 📞 Support

# If donations aren't showing:
# 1. Run: node scripts/validate-donations.js
#    Should show recent donations from blockchain
# 2. Run: node scripts/test-donations-flow.js
#    Should show token detection and USD conversion working
# 3. Check .env variables:
#    - NEXT_PUBLIC_CROSSCHAIN_CONTRACT
#    - NEXT_PUBLIC_ZETA_RPC_URL
#    - NEXT_PUBLIC_ZRC20_TOKENS
# 4. Check browser console for specific error messages
# 5. See DONATIONS_PANEL_FIX.md for detailed troubleshooting
