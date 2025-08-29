import * as dotenv from "dotenv";
dotenv.config();

import hardhat from "hardhat";
const { ethers } = hardhat;

async function main() {
  try {
    console.log("Starting script...");
    
    const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
    if (!CONTRACT_ADDRESS) throw new Error("CONTRACT_ADDRESS missing in .env");

    const [signer] = await ethers.getSigners();
    console.log(`Using account: ${signer.address}`);

    const contract = await ethers.getContractAt(
      "CrossChainCrowdfund", 
      CONTRACT_ADDRESS, 
      signer
    );

    console.log("Connected to contract at:", CONTRACT_ADDRESS);
    
    console.log("Checking allowed tokens on ZetaChain testnet (7001)");
    
    // Check allowed payout tokens by reading storage directly
    console.log("\n✅ Allowed payout tokens in contract:");
    
    // Known tokens from constructor
    const knownTokens = [
      process.env.WZETA_ADDRESS,
      process.env.ETH_ZRC20,
      process.env.BTC_ZRC20,
      process.env.USDC_ZRC20
    ].filter(t => t);
    
    for (const token of knownTokens) {
      try {
        // Calculate storage slot for mapping
        const slot = ethers.utils.keccak256(
          ethers.utils.defaultAbiCoder.encode(
            ["address", "uint256"],
            [token, 0] // key, mapping position
          )
        );
        
        // Read storage slot
        const isAllowed = await ethers.provider.getStorageAt(
          CONTRACT_ADDRESS,
          slot
        );
        
        // Convert to boolean (0x0...0 = false, anything else = true)
        const allowed = isAllowed !== "0x0000000000000000000000000000000000000000000000000000000000000000";
        console.log(`${token}: ${allowed ? '✅ ALLOWED' : '❌ NOT ALLOWED'}`);
      } catch (error) {
        console.error(`Error checking token ${token}:`, error);
      }
    }

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
      try {
        const btcAllowedIn = await contract.allowedInTokens(BTC_ZRC20);
        const btcAllowedOut = await contract.allowedOutTokens(BTC_ZRC20);
        console.log(`BTC (${BTC_ZRC20}): in=${btcAllowedIn}, out=${btcAllowedOut}`);
      } catch (error) {
        console.error(`Error checking BTC (${BTC_ZRC20}):`, error);
      }
    }
    
    if (ETH_ZRC20) {
      try {
        const ethAllowedIn = await contract.allowedInTokens(ETH_ZRC20);
        const ethAllowedOut = await contract.allowedOutTokens(ETH_ZRC20);
        console.log(`ETH (${ETH_ZRC20}): in=${ethAllowedIn}, out=${ethAllowedOut}`);
      } catch (error) {
        console.error(`Error checking ETH (${ETH_ZRC20}):`, error);
      }
    }
    
    if (USDC_ZRC20) {
      try {
        const usdcAllowedIn = await contract.allowedInTokens(USDC_ZRC20);
        const usdcAllowedOut = await contract.allowedOutTokens(USDC_ZRC20);
        console.log(`USDC (${USDC_ZRC20}): in=${usdcAllowedIn}, out=${usdcAllowedOut}`);
      } catch (error) {
        console.error(`Error checking USDC (${USDC_ZRC20}):`, error);
      }
    }
    
    if (WZETA_ADDRESS) {
      try {
        const wzetaAllowedIn = await contract.allowedInTokens(WZETA_ADDRESS);
        const wzetaAllowedOut = await contract.allowedOutTokens(WZETA_ADDRESS);
        console.log(`WZETA (${WZETA_ADDRESS}): in=${wzetaAllowedIn}, out=${wzetaAllowedOut}`);
      } catch (error) {
        console.error(`Error checking WZETA (${WZETA_ADDRESS}):`, error);
      }
    }
    
    // Check router
    try {
      const router = await contract.router();
      console.log(`\n🔄 Router address: ${router}`);
    } catch (error) {
      console.error("Error checking router:", error);
    }
    
    // Check if router is set
    try {
      const router = await contract.router();
      if (router === ethers.constants.AddressZero) {
        console.log("❌ Router is not set!");
      } else {
        console.log("✅ Router is configured");
      }
    } catch (error) {
      console.error("Error checking router:", error);
    }
  } catch (error) {
    console.error("Script failed:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
