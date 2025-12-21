import * as dotenv from "dotenv";
dotenv.config();
import hardhat from "hardhat";
const hre: any = hardhat;
const { ethers, artifacts } = hre;

function req(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing ${name} in .env`);
  return v.trim();
}

function opt(name: string, def?: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : def;
}

// tolerant receipt poller to dodge Zeta's intermittent "ethereum tx not found"
async function waitForReceiptSafe(
  provider: any,
  txHash: string,
  timeoutMs = 300_000,
  intervalMs = 3_000
) {
  const start = Date.now();
  while (true) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for receipt: ${txHash}`);
    }
    try {
      const r = await provider.getTransactionReceipt(txHash);
      if (r) return r;
    } catch {
      // swallow transient provider errors
    }
    await new Promise((res) => setTimeout(res, intervalMs));
  }
}

// crude address check (just to catch typos quickly)
function isLikeAddress(x: string | undefined): x is string {
  return !!x && /^0x[a-fA-F0-9]{40}$/.test(x);
}

async function main() {
  // --- ENV ---
  const RPC = req("ZETA_HTTP");
  const PK = req("PRIVATE_KEY");
  const GATEWAY = req("GATEWAY");
  const UNISWAP_ROUTER = req("UNISWAP_ROUTER");
  const GAS_LIMIT = Number(opt("GAS_LIMIT", "100000")) || 100000;
  // Add any other params your initialize needs
  const INITIAL_OWNER = opt("INITIAL_OWNER") || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // anvil default

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);
  const net = await provider.getNetwork();
  console.log(`\nChainId: ${net.chainId}`);
  console.log(`Gateway: ${GATEWAY}`);
  console.log(`Router: ${UNISWAP_ROUTER}`);
  console.log(`Gas Limit: ${GAS_LIMIT}`);

  // --- Deploy ---
  const Crowdfund = await ethers.getContractFactory("CrossChainCrowdfund", wallet);
  const crowdfund = await Crowdfund.deploy();
  const sent = await crowdfund.deployTransaction.wait();
  const contractAddress = sent.contractAddress!;
  console.log(`\n✅ Deployed at: ${contractAddress}`);

  // --- Initialize ---
  const tx = await crowdfund.connect(wallet).initialize(
    INITIAL_OWNER,
    GATEWAY,
    UNISWAP_ROUTER,
    GAS_LIMIT
  );
  await tx.wait();
  console.log("Initialized!");
}

main().catch((e) => {
  console.error("\n❌ Deployment failed:", e);
  process.exit(1);
});
