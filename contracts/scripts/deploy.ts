import { ethers, upgrades } from "hardhat";
import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const Crowdfund = await ethers.getContractFactory("CrossChainCrowdfund");

  console.log("Deploying Proxy...");
  // This helper handles: 1. Deploying Implementation, 2. Deploying Proxy, 3. Calling initialize()
  const crowdfund = await upgrades.deployProxy(Crowdfund, [
    process.env.UNISWAP_ROUTER,
    Number(process.env.GAS_LIMIT || 100000)
  ], { initializer: 'initialize', kind: 'uups', unsafeAllow: ["constructor", "state-variable-immutable"] });
  

  await crowdfund.waitForDeployment();
  const proxyAddress = await crowdfund.getAddress();
  
  console.log("🚀 Proxy deployed to:", proxyAddress);

  // Update .env
  const envPath = path.join(process.cwd(), ".env");
  let envContent = fs.readFileSync(envPath, "utf-8");
  envContent = envContent.split("\n").filter(line => !line.startsWith("CROWDFUND_ADDRESS=")).join("\n");
  envContent += `\nCROWDFUND_ADDRESS=${proxyAddress}`;
  fs.writeFileSync(envPath, envContent);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
