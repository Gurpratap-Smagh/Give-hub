const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

// Load .env (prefer project .env)
const dotenvPath = path.join(__dirname, '../.env');
if (fs.existsSync(dotenvPath)) {
  const dotenv = fs.readFileSync(dotenvPath, 'utf8');
  dotenv.split(/\r?\n/).forEach(line => {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  });
}

// Prefer HTTP RPC polling because some public WS providers do not support eth_subscribe
const httpUrl = process.env.NEXT_PUBLIC_ZETA_RPC_URL || process.env.NEXT_PUBLIC_ZETA_RPC_HTTP;
const wsUrl = process.env.NEXT_PUBLIC_ZETA_RPC_WS && !httpUrl ? process.env.NEXT_PUBLIC_ZETA_RPC_WS : '';
const contractAddress = process.env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT || process.env.NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_CROWDFUND_ADDRESS;

if (!contractAddress) {
  console.error('No contract address found in env');
  process.exit(1);
}

const CROWDFUND_ABI = [
  "event ContributionReceived(uint256 indexed campaignId, address indexed donor, uint256 indexed contributionId, address originalToken, uint256 originalAmount, uint256 convertedAmount, string originChain, string donorName, string note)",
];

(async () => {
  try {
    const iface = new ethers.Interface(CROWDFUND_ABI);
    let topic;
    if (typeof iface.getEventTopic === 'function') {
      topic = iface.getEventTopic('ContributionReceived');
    } else {
      // Fallback for environments where Interface lacks getEventTopic
      topic = ethers.id('ContributionReceived(uint256,address,uint256,address,uint256,uint256,string,string,string)');
    }
    console.log('Using topic:', topic);

    if (wsUrl) {
      console.log('Connecting via WS:', wsUrl);
      const provider = new ethers.WebSocketProvider(wsUrl);
      provider.on({ address: contractAddress, topics: [topic] }, (log) => {
        console.log('WS log received:', log.transactionHash, 'index', log.index);
        try {
          const parsed = iface.parseLog(log);
          console.log('Parsed event:', parsed.name, parsed.args);
        } catch (e) {
          console.error('Parse error:', e);
        }
      });

      console.log('Waiting for 15s for live events...');
      await new Promise(r => setTimeout(r, 15000));
      provider.removeAllListeners();
      await provider.destroy();
      console.log('WS test done');
      process.exit(0);
    }

    if (httpUrl) {
      console.log('Polling via HTTP RPC:', httpUrl);
      const provider = new ethers.JsonRpcProvider(httpUrl);
      const latest = await provider.getBlockNumber();
      const from = Math.max(0, latest - 5000);
      console.log('Checking logs from', from, 'to', latest);
      const logs = await provider.getLogs({ address: contractAddress, topics: [topic], fromBlock: from, toBlock: latest });
      console.log('Found logs:', logs.length);
      for (const log of logs.slice(-10)) {
        try {
          const parsed = iface.parseLog(log);
          console.log('Log', log.transactionHash, 'parsed', parsed.name, parsed.args);
        } catch (e) {
          console.error('Parse error', e);
        }
      }
      process.exit(0);
    }

    console.error('No RPC URL configured (WS or HTTP)');
    process.exit(1);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
