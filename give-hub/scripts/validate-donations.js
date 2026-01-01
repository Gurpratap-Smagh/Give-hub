import { ethers } from 'ethers';
import 'dotenv/config';

const RPC_URL = process.env.NEXT_PUBLIC_ZETA_RPC_URL;
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CROWDFUND_ADDRESS;
const CHUNK_SIZE = 4500; // BlockPI safe limit
const EVENT_TOPIC = "0xc651bb5718cda0929dca50389be20dbd9410697ae1db9cd889366f95d8bd0a7e";

const fetchEvents = async () => {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    
    try {
        const latestBlock = await provider.getBlockNumber();
        // Adjust this to go as far back as your deployment block
        const startSearchBlock = latestBlock - 1000000; 

        let currentToBlock = latestBlock;
        let totalFound = 0;

        console.log(`🚀 Scanning blocks... (Streaming results live)`);

        while (currentToBlock > startSearchBlock) {
            let currentFromBlock = currentToBlock - CHUNK_SIZE;
            if (currentFromBlock < startSearchBlock) currentFromBlock = startSearchBlock;

            process.stdout.write(`🔎 ${currentFromBlock} -> ${currentToBlock}\r`); // Progress indicator

            const logs = await provider.getLogs({
                address: CONTRACT_ADDRESS,
                topics: [EVENT_TOPIC],
                fromBlock: currentFromBlock,
                toBlock: currentToBlock
            });

            if (logs.length > 0) {
                console.log(`\n✨ Found ${logs.length} event(s) in chunk ${currentFromBlock}-${currentToBlock}:`);
                
                logs.forEach((log, index) => {
                    totalFound++;
                    console.log(`  [${totalFound}] Tx: ${log.transactionHash}`);
                    console.log(`      Block: ${log.blockNumber}`);
                    // Optional: trim the data for cleaner logs
                    console.log(`      Data: ${log.data.substring(0, 66)}...`); 
                });
                console.log('--------------------------------------------------');
            }

            currentToBlock = currentFromBlock - 1;
        }

        console.log(`\n✅ Finished scan. Total events retrieved: ${totalFound}`);

    } catch (err) {
        console.error("\n❌ RPC Error:", err.message);
    }
};

fetchEvents();