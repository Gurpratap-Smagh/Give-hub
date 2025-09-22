// scripts/fix-allowlists-and-router.ts
import { ethers } from "hardhat";
import { getAddress } from "ethers";

const UC = "0x30e837536ccd6c7358087d7e840edf9d26ab223d";  // UC
const ROUTER = "0xYOUR_UNISWAPV2_ROUTER_ON_ZEVM";          // <-- set real router addr
const TOKENS_IN  = ["0x5f9982a5ca0c5fce0e063a7dd7c2f2aa5f4a5a53"]; // WZETA Athens
const TOKENS_OUT = [
  // add campaign payout token(s) you use, e.g. WZETA for identity-swap
  "0x5f9982a5ca0c5fce0e063a7dd7c2f2aa5f4a5a53"
];

async function main() {
  const uc = await ethers.getContractAt("CrossChainCrowdfund", getAddress(UC));
  if (ROUTER && ROUTER !== ethers.ZeroAddress) {
    console.log("Setting router…");
    await (await uc.setUniswapRouter(getAddress(ROUTER))).wait();
  }

  for (const t of TOKENS_IN) {
    console.log("Allow IN:", t);
    await (await uc.setAllowedInToken(getAddress(t), true)).wait();
  }
  for (const t of TOKENS_OUT) {
    console.log("Allow OUT:", t);
    await (await uc.setAllowedOutToken(getAddress(t), true)).wait();
  }
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
