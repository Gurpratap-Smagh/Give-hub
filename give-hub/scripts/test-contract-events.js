import { ethers } from 'ethers';
import 'dotenv/config';

// --- 1. SETTINGS ---
const RPC_URL = process.env.NEXT_PUBLIC_ZETA_RPC_URL;
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CROWDFUND_ADDRESS;
const CHUNK_SIZE = 4500; 

// The precise ABI for your event
const ABI = [
    "event ContributionReceived(uint256 indexed campaignId, address indexed donor, uint256 indexed contributionId, address originalToken, uint256 originalAmount, uint256 convertedAmount, string originChain, string donorName, string note)"
];
const iface = new ethers.Interface(ABI);
const EVENT_TOPIC = ethers.id("ContributionReceived(uint256,address,uint256,address,uint256,uint256,string,string,string)");

// Mock Price Table (Matching your provided logic)
const TO_USD = { ETH: 2600, zETH: 2600, BNB: 600, zBNB: 600, USDC: 1, ZETA: 0.70, UNKNOWN: 0 };

const fetchAndParse = async () => {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const latestBlock = await provider.getBlockNumber();
    let currentToBlock = latestBlock;
    const startBlock = latestBlock - 500000;

    console.log(`🚀 Parsing Give-hub events from ${latestBlock}...`);

    while (currentToBlock > startBlock) {
        let currentFromBlock = Math.max(startBlock, currentToBlock - CHUNK_SIZE);
        
        const logs = await provider.getLogs({
            address: CONTRACT_ADDRESS,
            topics: [EVENT_TOPIC],
            fromBlock: currentFromBlock,
            toBlock: currentToBlock
        });

        for (const log of logs) {
            try {
                const parsed = iface.parseLog(log);
                const [campaignId, donor, , originalToken, originalAmount, , originChain, donorName, note] = parsed.args;

                // Simple amount formatting (assuming 18 decimals for test tokens)
                const amt = parseFloat(ethers.formatUnits(originalAmount, 18));
                const usdValue = amt * (TO_USD.BNB); // Defaulting to BNB for your BSC Testnet logs

                console.log(`\n✨ [BLOCK ${log.blockNumber}]`);
                console.log(`📢 CAMPAIGN:  #${campaignId}`);
                console.log(`👤 DONOR:     ${donorName || 'Anonymous'}`);
                console.log(`💰 VALUE:     $${usdValue.toFixed(2)} (${amt.toFixed(4)} Tokens)`);
                console.log(`🔗 CHAIN:     ${originChain}`);
                console.log(`📝 NOTE:      "${note}"`);
                console.log(`──────────────────────────────────────────────────`);
            } catch (e) {
                console.log("❌ Failed to parse log data:", log.transactionHash);
            }
        }

        currentToBlock = currentFromBlock - 1;
    }
};

fetchAndParse();