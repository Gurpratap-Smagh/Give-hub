// scripts/triage-native.ts
import { ethers } from "hardhat";
import { getAddress, formatEther } from "ethers";

const UC = "0x30e837536ccd6c7358087d7e840edf9d26ab223d"; // your ZEVM UC (lowercase ok)
const CAMPAIGN_ID = 2n;                                   // <- set the one you're testing

async function main() {
  const [me] = await ethers.getSigners();
  console.log("Signer:", me.address);

  // 0) Is this even a contract?
  const ucAddr = getAddress(UC);
  const code = await ethers.provider.getCode(ucAddr);
  console.log("UC", ucAddr, "bytecode length:", code.length);
  if (code === "0x") {
    console.error("❌ No contract at UC address (EOA). Use the real ZEVM UC.");
    return;
  }

  const uc = await ethers.getContractAt("CrossChainCrowdfund", ucAddr);

  // 1) Baselines
  const chainId = (await ethers.provider.getNetwork()).chainId;
  console.log("Chain ID:", chainId.toString());

  // 2) WZETA wiring
  const wzeta = await uc.WZETA();
  console.log("WZETA():", wzeta);

  // 3) Allowlist checks
  let inAllowed: boolean | null = null;
  try {
    inAllowed = await uc.allowedInTokens(wzeta);
    console.log("allowedIn[WZETA]:", inAllowed);
  } catch {
    console.log("allowedInTokens getter not found (mapping not public?)");
  }

  // 4) Campaign checks
  const status = await uc.campaignStatus(CAMPAIGN_ID);
  console.log(`campaignStatus(${CAMPAIGN_ID}): exists=${status.exists} active=${status.active}`);

  const info = await uc.getCampaignInfo(CAMPAIGN_ID);
  console.log(`getCampaignInfo(${CAMPAIGN_ID}): creator=${info.creator} active=${info.active}`);
  console.log(`preferredZRC20=${info.preferredZRC20}`);

  let outAllowed: boolean | null = null;
  try {
    outAllowed = await uc.allowedOutTokens(info.preferredZRC20);
    console.log("allowedOut[preferredZRC20]:", outAllowed);
  } catch {
    console.log("allowedOutTokens getter not found (mapping not public?)");
  }

  // 5) Router check
  const router = await uc.router();
  console.log("router():", router);
  if (router === ethers.ZeroAddress) {
    console.error("❌ Router not set. donate will fail on swap.");
  }

  // 6) Dry-run donate to capture the precise revert
  try {
    console.log("callStatic.donate(… value=1 wei) to sniff revert reason…");
    await uc.callStatic.donate(CAMPAIGN_ID, "probe", "probe", { value: 1n });
    console.log("✅ Static call passed (with 1 wei). Real tx should pass the guards.");
  } catch (e: any) {
    // Parse custom errors if present
    try {
      const parsed = uc.interface.parseError(e.data ?? e.error?.data ?? e);
      console.error("❌ Reverted with custom error:", parsed?.name, parsed?.args ?? []);
    } catch {
      console.error("❌ Reverted. Message:", e.shortMessage || e.message);
      if (e.data) console.error("  data:", e.data);
      if (e.error?.data) console.error("  inner:", e.error.data);
    }
  }

  // 7) Sanity: UC ZETA balance vs WZETA balance
  const nativeBal = await ethers.provider.getBalance(ucAddr);
  const erc20 = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)"],
    wzeta
  );
  const wzBal = await erc20.balanceOf(ucAddr);
  console.log(`UC native ZETA: ${formatEther(nativeBal)} | WZETA: ${formatEther(wzBal)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
