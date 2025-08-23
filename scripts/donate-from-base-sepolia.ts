// scripts/donate-from-base-sepolia.ts
// Demo: Cross-chain ERC-20 donation from Base Sepolia → ZEVM CrossChainCrowdfund
// Usage: pnpm donate:base with appropriate env vars set
import { ethers } from "ethers";

const RPC        = process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY!; // source wallet (funded on Base Sepolia)
const ERC20       = process.env.BASE_SEPOLIA_ERC20!; // source token address
const CUSTODY     = "0xd80be3710f08d280f51115e072e5d2a778946cd7"; // Base Sepolia erc20Custody
const DEST_CHAIN  = 7001; // ZEVM Athens
const DEST_ADDR   = process.env.NEXT_PUBLIC_DONATION_CONTRACT!; // deployed ZEVM CrossChainCrowdfund
const CAMPAIGN_ID = BigInt(process.env.CAMPAIGN_ID || "6");
const DONOR_NAME  = process.env.DONOR_NAME || "demo-donor";
const NOTE        = process.env.DONOR_NOTE || "Cross-chain donation";
const AMOUNT_STR  = process.env.AMOUNT || "25"; // human units

const erc20Abi = [
  "function approve(address spender, uint256 value) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const custodyAbi = [
  "function deposit(address token,uint256 destinationChainId,bytes destinationAddress,uint256 amount,bytes message,uint256 gasLimit) external payable"
];

async function main() {
  if (!PRIVATE_KEY || !ERC20 || !DEST_ADDR) throw new Error("Missing env vars");
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  const erc20 = new ethers.Contract(ERC20, erc20Abi, wallet);
  const custody = new ethers.Contract(CUSTODY, custodyAbi, wallet);

  const decimals = await erc20.decimals();
  const amount   = ethers.parseUnits(AMOUNT_STR, decimals);

  const allowance = await erc20.allowance(wallet.address, CUSTODY);
  if (allowance < amount) {
    const txA = await erc20.approve(CUSTODY, amount);
    console.log("approve:", txA.hash);
    await txA.wait(1);
  }

  const coder = ethers.AbiCoder.defaultAbiCoder();
  const data    = coder.encode(["uint256","string","string"], [CAMPAIGN_ID, DONOR_NAME, NOTE]);
  const message = coder.encode(["string","bytes"], ["donate", data]);

  const destAddrBytes = ethers.getBytes(DEST_ADDR);
  const zetaExecGas   = 500_000n; // adjust if ZEVM complains

  const tx = await custody.deposit(ERC20, DEST_CHAIN, destAddrBytes, amount, message, zetaExecGas, { value: 0 });
  console.log("deposit:", tx.hash);
  await tx.wait(1);
  console.log("✅ Source-chain tx submitted; ZEVM will emit ContributionReceived afterward.");
}

main().catch((e) => { console.error(e); process.exit(1); });
