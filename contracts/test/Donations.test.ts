import { expect } from "chai";
import { ethers } from "hardhat";
import { Donations, TestERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Donations Contract", function () {
  let donations: Donations;
  let testToken: TestERC20;
  let owner: SignerWithAddress;
  let feeRecipient: SignerWithAddress;
  let donor: SignerWithAddress;
  let otherAccount: SignerWithAddress;

  const CAMPAIGN_ID = 1;
  const DONOR_NAME = "Test Donor";
  const DONATION_NOTE = "Good luck with your campaign!";

  beforeEach(async function () {
    [owner, feeRecipient, donor, otherAccount] = await ethers.getSigners();

    // Deploy test ERC20 token
    const TestERC20 = await ethers.getContractFactory("TestERC20");
    testToken = await TestERC20.deploy("Test Token", "TEST", 18);
    await testToken.waitForDeployment();

    // Deploy Donations contract
    const Donations = await ethers.getContractFactory("Donations");
    donations = await Donations.deploy(feeRecipient.address);
    await donations.waitForDeployment();

    // Mint test tokens to donor
    await testToken.mint(donor.address, ethers.parseEther("1000"));
  });

  describe("Deployment", function () {
    it("Should set the correct fee recipient", async function () {
      expect(await donations.feeRecipient()).to.equal(feeRecipient.address);
    });

    it("Should set the correct owner", async function () {
      expect(await donations.owner()).to.equal(owner.address);
    });

    it("Should start unpaused", async function () {
      expect(await donations.paused()).to.equal(false);
    });

    it("Should set default platform fee to 2.5%", async function () {
      expect(await donations.platformFeeBps()).to.equal(250);
    });
  });

  describe("Native ZETA Donations", function () {
    it("Should accept native ZETA donation and emit event", async function () {
      const donationAmount = ethers.parseEther("1.0");

      await expect(
        donations.connect(donor).donate(
          DONOR_NAME,
          DONATION_NOTE,
          CAMPAIGN_ID,
          ethers.ZeroAddress, // Native ZETA
          0, // Amount ignored for native donations
          { value: donationAmount }
        )
      )
        .to.emit(donations, "DonationMade")
        .withArgs(DONOR_NAME, DONATION_NOTE, donationAmount, CAMPAIGN_ID, ethers.ZeroAddress);
    });

    it("Should charge platform fee on native donations", async function () {
      const donationAmount = ethers.parseEther("1.0");
      const expectedFee = donationAmount * BigInt(250) / BigInt(10000); // 2.5%

      const initialFeeRecipientBalance = await ethers.provider.getBalance(feeRecipient.address);

      await donations.connect(donor).donate(
        DONOR_NAME,
        DONATION_NOTE,
        CAMPAIGN_ID,
        ethers.ZeroAddress,
        0,
        { value: donationAmount }
      );

      const finalFeeRecipientBalance = await ethers.provider.getBalance(feeRecipient.address);
      expect(finalFeeRecipientBalance - initialFeeRecipientBalance).to.equal(expectedFee);
    });

    it("Should revert if no ZETA sent", async function () {
      await expect(
        donations.connect(donor).donate(
          DONOR_NAME,
          DONATION_NOTE,
          CAMPAIGN_ID,
          ethers.ZeroAddress,
          0,
          { value: 0 }
        )
      ).to.be.revertedWith("Must send ZETA");
    });
  });

  describe("ERC20 Token Donations", function () {
    beforeEach(async function () {
      // Approve donations contract to spend donor's tokens
      await testToken.connect(donor).approve(await donations.getAddress(), ethers.parseEther("100"));
    });

    it("Should accept ERC20 donation and emit event", async function () {
      const donationAmount = ethers.parseEther("10");

      await expect(
        donations.connect(donor).donate(
          DONOR_NAME,
          DONATION_NOTE,
          CAMPAIGN_ID,
          await testToken.getAddress(),
          donationAmount
        )
      )
        .to.emit(donations, "DonationMade")
        .withArgs(DONOR_NAME, DONATION_NOTE, donationAmount, CAMPAIGN_ID, await testToken.getAddress());
    });

    it("Should charge platform fee on token donations", async function () {
      const donationAmount = ethers.parseEther("10");
      const expectedFee = donationAmount * BigInt(250) / BigInt(10000); // 2.5%

      const initialFeeRecipientBalance = await testToken.balanceOf(feeRecipient.address);

      await donations.connect(donor).donate(
        DONOR_NAME,
        DONATION_NOTE,
        CAMPAIGN_ID,
        await testToken.getAddress(),
        donationAmount
      );

      const finalFeeRecipientBalance = await testToken.balanceOf(feeRecipient.address);
      expect(finalFeeRecipientBalance - initialFeeRecipientBalance).to.equal(expectedFee);
    });

    it("Should revert if no allowance given", async function () {
      await testToken.connect(donor).approve(await donations.getAddress(), 0);

      await expect(
        donations.connect(donor).donate(
          DONOR_NAME,
          DONATION_NOTE,
          CAMPAIGN_ID,
          await testToken.getAddress(),
          ethers.parseEther("10")
        )
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("Should revert if ZETA sent with token donation", async function () {
      await expect(
        donations.connect(donor).donate(
          DONOR_NAME,
          DONATION_NOTE,
          CAMPAIGN_ID,
          await testToken.getAddress(),
          ethers.parseEther("10"),
          { value: ethers.parseEther("1") }
        )
      ).to.be.revertedWith("Don't send ZETA with token donation");
    });
  });

  describe("Input Validation", function () {
    it("Should revert if name is empty", async function () {
      await expect(
        donations.connect(donor).donate(
          "",
          DONATION_NOTE,
          CAMPAIGN_ID,
          ethers.ZeroAddress,
          0,
          { value: ethers.parseEther("1") }
        )
      ).to.be.revertedWith("Name required");
    });

    it("Should revert if campaign ID is zero", async function () {
      await expect(
        donations.connect(donor).donate(
          DONOR_NAME,
          DONATION_NOTE,
          0,
          ethers.ZeroAddress,
          0,
          { value: ethers.parseEther("1") }
        )
      ).to.be.revertedWith("Invalid campaign ID");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to update platform fee", async function () {
      await donations.connect(owner).setPlatformFee(500); // 5%
      expect(await donations.platformFeeBps()).to.equal(500);
    });

    it("Should revert if non-owner tries to update platform fee", async function () {
      await expect(
        donations.connect(donor).setPlatformFee(500)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should revert if platform fee is too high", async function () {
      await expect(
        donations.connect(owner).setPlatformFee(1001) // >10%
      ).to.be.revertedWith("Fee too high");
    });

    it("Should allow owner to pause contract", async function () {
      await donations.connect(owner).setPaused(true);
      expect(await donations.paused()).to.equal(true);

      await expect(
        donations.connect(donor).donate(
          DONOR_NAME,
          DONATION_NOTE,
          CAMPAIGN_ID,
          ethers.ZeroAddress,
          0,
          { value: ethers.parseEther("1") }
        )
      ).to.be.revertedWith("Contract is paused");
    });
  });

  describe("View Functions", function () {
    it("Should return correct native balance", async function () {
      const donationAmount = ethers.parseEther("1.0");
      
      await donations.connect(donor).donate(
        DONOR_NAME,
        DONATION_NOTE,
        CAMPAIGN_ID,
        ethers.ZeroAddress,
        0,
        { value: donationAmount }
      );

      // Balance should be donation amount minus fee
      const expectedBalance = donationAmount - (donationAmount * BigInt(250) / BigInt(10000));
      const actualBalance = await donations.getBalance(ethers.ZeroAddress);
      expect(actualBalance).to.equal(expectedBalance);
    });

    it("Should return correct token balance", async function () {
      const donationAmount = ethers.parseEther("10");
      
      await testToken.connect(donor).approve(await donations.getAddress(), donationAmount);
      await donations.connect(donor).donate(
        DONOR_NAME,
        DONATION_NOTE,
        CAMPAIGN_ID,
        await testToken.getAddress(),
        donationAmount
      );

      // Balance should be donation amount minus fee
      const expectedBalance = donationAmount - (donationAmount * BigInt(250) / BigInt(10000));
      const actualBalance = await donations.getBalance(await testToken.getAddress());
      expect(actualBalance).to.equal(expectedBalance);
    });
  });
});
