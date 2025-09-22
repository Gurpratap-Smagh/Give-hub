import { ethers } from "hardhat";
import { getAddress } from "ethers";

const CANDIDATE_ADDRESSES = [
  "0xD1062082002D2f607811f3D42231759a91a2af4D",
  "0x30e837536ccd6c7358087d7e840edf9d26ab223d", // <-- lowercased
  "0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf",
  "0x05BA149A7bd6dC1F937fA9046A9e05C05f3b18b0"

];

async function main() {
  for (const rawAddr of CANDIDATE_ADDRESSES) {
    const addr = getAddress(rawAddr); // normalize checksum
    console.log("\n🔎 Checking address:", addr);

    const code = await ethers.provider.getCode(addr);
    console.log("  Bytecode length:", code.length);

    if (code === "0x") {
      console.log("  ❌ No contract here (EOA)");
      continue;
    }

    try {
      const contract = await ethers.getContractAt("CrossChainCrowdfund", addr);
      const wzeta = getAddress("0x5f9982a5ca0c5fce0e063a7dd7c2f2aa5f4a5a53");

      // see if donate exists
      console.log("  Checking donate with staticcall...");
      await contract.callStatic.donate(1n, "test", "ping", { value: 1 });
      console.log("  ✅ donate works");

      // see if allowedInTokens getter exists
      try {
        const allowed = await contract.allowedInTokens(wzeta);
        console.log("  allowedInTokens[WZETA]:", allowed);
      } catch {
        console.log("  ⚠️ No public allowedInTokens getter");
      }
    } catch (err) {
      console.error("  ⚠️ Failed to connect with ABI:", err.message);
    }
  }
}

main().catch(console.error);
