import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const [signer] = await ethers.getSigners();
  const contractAddress = process.env.CROWDFUND_ADDRESS;

  if (!contractAddress) {
    throw new Error("CROWDFUND_ADDRESS not found in .env");
  }

  console.log("--------------------------------------------------");
  console.log("Testing with account (Owner):", signer.address);
  console.log("Contract Address:           ", contractAddress);
  console.log("--------------------------------------------------");

  const Crowdfund = await ethers.getContractFactory("CrossChainCrowdfund");
  const crowdfund = Crowdfund.attach(contractAddress) as any;

  // 1. Whitelist the token first
  // This mock address must be allowed because createCampaign checks the whitelist
  const mockZRC20 = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; 
  
  console.log("Step 1: Whitelisting payout token...");
  const allowTx = await crowdfund.setAllowedOutToken(mockZRC20, true);
  await allowTx.wait();
  console.log("✅ Token whitelisted!");

  // 2. Create the Campaign
  console.log("\nStep 2: Creating campaign...");
  const tx = await crowdfund.createCampaign(mockZRC20);
  const receipt = await tx.wait();

  // Parse the logs to find the CampaignCreated event
  const event = receipt.logs
    .map((log: any) => {
      try {
        return crowdfund.interface.parseLog(log);
      } catch (e) {
        return null;
      }
    })
    .find((e: any) => e && e.name === "CampaignCreated");

  if (!event) throw new Error("CampaignCreated event not found!");

  const campaignId = event.args.campaignId;
  console.log("✅ Campaign Created! ID:", campaignId.toString());

  // 3. Fetch and Print Campaign Info
  console.log("\nStep 3: Fetching campaign details...");
  const info = await crowdfund.getCampaignInfo(campaignId);

  console.log("--------------------------------------------------");
  console.log("CAMPAIGN DETAILS:");
  console.log("ID:             ", info.campaignId.toString());
  console.log("Creator:        ", info.creator);
  console.log("Preferred Token:", info.preferredZRC20);
  console.log("Is Active:      ", info.active);
  console.log("--------------------------------------------------");

  const [exists, active] = await crowdfund.campaignStatus(campaignId);
  console.log(`Status Check -> Exists: ${exists}, Active: ${active}`);
}

main().catch((error) => {
  console.error("❌ Test failed:", error);
  process.exitCode = 1;
});
