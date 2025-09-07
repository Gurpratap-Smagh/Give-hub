import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import CrossChainCrowdfundABI from "../artifacts/contracts/CrossChainCrowdfund.sol/CrossChainCrowdfund.json";

dotenv.config();

async function main() {
  const PRIVATE_KEY = process.env.PRIVATE_KEY as string;
  const RPC_URL = process.env.RPC_URL as string;
  const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS as string;

  if (!PRIVATE_KEY || !RPC_URL || !CONTRACT_ADDRESS) {
    throw new Error("Missing env vars: PRIVATE_KEY, RPC_URL, CONTRACT_ADDRESS");
  }

  // Connect provider + wallet
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  // Contract instance
  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    CrossChainCrowdfundABI.abi,
    wallet
  );

  console.log(`Toggling debug ON for ${CONTRACT_ADDRESS}...`);

  const tx = await contract.setDebug(true); // flip to false to disable
  await tx.wait();

  console.log(`✅ Debug toggled. Tx: ${tx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
