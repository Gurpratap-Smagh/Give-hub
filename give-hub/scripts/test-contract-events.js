const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Load environment variables manually
const envPath = path.join(__dirname, '../.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');
const env = {};

envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
});

const CROWDFUND_ABI = [
  "event CampaignCreated(uint256 indexed campaignId, address indexed creator, address preferredZRC20)",
  "event ContributionReceived(uint256 indexed campaignId, address indexed donor, uint256 indexed contributionId, address originalToken, uint256 originalAmount, uint256 convertedAmount, string originChain, string donorName, string note)",
  "event AllowedInTokenSet(address token, bool allowed)",
  "event AllowedOutTokenSet(address token, bool allowed)",
  "event SlippageUpdated(uint256 bps)",
  "event OwnershipTransferred(address indexed prev, address indexed next)",
  "event Rescue(address indexed token, address indexed to, uint256 amount)",
  "event DebugToggle(bool enabled)",
  "event DebugOnCallEntered(bytes originSender, uint256 originChainId, address zrc20In, uint256 amount)",
  "event DebugDecodedDonate(uint256 campaignId, string donorName, string note)",
  "event DebugDonationBegin(uint256 campaignId, address creator, address tokenIn, uint256 amountIn)",
  "event DebugRouterSet(address router)",
  "event DebugRouterMissing()",
  "event DebugApproveReset(address token, uint256 amount)",
  "event DebugApprove(address token, uint256 amount)",
  "event DebugSwapPlanned(address tokenIn, address tokenOut, uint256 amountIn, uint256 pathLen)",
  "event DebugSwapSucceeded(uint256 amountOut)",
  "event DebugSwapFailed(string reason)",
  "event DebugSwapFailedBytes(bytes lowLevelData)",
  "event DebugTransferOut(address token, address to, uint256 amount)",
  "event DebugContributionRecorded(uint256 id)"
];

function validateConfig() {
  const rpcUrl = env.NEXT_PUBLIC_ZETA_RPC_URL || env.NEXT_PUBLIC_ZETA_RPC_HTTP;
  const contractAddress = env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT;
  const chainId = Number(env.NEXT_PUBLIC_ZETA_CHAIN_ID || 7001);

  if (!rpcUrl) {
    throw new Error('Missing RPC URL. Set NEXT_PUBLIC_ZETA_RPC_URL in .env.local');
  }
  if (!contractAddress) {
    throw new Error('Missing contract address. Set NEXT_PUBLIC_CROSSCHAIN_CONTRACT in .env.local');
  }

  return {
    rpcUrl,
    contractAddress,
    chainId,
    lookbackBlocks: 5000,
    batchSize: 500
  };
}

function formatTokenAmount(amount, decimals = 18) {
  return ethers.formatUnits(amount, decimals);
}

function formatEvent(log, parsed) {
  const eventName = parsed.name;
  console.log(`\n📋 Event: ${eventName}`);
  console.log(`   Block: ${log.blockNumber}`);
  console.log(`   TX: ${log.transactionHash}`);
  console.log(`   Log Index: ${log.index}`);

  switch (eventName) {
    case 'CampaignCreated':
      console.log(`   📢 Campaign ID: ${parsed.args[0]}`);
      console.log(`   👤 Creator: ${parsed.args[1]}`);
      console.log(`   💰 Preferred Token: ${parsed.args[2]}`);
      break;

    case 'ContributionReceived':
      console.log(`   📢 Campaign ID: ${parsed.args[0]}`);
      console.log(`   👤 Donor: ${parsed.args[1]}`);
      console.log(`   🆔 Contribution ID: ${parsed.args[2]}`);
      console.log(`   🪙 Original Token: ${parsed.args[3]}`);
      console.log(`   💵 Original Amount: ${formatTokenAmount(parsed.args[4])}`);
      console.log(`   💰 Converted Amount: ${formatTokenAmount(parsed.args[5])}`);
      console.log(`   🌐 Origin Chain: ${parsed.args[6]}`);
      console.log(`   📝 Donor Name: ${parsed.args[7]}`);
      console.log(`   💬 Note: ${parsed.args[8]}`);
      break;

    case 'DebugDonationBegin':
      console.log(`   📢 Campaign ID: ${parsed.args[0]}`);
      console.log(`   👤 Creator: ${parsed.args[1]}`);
      console.log(`   🪙 Token In: ${parsed.args[2]}`);
      console.log(`   💵 Amount In: ${formatTokenAmount(parsed.args[3])}`);
      break;

    case 'DebugContributionRecorded':
      console.log(`   🆔 Contribution ID: ${parsed.args[0]}`);
      break;

    case 'AllowedInTokenSet':
    case 'AllowedOutTokenSet':
      console.log(`   🪙 Token: ${parsed.args[0]}`);
      console.log(`   ✅ Allowed: ${parsed.args[1]}`);
      break;

    case 'OwnershipTransferred':
      console.log(`   👤 Previous Owner: ${parsed.args[0]}`);
      console.log(`   👤 New Owner: ${parsed.args[1]}`);
      break;

    default:
      // Generic event display
      for (let i = 0; i < parsed.args.length; i++) {
        console.log(`   Arg ${i}: ${parsed.args[i]}`);
      }
  }
}

