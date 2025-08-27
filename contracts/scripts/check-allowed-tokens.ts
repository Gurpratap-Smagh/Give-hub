import * as dotenv from "dotenv";
dotenv.config();

import hardhat from "hardhat";
const hre: any = hardhat;
const { ethers } = hre;

function req(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing ${name} in .env`);
  return v.trim();
}

async function main() {
  const CONTRACT_ADDRESS = req("CONTRACT_ADDRESS");
  
  const [signer] = await ethers.getSigners();
  
  const contract = await ethers.getContractAt("CrossChainCrowdfund", CONTRACT_ADDRESS, signer);
  
  console.log("🔍 Checking allowed tokens configuration...");
  
  // Check the token addresses from env
  const BTC_ZRC20 = process.env.BTC_ZRC20;
  const ETH_ZRC20 = process.env.ETH_ZRC20;
  const USDC_ZRC20 = process.env.USDC_ZRC20;
  const WZETA_ADDRESS = process.env.WZETA_ADDRESS;
  
  console.log("\n📍 Token addresses from env:");
  console.log("BTC_ZRC20:", BTC_ZRC20);
  console.log("ETH_ZRC20:", ETH_ZRC20);
  console.log("USDC_ZRC20:", USDC_ZRC20);
  console.log("WZETA_ADDRESS:", WZETA_ADDRESS);
  
  // Check allowed tokens
  console.log("\n✅ Allowed tokens in contract:");
  
  if (BTC_ZRC20) {
    const btcAllowedIn = await contract.allowedInTokens(BTC_ZRC20);
    const btcAllowedOut = await contract.allowedOutTokens(BTC_ZRC20);
    console.log(`BTC (${BTC_ZRC20}): in=${btcAllowedIn}, out=${btcAllowedOut}`);
  }
  
  if (ETH_ZRC20) {
    const ethAllowedIn = await contract.allowedInTokens(ETH_ZRC20);
    const ethAllowedOut = await contract.allowedOutTokens(ETH_ZRC20);
    console.log(`ETH (${ETH_ZRC20}): in=${ethAllowedIn}, out=${ethAllowedOut}`);
  }
  
  if (USDC_ZRC20) {
    const usdcAllowedIn = await contract.allowedInTokens(USDC_ZRC20);
    const usdcAllowedOut = await contract.allowedOutTokens(USDC_ZRC20);
    console.log(`USDC (${USDC_ZRC20}): in=${usdcAllowedIn}, out=${usdcAllowedOut}`);
  }
  
  if (WZETA_ADDRESS) {
    const wzetaAllowedIn = await contract.allowedInTokens(WZETA_ADDRESS);
    const wzetaAllowedOut = await contract.allowedOutTokens(WZETA_ADDRESS);
    console.log(`WZETA (${WZETA_ADDRESS}): in=${wzetaAllowedIn}, out=${wzetaAllowedOut}`);
  }
  
  // Check router
  const router = await contract.router();
  console.log(`\n🔄 Router address: ${router}`);
  
  // Check if router is set
  if (router === ethers.ZeroAddress) {
    console.log("❌ Router is not set!");
  } else {
    console.log("✅ Router is configured");
  }
}

main().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});
