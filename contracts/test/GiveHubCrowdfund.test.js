const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GiveHubCrowdfund", function () {
  let crowdfund;
  let owner, creator, donor1, donor2, feeRecipient;
  let mockSystemContract, mockWZETA, mockZRC20;

  beforeEach(async function () {
    [owner, creator, donor1, donor2, feeRecipient] = await ethers.getSigners();

    // Deploy mock contracts
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockWZETA = await MockERC20.deploy("Wrapped ZETA", "WZETA", 18);
    mockZRC20 = await MockERC20.deploy("Mock ZRC20", "MZRC", 18);
    
    const MockSystemContract = await ethers.getContractFactory("MockSystemContract");
    mockSystemContract = await MockSystemContract.deploy();

    // Deploy main contract
    const GiveHubCrowdfund = await ethers.getContractFactory("GiveHubCrowdfund");
    crowdfund = await GiveHubCrowdfund.deploy(
      await mockSystemContract.getAddress(),
      await mockWZETA.getAddress(),
      feeRecipient.address
    );

    // Mint tokens for testing
    await mockWZETA.mint(donor1.address, ethers.parseEther("1000"));
    await mockZRC20.mint(donor1.address, ethers.parseEther("1000"));
    await mockWZETA.mint(donor2.address, ethers.parseEther("1000"));
  });

  describe("Creator Registration", function () {
    it("Should register a creator successfully", async function () {
      await crowdfund.connect(creator).registerCreator(
        "TestCreator",
        await mockWZETA.getAddress()
      );

      const creatorData = await crowdfund.creators(creator.address);
      expect(creatorData.exists).to.be.true;
      expect(creatorData.username).to.equal("TestCreator");
      expect(creatorData.preferredZRC20).to.equal(await mockWZETA.getAddress());
    });

    it("Should fail to register with empty username", async function () {
      await expect(
        crowdfund.connect(creator).registerCreator("", await mockWZETA.getAddress())
      ).to.be.revertedWith("Username required");
    });
  });

  describe("Campaign Creation", function () {
    beforeEach(async function () {
      await crowdfund.connect(creator).registerCreator(
        "TestCreator",
        await mockWZETA.getAddress()
      );
    });

    it("Should create a campaign successfully", async function () {
      const tx = await crowdfund.connect(creator).createCampaign(
        "Test Campaign",
        "Test Description",
        "technology",
        ethers.parseEther("100"),
        0, // No deadline
        "QmTestHash"
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => log.fragment?.name === "CampaignCreated");
      expect(event).to.not.be.undefined;

      const campaign = await crowdfund.getCampaign(1);
      expect(campaign.title).to.equal("Test Campaign");
      expect(campaign.goal).to.equal(ethers.parseEther("100"));
      expect(campaign.creator).to.equal(creator.address);
    });

    it("Should fail to create campaign without registration", async function () {
      await expect(
        crowdfund.connect(donor1).createCampaign(
          "Test Campaign",
          "Test Description",
          "technology",
          ethers.parseEther("100"),
          0,
          "QmTestHash"
        )
      ).to.be.revertedWith("Must register as creator first");
    });
  });

  describe("Donations", function () {
    let campaignId;

    beforeEach(async function () {
      await crowdfund.connect(creator).registerCreator(
        "TestCreator",
        await mockWZETA.getAddress()
      );

      const tx = await crowdfund.connect(creator).createCampaign(
        "Test Campaign",
        "Test Description",
        "technology",
        ethers.parseEther("100"),
        0,
        "QmTestHash"
      );
      
      campaignId = 1;
    });

    it("Should accept WZETA donations", async function () {
      const donationAmount = ethers.parseEther("10");
      
      // Approve tokens
      await mockWZETA.connect(donor1).approve(await crowdfund.getAddress(), donationAmount);
      
      // Make donation
      await crowdfund.connect(donor1).donate(
        campaignId,
        await mockWZETA.getAddress(),
        donationAmount,
        "Donor1",
        "Great project!"
      );

      const campaign = await crowdfund.getCampaign(campaignId);
      expect(campaign.totalContributions).to.equal(1);
      
      // Check that platform fee was deducted (2.5%)
      const expectedNet = donationAmount * 975n / 1000n;
      expect(campaign.totalRaised).to.equal(expectedNet);
    });

    it("Should handle native ZETA donations", async function () {
      const donationAmount = ethers.parseEther("5");
      
      await crowdfund.connect(donor1).donate(
        campaignId,
        ethers.ZeroAddress, // Native ZETA
        donationAmount,
        "Donor1",
        "Great project!",
        { value: donationAmount }
      );

      const campaign = await crowdfund.getCampaign(campaignId);
      expect(campaign.totalContributions).to.equal(1);
    });

    it("Should fail donation to inactive campaign", async function () {
      // Deactivate campaign
      await crowdfund.connect(creator).updateCampaign(
        campaignId,
        "",
        "",
        false
      );

      const donationAmount = ethers.parseEther("10");
      await mockWZETA.connect(donor1).approve(await crowdfund.getAddress(), donationAmount);

      await expect(
        crowdfund.connect(donor1).donate(
          campaignId,
          await mockWZETA.getAddress(),
          donationAmount,
          "Donor1",
          "Great project!"
        )
      ).to.be.revertedWith("Campaign not active");
    });
  });

  describe("Fund Withdrawal", function () {
    let campaignId;

    beforeEach(async function () {
      await crowdfund.connect(creator).registerCreator(
        "TestCreator",
        await mockWZETA.getAddress()
      );

      await crowdfund.connect(creator).createCampaign(
        "Test Campaign",
        "Test Description",
        "technology",
        ethers.parseEther("100"),
        0,
        "QmTestHash"
      );
      
      campaignId = 1;

      // Make a donation
      const donationAmount = ethers.parseEther("50");
      await mockWZETA.connect(donor1).approve(await crowdfund.getAddress(), donationAmount);
      await crowdfund.connect(donor1).donate(
        campaignId,
        await mockWZETA.getAddress(),
        donationAmount,
        "Donor1",
        "Great project!"
      );
    });

    it("Should allow creator to withdraw funds", async function () {
      const initialBalance = await mockWZETA.balanceOf(creator.address);
      
      await crowdfund.connect(creator).withdrawFunds(campaignId);
      
      const finalBalance = await mockWZETA.balanceOf(creator.address);
      expect(finalBalance).to.be.gt(initialBalance);

      const campaign = await crowdfund.getCampaign(campaignId);
      expect(campaign.fundsWithdrawn).to.be.true;
    });

    it("Should prevent non-creator from withdrawing", async function () {
      await expect(
        crowdfund.connect(donor1).withdrawFunds(campaignId)
      ).to.be.revertedWith("Not campaign creator");
    });

    it("Should prevent double withdrawal", async function () {
      await crowdfund.connect(creator).withdrawFunds(campaignId);
      
      await expect(
        crowdfund.connect(creator).withdrawFunds(campaignId)
      ).to.be.revertedWith("Funds already withdrawn");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update platform fee", async function () {
      await crowdfund.connect(owner).setPlatformFee(500); // 5%
      expect(await crowdfund.platformFeePercent()).to.equal(500);
    });

    it("Should prevent setting fee too high", async function () {
      await expect(
        crowdfund.connect(owner).setPlatformFee(1500) // 15%
      ).to.be.revertedWith("Fee too high");
    });

    it("Should allow owner to verify creators", async function () {
      await crowdfund.connect(creator).registerCreator(
        "TestCreator",
        await mockWZETA.getAddress()
      );

      await crowdfund.connect(owner).verifyCreator(creator.address, true);
      
      const creatorData = await crowdfund.creators(creator.address);
      expect(creatorData.verified).to.be.true;
    });
  });
});
