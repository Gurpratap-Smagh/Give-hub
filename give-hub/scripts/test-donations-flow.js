#!/usr/bin/env node

/**
 * Test donations panel integration
 * Validates:
 * 1. Event fetching from blockchain
 * 2. Token detection and symbol resolution
 * 3. USD conversion using price table
 * 4. API format for MongoDB recording
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Load .env
const dotenvPath = path.join(__dirname, '../.env');
if (fs.existsSync(dotenvPath)) {
  const dotenv = fs.readFileSync(dotenvPath, 'utf8');
  dotenv.split(/\r?\n/).forEach(line => {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  });
}

// Load token catalog from env (simulating the app environment)
const parseTokens = (raw) => {
  if (!raw) return {};
  try {
    let s = raw.trim();
    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
      s = s.slice(1, -1).trim();
    }
    if (s.startsWith('{') || s.startsWith('[')) {
      return JSON.parse(s);
    }
    const once = JSON.parse(s);
    if (typeof once === 'string') {
      const inner = once.trim();
      if (inner.startsWith('{') || inner.startsWith('[')) {
        return JSON.parse(inner);
      }
    }
    return once;
  } catch (e) {
    console.warn('Failed to parse ZRC20_TOKENS:', e.message);
    return {};
  }
};

const TOKEN_CATALOG_RAW = process.env.NEXT_PUBLIC_ZRC20_TOKENS || process.env.ZRC20_TOKENS || '';
const TOKEN_DATA = parseTokens(TOKEN_CATALOG_RAW);

// Mock token lookup
const getTokenByAddress = (addr) => {
  for (const [chain, tokens] of Object.entries(TOKEN_DATA)) {
    if (Array.isArray(tokens)) {
      const t = tokens.find(t => t.address?.toLowerCase() === addr?.toLowerCase());
      if (t) return t;
    }
  }
  return null;
};

// Price table
const TO_USD = {
  ETH: 5000,
  zETH: 5000,
  BNB: 650,
  USDC: 1,
  USDT: 1,
  DAI: 1,
  ZETA: 10,
  WZETA: 10,
  BTC: 100000,
  sBTC: 100000,
  UNKNOWN: 0,
};

const toUSD = (amount, symbol) => {
  const a = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(a)) return 0;
  const normalized = (symbol || '')
    .split('.')[0]
    .toUpperCase()
    .trim();
  const px = TO_USD[normalized] ?? 0;
  const result = a * px;
  return Number.isFinite(result) ? result : 0;
};

async function testDonationFlow() {
  try {
    console.log('🧪 Donation Panel Integration Test');
    console.log('─'.repeat(70));
    console.log();

    const RPC_URL = process.env.NEXT_PUBLIC_ZETA_RPC_URL || 'https://zetachain-athens-evm.blockpi.network/v1/rpc/public';
    const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT || 
                            process.env.NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS;
    
    if (!CONTRACT_ADDRESS) {
      throw new Error('Contract address not configured');
    }

    // Step 1: Fetch recent donations
    console.log('Step 1: Fetching recent donations from blockchain...');
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const blockNumber = await provider.getBlockNumber();
    
    const ABI = [
      'event ContributionReceived(uint256 indexed campaignId, address indexed donor, uint256 indexed contributionId, address originalToken, uint256 originalAmount, uint256 convertedAmount, string originChain, string donorName, string note)',
    ];
    
    const iface = new ethers.Interface(ABI);
    const TOPIC = ethers.id('ContributionReceived(uint256,address,uint256,address,uint256,uint256,string,string,string)');
    
    const LOOKBACK = 5000;
    const fromBlock = Math.max(0, blockNumber - LOOKBACK);
    const CHUNK_SIZE = 4000;
    
    let allLogs = [];
    for (let start = fromBlock; start <= blockNumber; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE - 1, blockNumber);
      const logs = await provider.getLogs({
        address: CONTRACT_ADDRESS,
        topics: [TOPIC],
        fromBlock: start,
        toBlock: end,
      });
      allLogs = allLogs.concat(logs);
    }
    
    console.log(`✓ Found ${allLogs.length} donation events\n`);

    if (allLogs.length === 0) {
      console.log('No donations found. Exiting test.');
      return;
    }

    // Step 2: Process a sample donation through the complete flow
    console.log('Step 2: Processing sample donations through conversion pipeline...');
    console.log('─'.repeat(70));
    
    const donations = [];
    for (const log of allLogs.slice(0, 5)) {
      try {
        const parsed = iface.parseLog({
          topics: log.topics,
          data: log.data,
        });

        if (!parsed) continue;

        const [campaignId, donor, contributionId, originalToken, originalAmount, convertedAmount, originChain, donorName, note] = parsed.args;

        const token = getTokenByAddress(originalToken.toLowerCase());
        const decimals = token?.decimals || 18;
        const tokenSymbol = token?.symbol || 'UNKNOWN';
        
        const formattedAmount = ethers.formatUnits(originalAmount, decimals);
        const baseSymbol = tokenSymbol.split('.')[0];
        const priceSymbol = baseSymbol === 'zETH' ? 'ETH' : baseSymbol;
        const usdValue = toUSD(parseFloat(formattedAmount), priceSymbol);
        
        console.log(`\n📦 Donation #${donations.length + 1}`);
        console.log(`   Campaign: #${campaignId}`);
        console.log(`   Donor: ${donorName || 'Anonymous'}`);
        console.log(`   Token Address: ${originalToken}`);
        console.log(`   Token Symbol (raw): ${tokenSymbol}`);
        console.log(`   Price Symbol (normalized): ${priceSymbol}`);
        console.log(`   Amount: ${parseFloat(formattedAmount).toFixed(6)} ${tokenSymbol}`);
        console.log(`   Price per token: $${TO_USD[priceSymbol] || 0}`);
        console.log(`   USD Value: $${usdValue.toFixed(2)}`);
        
        // Validate the API request format
        if (!Number.isFinite(usdValue) || usdValue <= 0) {
          console.log(`   ⚠️  WARNING: Invalid USD value!`);
        } else {
          console.log(`   ✓ Valid for MongoDB API`);
        }
        
        // Show what gets sent to API
        const apiPayload = {
          amount: usdValue, // Must be a number
          chain: originChain,
          donorName: donorName || 'Anonymous',
          tokenSymbol: 'USD',
          txId: log.transactionHash,
          timestamp: new Date().toISOString()
        };
        
        console.log(`   API Payload:`);
        console.log(`     - amount: ${apiPayload.amount} (type: ${typeof apiPayload.amount})`);
        console.log(`     - chain: "${apiPayload.chain}"`);
        console.log(`     - donorName: "${apiPayload.donorName}"`);
        
        donations.push({
          campaignId: campaignId.toString(),
          symbol: tokenSymbol,
          amount: parseFloat(formattedAmount),
          usd: usdValue,
          tx: log.transactionHash,
        });
      } catch (err) {
        console.error(`   ❌ Failed to process donation:`, err.message);
      }
    }

    // Step 3: Validate all conversions
    console.log('\n' + '─'.repeat(70));
    console.log('Step 3: Validation Summary');
    console.log('─'.repeat(70));
    
    const totalUSD = donations.reduce((sum, d) => sum + d.usd, 0);
    const bySymbol = {};
    for (const d of donations) {
      if (!bySymbol[d.symbol]) bySymbol[d.symbol] = [];
      bySymbol[d.symbol].push(d.usd);
    }
    
    console.log(`\nProcessed ${donations.length} donations:`);
    for (const [symbol, amounts] of Object.entries(bySymbol)) {
      const sum = amounts.reduce((a, b) => a + b, 0);
      console.log(`  ${symbol}: ${amounts.length} donation(s) = $${sum.toFixed(2)}`);
    }
    
    console.log(`\n💰 Total USD Value: $${totalUSD.toFixed(2)}`);
    
    // Step 4: Test token detection
    console.log('\n' + '─'.repeat(70));
    console.log('Step 4: Token Catalog Validation');
    console.log('─'.repeat(70));
    
    if (!TOKEN_CATALOG_RAW) {
      console.log('⚠️  NEXT_PUBLIC_ZRC20_TOKENS not configured!');
      console.log('   Donations will use UNKNOWN symbol and $0 value');
      console.log('   Configure NEXT_PUBLIC_ZRC20_TOKENS in .env to enable token detection');
    } else {
      console.log(`✓ Token catalog loaded`);
      const chainCount = Object.keys(TOKEN_DATA).length;
      let tokenCount = 0;
      for (const tokens of Object.values(TOKEN_DATA)) {
        if (Array.isArray(tokens)) tokenCount += tokens.length;
      }
      console.log(`  ${chainCount} chain(s) with ${tokenCount} token(s) configured`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testDonationFlow();
