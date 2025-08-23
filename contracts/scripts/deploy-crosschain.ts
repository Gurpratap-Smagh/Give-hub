// scripts/deploy-crosschain.ts
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

  // strongly recommended to set these in .env to match your runtime printouts
  const SYSTEM_CONTRACT = opt("SYSTEM_CONTRACT", "0x239e96c8f17C85c30100AC26F635Ea15f23E9c67");
  const WZETA_ADDRESS = opt("WZETA_ADDRESS", "0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf");
  const UNISWAP_ROUTER = req("UNISWAP_ROUTER");

  // optional ZRC-20s; used only if your constructor expects them
  const ETH_ZRC20 = opt("ETH_ZRC20");
  const BTC_ZRC20 = opt("BTC_ZRC20");
  const USDC_ZRC20 = opt("USDC_ZRC20");

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(PK, provider);
  const net = await provider.getNetwork();

  console.log(`\nChainId: ${net.chainId}`);
  if (Number(net.chainId) !== 7001) {
    console.warn("⚠️  You are not on Zeta testnet (7001). Check RPC.");
  }

  console.log(`SystemContract: ${SYSTEM_CONTRACT}`);
  console.log(`WZETA:          ${WZETA_ADDRESS}`);
  console.log(`Router:         ${UNISWAP_ROUTER}`);

  // --- Validate key addresses quickly ---
  for (const [label, val] of [
    ["SYSTEM_CONTRACT", SYSTEM_CONTRACT],
    ["WZETA_ADDRESS", WZETA_ADDRESS],
    ["UNISWAP_ROUTER", UNISWAP_ROUTER],
    ["ETH_ZRC20", ETH_ZRC20],
    ["BTC_ZRC20", BTC_ZRC20],
    ["USDC_ZRC20", USDC_ZRC20],
  ]) {
    if (val && !isLikeAddress(val)) {
      console.warn(`⚠️  ${label} doesn't look like an address: ${val}`);
    }
  }

  // --- Inspect constructor to build args dynamically ---
  const artifact = await artifacts.readArtifact("CrossChainCrowdfund");
  const abi = artifact.abi as any[];

  const ctor = abi.find((e) => e.type === "constructor");
  const inputs: Array<{ name: string; type: string }> = ctor?.inputs || [];
  console.log("\nConstructor params:", inputs.map((i) => `${i.type} ${i.name}`).join(", ") || "(none)");

  // map common param name patterns to envs
  const envMap: Record<string, string | undefined> = {
    // system contract
    systemContract: SYSTEM_CONTRACT,
    _systemContract: SYSTEM_CONTRACT,
    system: SYSTEM_CONTRACT,

    // WZETA
    WZETA: WZETA_ADDRESS,
    wZeta: WZETA_ADDRESS,
    wrappedZeta: WZETA_ADDRESS,
    _wzeta: WZETA_ADDRESS,

    // router
    router: UNISWAP_ROUTER,
    uniswapRouter: UNISWAP_ROUTER,
    dexRouter: UNISWAP_ROUTER,
    _router: UNISWAP_ROUTER,

    // tokens
    ethZRC20: ETH_ZRC20,
    btcZRC20: BTC_ZRC20,
    usdcZRC20: USDC_ZRC20,

    tokenETH: ETH_ZRC20,
    tokenBTC: BTC_ZRC20,
    tokenUSDC: USDC_ZRC20,
  };

  // build args array in order
  const args: string[] = [];
  for (const inp of inputs) {
    const key = inp.name;
    let val: string | undefined = envMap[key];

    // also try a lowercase fallback
    if (!val) val = envMap[key.replace(/^_/, "")];
    if (!val) val = envMap[key.toLowerCase()];

    // last resort: guess by type/name pattern
    if (!val) {
      if (/system/i.test(key)) val = SYSTEM_CONTRACT;
      else if (/wzeta|wrappedzeta/i.test(key)) val = WZETA_ADDRESS;
      else if (/router/i.test(key)) val = UNISWAP_ROUTER;
      else if (/eth/i.test(key)) val = ETH_ZRC20;
      else if (/btc/i.test(key)) val = BTC_ZRC20;
      else if (/usdc/i.test(key)) val = USDC_ZRC20;
    }

    if (!val) {
      // if constructor param is an address and we still don't have a value, use zero and warn
      if (inp.type === "address") {
        console.warn(`⚠️  No env found for constructor param '${key}', using ZeroAddress`);
        val = ethers.ZeroAddress;
      } else {
        throw new Error(`No value for constructor param '${key}' and cannot default.`);
      }
    }
    args.push(val);
  }

  // --- Create factory with signer ---
  const Crowdfund = await ethers.getContractFactory("CrossChainCrowdfund", wallet);

  // --- Build deploy tx first (so we can send manually and handle flaky receipts) ---
  const deployTxUnsigned = await Crowdfund.getDeployTransaction(...args);

  // optional EIP-1559 safety if provider doesn't populate fees
  if (!(deployTxUnsigned.maxFeePerGas || deployTxUnsigned.gasPrice)) {
    try {
      const fee = await provider.getFeeData();
      if (fee.maxFeePerGas && fee.maxPriorityFeePerGas) {
        deployTxUnsigned.maxFeePerGas = fee.maxFeePerGas;
        deployTxUnsigned.maxPriorityFeePerGas = fee.maxPriorityFeePerGas;
      }
    } catch {
      // ignore
    }
  }

  console.log("\nDeploying CrossChainCrowdfund...");
  const sent = await wallet.sendTransaction(deployTxUnsigned);
  console.log(`tx: ${sent.hash}`);

  // --- Robust wait ---
  const receipt = await waitForReceiptSafe(provider, sent.hash);
  if (receipt.status !== 1) {
    throw new Error(`Deployment reverted. status=${receipt.status}`);
  }
  const contractAddress = receipt.contractAddress!;
  console.log(`\n✅ Deployed at: ${contractAddress}`);

  // (Optional) attach for post-deploy sanity calls:
  // const crowdfund = await Crowdfund.attach(contractAddress);
  // console.log("systemContract()", await crowdfund.systemContract?.().catch(() => "n/a"));

  // --- Print frontend-ready envs ---
  console.log("\nAdd to frontend .env.local:");
  console.log(`NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`NEXT_PUBLIC_ZETA_CHAIN_ID=${net.chainId.toString()}`);
  console.log(`NEXT_PUBLIC_WZETA_ADDRESS=${WZETA_ADDRESS}`);
}

main().catch((e) => {
  console.error("\n❌ Deployment failed:", e);
  process.exit(1);
});
