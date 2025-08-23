import { ethers } from "hardhat";

async function main() {
  console.log("🚀 Deploying Donations contract to ZetaChain Athens testnet...");
  
  // Get the contract factory
  const Donations = await ethers.getContractFactory("Donations");
  
  // Set fee recipient (you can change this to your preferred address)
  const feeRecipient = process.env.FEE_RECIPIENT || "0x742d35Cc6B8D30C0C13b4C5BFaE7a3b15C0B0a1D";
  
  console.log(`📍 Fee recipient: ${feeRecipient}`);
  console.log(`🔗 Deploying to network: ${(await ethers.provider.getNetwork()).name || 'ZetaChain Athens'}`);
  
  // Deploy the contract
  const donations = await Donations.deploy(feeRecipient);
  
  // Wait for deployment to complete
  await donations.waitForDeployment();
  
  const contractAddress = await donations.getAddress();
  
  console.log("\n✅ Donations contract deployed successfully!");
  console.log(`📮 Contract address: ${contractAddress}`);
  console.log(`🔍 Etherscan: https://zetachain-athens-3.blockscout.com/address/${contractAddress}`);
  
  console.log("\n📋 Add this to your .env.local:");
  console.log(`NEXT_PUBLIC_DONATION_CONTRACT=${contractAddress}`);
  
  // Verify contract deployment by checking if code exists
  const code = await ethers.provider.getCode(contractAddress);
  if (code !== "0x") {
    console.log("✅ Contract deployment verified - code exists on blockchain");
    
    // Get initial contract state
    const platformFee = await donations.platformFeeBps();
    const owner = await donations.owner();
    const paused = await donations.paused();
    
    console.log("\n📊 Initial contract state:");
    console.log(`   Owner: ${owner}`);
    console.log(`   Platform fee: ${platformFee} bps (${platformFee / 100}%)`);
    console.log(`   Paused: ${paused}`);
  } else {
    console.error("❌ Deployment failed - no code found at address");
    process.exit(1);
  }
  
  console.log("\n🎉 Deployment complete!");
  console.log("\nNext steps:");
  console.log("1. Add the contract address to your frontend .env.local");
  console.log("2. Fund the deployer address with ZETA for gas fees");
  console.log("3. Test donations with the frontend");
}

// Handle errors
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
