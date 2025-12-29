import { expect } from "chai";
import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

describe("CrossChainCrowdfund - Admin & Creation Tests", function () {
  let crowdfund: any;
  let owner: any;
  
  const contractAddress = process.env.CROWDFUND_ADDRESS || "";
  
  // FIX: Force lowercase then getAddress to ensure a valid EIP-55 checksum
  const ZRC20_ETH = ethers.getAddress("0x1336aC9170E79d64d036880feBc8293735a6E75e".toLowerCase());
  const ZRC20_USDC = ethers.getAddress("0x2e234DAe75C793f67A35089C9d99245E1C58470b".toLowerCase());

  before(async function () {
    [owner] = await ethers.getSigners();
    
    if (!contractAddress) {
      throw new Error("CROWDFUND_ADDRESS not found in .env. Run deployment first!");
    }

    const Crowdfund = await ethers.getContractFactory("CrossChainCrowdfund");
    crowdfund = Crowdfund.attach(contractAddress);
    
    console.log("\n--------------------------------------------------");
    console.log("Testing with account (Owner):", owner.address);
    console.log("Contract Address:           ", contractAddress);
    console.log("--------------------------------------------------");
  });

  it("Should whitelist the ZRC20 tokens", async function () {
    console.log("Step 1: Whitelisting tokens...");
    
    // Whitelist ETH
    const tx1 = await crowdfund.setAllowedOutToken(ZRC20_ETH, true);
    await tx1.wait();
    
    // Whitelist USDC
    const tx2 = await crowdfund.setAllowedOutToken(ZRC20_USDC, true);
    await tx2.wait();
    
    expect(await crowdfund.allowedOutTokens(ZRC20_ETH)).to.equal(true);
    expect(await crowdfund.allowedOutTokens(ZRC20_USDC)).to.equal(true);
    console.log("✅ ETH and USDC whitelisted successfully!");
  });

  it("Should create a new campaign", async function () {
    console.log("\nStep 2: Creating a campaign with ZRC20_ETH...");
    
    const tx = await crowdfund.createCampaign(ZRC20_ETH); //
    const receipt = await tx.wait();

    // Parse logs to find the campaignId from the event
    const event = receipt.logs
      .map((log: any) => {
        try { return crowdfund.interface.parseLog(log); } catch (e) { return null; }
      })
      .find((e: any) => e && e.name === "CampaignCreated");

    if (!event) throw new Error("CampaignCreated event not found!");

    const campaignId = event.args.campaignId;
    console.log("✅ Campaign Created! ID:", campaignId.toString());

    // Verify the data was stored correctly
    const info = await crowdfund.getCampaignInfo(campaignId);
    
    console.log("--------------------------------------------------");
    console.log("VERIFIED CAMPAIGN INFO:");
    console.log("ID:             ", info.campaignId.toString());
    console.log("Creator:        ", info.creator);
    console.log("Preferred Token:", info.preferredZRC20);
    console.log("Is Active:      ", info.active);
    console.log("--------------------------------------------------");

    expect(info.creator).to.equal(owner.address);
    expect(info.preferredZRC20).to.equal(ZRC20_ETH);
  });
});
