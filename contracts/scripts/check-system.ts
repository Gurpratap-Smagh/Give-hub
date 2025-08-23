import hardhat from "hardhat";
// Use CommonJS require for local helpers (compiled via ts-node in Hardhat)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const helpers = require("../utils/helpers.js");
const hre: any = hardhat;
const { ethers } = hre;

async function main() {
  const net = await ethers.provider.getNetwork();
  const chainId = net.chainId.toString();
  const defaultAddr = chainId === "7001" ? "0x239e96c8f17C85c30100AC26F635Ea15f23E9c67" :
                     chainId === "7000" ? "0x91d18e54DAf4F677cB28167158d6dd21F6aB3921" :
                     process.env.SYSTEM_CONTRACT_ADDRESS || "";
  const addr = process.env.SYSTEM_CONTRACT_ADDRESS || defaultAddr;
  if (!addr) {
    console.error("No SYSTEM_CONTRACT_ADDRESS set and no default for this chain.");
    process.exit(1);
  }

  console.log("Network:", net.name || "unknown", "ChainId:", chainId);
  console.log("SystemContract address:", addr);

  const code = await ethers.provider.getCode(addr);
  console.log("Code size:", code === "0x" ? 0 : (code.length - 2) / 2, "bytes");
  if (code === "0x") {
    console.error("❌ No code at SystemContract address. Likely wrong address for this RPC/network.");
    return;
  }

  // On Athens, SystemContract reads may revert. Prefer canonical addresses from helpers.
  if (chainId === "7001") {
    const tokens = helpers.getZRC20Tokens(7001);
    const system = helpers.getSystemContract(7001);
    console.log("ℹ️ Athens detected; using canonical addresses from utils/helpers.js");
    console.log("SystemContract:", system?.systemContract);
    console.log("WZETA:", system?.wzeta);
    console.log("ETH.ETH ZRC20:", tokens["ETH.ETH"]);
    console.log("BTC.BTC ZRC20:", tokens["BTC.BTC"]);
    console.log("USDC.ETH ZRC20:", tokens["USDC.ETH"]);
    console.log("USDT.ETH ZRC20:", tokens["USDT.ETH"]);
    console.log("✅ Fallback succeeded (no on-chain reads).");
  } else {
    const abi = [
      "function gasCoinZRC20ByChainId(uint256) view returns (address)",
    ];
    const sc = new ethers.Contract(addr, abi, ethers.provider);
    try {
      const ethExtId = chainId === "7000" ? 1 : 1; // default to mainnet mapping on non-Athens
      const zEth = await sc.gasCoinZRC20ByChainId(ethExtId);
      console.log(`gasCoinZRC20ByChainId(${ethExtId}) -> zETH ZRC20:`, zEth);
      console.log("✅ SystemContract read succeeded.");
    } catch (e) {
      console.error("❌ Read failed (ABI mismatch or wrong address):", e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