async function fetchContractEvents(config) {
  console.log('🔍 Contract Event Scanner');
  console.log('='.repeat(50));
  console.log(`📡 RPC URL: ${config.rpcUrl}`);
  console.log(`📜 Contract: ${config.contractAddress}`);
  console.log(`⛓️  Chain ID: ${config.chainId}`);
  console.log(`🔙 Lookback: ${config.lookbackBlocks} blocks`);
  console.log('='.repeat(50));

  const provider = new ethers.JsonRpcProvider(config.rpcUrl, {
    name: "zetachain-athens",
    chainId: config.chainId
  });

  const iface = new ethers.Interface(CROWDFUND_ABI);

  try {
    const currentBlock = await provider.getBlockNumber();
    console.log(`📊 Current block: ${currentBlock}\n`);

    const startBlock = Math.max(0, currentBlock - config.lookbackBlocks);
    
    let donationCount = 0;
    let campaignCount = 0;
    let debugEventCount = 0;
    let otherEventCount = 0;
    let totalEvents = 0;

    console.log(`🔎 Scanning blocks ${startBlock} to ${currentBlock}...\n`);

    // Scan in batches to avoid rate limits
    for (let from = startBlock; from <= currentBlock; from += config.batchSize) {
      const to = Math.min(currentBlock, from + config.batchSize - 1);
      
      try {
        const logs = await provider.getLogs({
          address: config.contractAddress,
          fromBlock: from,
          toBlock: to
        });

        for (const log of logs) {
          try {
            const parsed = iface.parseLog(log);
            if (parsed) {
              formatEvent(log, parsed);
              totalEvents++;
              
              // Count events by type
              switch (parsed.name) {
                case 'ContributionReceived':
                  donationCount++;
                  break;
                case 'CampaignCreated':
                  campaignCount++;
                  break;
                case 'DebugToggle':
                case 'DebugOnCallEntered':
                case 'DebugDecodedDonate':
                case 'DebugDonationBegin':
                case 'DebugRouterSet':
                case 'DebugRouterMissing':
                case 'DebugApproveReset':
                case 'DebugApprove':
                case 'DebugSwapPlanned':
                case 'DebugSwapSucceeded':
                case 'DebugSwapFailed':
                case 'DebugSwapFailedBytes':
                case 'DebugTransferOut':
                case 'DebugContributionRecorded':
                  debugEventCount++;
                  break;
                default:
                  otherEventCount++;
              }
            }
          } catch (parseError) {
            console.log(`❌ Failed to parse log at block ${log.blockNumber}: ${parseError.message}`);
          }
        }

        if (logs.length > 0) {
          console.log(`✅ Processed blocks ${from}-${to}: found ${logs.length} events`);
        }

      } catch (batchError) {
        console.error(`❌ Error fetching logs for blocks ${from}-${to}:`, batchError.message);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 EVENT SUMMARY');
    console.log('='.repeat(50));
    console.log(`💰 Donations: ${donationCount}`);
    console.log(`📢 Campaigns: ${campaignCount}`);
    console.log(`🐛 Debug Events: ${debugEventCount}`);
    console.log(`📝 Other Events: ${otherEventCount}`);
    console.log(`📊 Total Events: ${totalEvents}`);

  } catch (error) {
    console.error('❌ Failed to fetch events:', error.message);
    throw error;
  }
}

async function testWebSocketConnection(config) {
  console.log('\n🔌 Testing WebSocket Connection');
  console.log('='.repeat(50));

  const wsUrl = env.NEXT_PUBLIC_ZETA_RPC_WS;
  if (!wsUrl) {
    console.log('❌ No WebSocket URL configured (NEXT_PUBLIC_ZETA_RPC_WS)');
    return;
  }

  console.log(`📡 WebSocket URL: ${wsUrl}`);

  try {
    const wsProvider = new ethers.WebSocketProvider(wsUrl);
    
    console.log('🔗 Connecting to WebSocket...');
    
    // Test connection
    const currentBlock = await wsProvider.getBlockNumber();
    console.log(`✅ Connected! Current block: ${currentBlock}`);
    
    // Test event subscription
    console.log('👂 Setting up event listeners...');
    
    const donationFilter = {
      address: config.contractAddress,
      topics: [ethers.id("ContributionReceived(uint256,address,uint256,address,uint256,uint256,string,string,string)")]
    };

    const campaignFilter = {
      address: config.contractAddress,
      topics: [ethers.id("CampaignCreated(uint256,address,address)")]
    };

    let eventCount = 0;

    wsProvider.on(donationFilter, (log) => {
      eventCount++;
      console.log(`🎉 LIVE DONATION EVENT #${eventCount} RECEIVED: ${log.transactionHash}`);
    });

    wsProvider.on(campaignFilter, (log) => {
      eventCount++;
      console.log(`🎉 LIVE CAMPAIGN EVENT #${eventCount} RECEIVED: ${log.transactionHash}`);
    });

    console.log('✅ Event listeners configured');
    console.log('🔥 WebSocket is ready for live events!');
    
    // Keep connection alive for 5 seconds to test
    console.log('⏳ Testing for 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    wsProvider.removeAllListeners();
    wsProvider.destroy();
    console.log(`✅ WebSocket test completed (caught ${eventCount} live events)`);

  } catch (error) {
    console.error('❌ WebSocket connection failed:', error.message);
  }
}

async function main() {
  console.log('🚀 CrossChainCrowdfund Event Tester');
  console.log('=' .repeat(60));
  
  try {
    const config = validateConfig();
    
    // Test 1: Fetch historical events
    await fetchContractEvents(config);
    
    // Test 2: Test WebSocket connection
    await testWebSocketConnection(config);
    
    console.log('\n✅ All tests completed successfully!');
    console.log('\n📖 Usage:');
    console.log('   To run this test: npm run test:events');
    console.log('   Or directly: node scripts/test-contract-events.js');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
