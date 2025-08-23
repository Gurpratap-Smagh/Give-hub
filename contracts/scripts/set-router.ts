import { ethers } from 'ethers';
import CrossChainCrowdfund from '../artifacts/contracts/CrossChainCrowdfund.sol/CrossChainCrowdfund.json';
import 'dotenv/config';

async function main() {
  if (!process.env.PRIVATE_KEY) throw new Error('PRIVATE_KEY not set');
  if (!process.env.RPC_URL) throw new Error('RPC_URL not set');
  if (!process.env.UNISWAP_ROUTER_ADDRESS) throw new Error('UNISWAP_ROUTER_ADDRESS not set');

  // Parse CLI flags: -c or --contract to override CONTRACT_ADDRESS
  const argv = process.argv.slice(2);
  let cliContract: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-c' || arg === '--contract') {
      cliContract = argv[i + 1];
      i++;
    }
  }
  const contractAddress = cliContract ?? process.env.CONTRACT_ADDRESS;
  if (!contractAddress) throw new Error('CONTRACT_ADDRESS not set (use -c or set env)');

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const contract = new ethers.Contract(
    contractAddress,
    CrossChainCrowdfund.abi,
    wallet
  );

  // Read current router
  const currentRouter: string = await contract.router();
  console.log('Current router():', currentRouter);

  const desired = process.env.UNISWAP_ROUTER_ADDRESS;
  if (currentRouter && desired && currentRouter.toLowerCase() === desired.toLowerCase()) {
    console.log('Router already set to desired address. Nothing to do.');
    return;
  }

  console.log(`Setting router on ${contractAddress} to ${desired}...`);
  const tx = await contract.setUniswapRouter(desired);
  console.log('Transaction sent:', tx.hash);

  await tx.wait(1);
  console.log('Router set successfully!');

  const verified: string = await contract.router();
  console.log('Verified router address on contract:', verified);

  if (verified.toLowerCase() !== desired.toLowerCase()) {
    throw new Error('Router address verification failed!');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
