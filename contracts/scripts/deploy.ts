// scripts/deploy-crosschain-updated.ts
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

// Get factory address from router
async function getFactoryAddress(rpcUrl: string, routerAddress: string): Promise<string> {
  console.log("Getting factory address from router...");
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const router = new ethers.Contract(
    routerAddress,
    ["function factory() view returns (address)"],
    provider
  );
  const factory = await router.factory();
  console.log(`Factory address: ${factory}`);
  return factory;
}

async function main() {
  // --- ENV ---
  const RPC = req("ZETA_HTTP");
  const PK = req("PRIVATE_KEY");

  // strongly recommended to set these in .env to match your runtime printouts
  // (optional) kept only if you reference it elsewhere; NOT used for gateway
  const SYSTEM_CONTRACT = opt("SYSTEM_CONTRACT");
  const WZETA_ADDRESS = opt("WZETA_ADDRESS", "0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf");
  const UNISWAP_ROUTER = req("UNISWAP_ROUTER");
  const GATEWAY = req("GATEWAY");
  
  // Get factory address from router
  const FACTORY_ADDRESS = await getFactoryAddress(RPC, UNISWAP_ROUTER);

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

  console.log(`WZETA:          ${WZETA_ADDRESS}`);
  console.log(`Router:         ${UNISWAP_ROUTER}`);
  console.log(`Factory:        ${FACTORY_ADDRESS}`);
  console.log(`Gateway:        ${GATEWAY}`);

  // --- Validate key addresses quickly ---
  for (const [label, val] of [
    ["SYSTEM_CONTRACT", SYSTEM_CONTRACT],
    ["WZETA_ADDRESS", WZETA_ADDRESS],
    ["UNISWAP_ROUTER", UNISWAP_ROUTER],
    ["FACTORY_ADDRESS", FACTORY_ADDRESS],
    ["GATEWAY", GATEWAY],
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
    
    // gateway (REQUIRED: use env GATEWAY)
    gateway: GATEWAY,
    _gateway: GATEWAY,

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
    
    // factory
    factory: FACTORY_ADDRESS,
    uniswapFactory: FACTORY_ADDRESS,
    _factory: FACTORY_ADDRESS,

    // tokens
    ethZRC20: ETH_ZRC20,
    btcZRC20: BTC_ZRC20,
    usdcZRC20: USDC_ZRC20,

    tokenETH: ETH_ZRC20,
    tokenBTC: BTC_ZRC20,
    tokenUSDC: USDC_ZRC20,
    
    // route hub (default to USDC_ZRC20 if available)
    routeHub: opt("ROUTE_HUB", USDC_ZRC20),
    _routeHub: opt("ROUTE_HUB", USDC_ZRC20),
  };

  // Initial allowed tokens for constructor
  const initialInTokens: string[] = [];
  const initialOutTokens: string[] = [];
  
  // Add WZETA to allowed tokens by default
  if (WZETA_ADDRESS) {
    initialInTokens.push(WZETA_ADDRESS);
    initialOutTokens.push(WZETA_ADDRESS);
  }
  
  // Add ETH_ZRC20 if available
  if (ETH_ZRC20) {
    initialInTokens.push(ETH_ZRC20);
    initialOutTokens.push(ETH_ZRC20);
  }
  
  // Add BTC_ZRC20 if available
  if (BTC_ZRC20) {
    initialInTokens.push(BTC_ZRC20);
    initialOutTokens.push(BTC_ZRC20);
  }
  
  // Add USDC_ZRC20 if available
  if (USDC_ZRC20) {
    initialInTokens.push(USDC_ZRC20);
    initialOutTokens.push(USDC_ZRC20);
  }

  // build args array in order
  const args: any[] = [];
  for (const inp of inputs) {
    const key = inp.name;
    let val: any = envMap[key];

    // also try a lowercase fallback
    if (val === undefined) val = envMap[key.replace(/^_/, "")];
    if (val === undefined) val = envMap[key.toLowerCase()];

    // Special handling for token arrays
    if (key === "initialIn" || key === "initialInTokens") {
      val = initialInTokens;
    } else if (key === "initialOut" || key === "initialOutTokens") {
      val = initialOutTokens;
    }

    // last resort: guess by type/name pattern
    if (val === undefined) {
      if (/gateway/i.test(key)) val = GATEWAY;
      else if (/system/i.test(key)) val = SYSTEM_CONTRACT;
      else if (/wzeta|wrappedzeta/i.test(key)) val = WZETA_ADDRESS;
      else if (/router/i.test(key)) val = UNISWAP_ROUTER;
      else if (/factory/i.test(key)) val = FACTORY_ADDRESS;
      else if (/eth/i.test(key)) val = ETH_ZRC20;
      else if (/btc/i.test(key)) val = BTC_ZRC20;
      else if (/usdc/i.test(key)) val = USDC_ZRC20;
      else if (/routehub/i.test(key)) val = USDC_ZRC20;
    }

    if (val === undefined) {
      // if constructor param is an address and we still don't have a value, use zero and warn
      if (inp.type === "address") {
        console.warn(`⚠️  No env found for constructor param '${key}', using ZeroAddress`);
        val = ethers.ZeroAddress;
      } else if (inp.type === "address[]") {
        console.warn(`⚠️  No env found for constructor param '${key}', using empty array`);
        val = [];
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

  // Attach to contract for post-deploy sanity check
  const crowdfund = Crowdfund.attach(contractAddress);
  console.log("\nPerforming sanity checks...");
  try {
    const owner = await crowdfund.owner();
    console.log(`Owner: ${owner}`);
    const wzeta = await crowdfund.WZETA();
    console.log(`WZETA: ${wzeta}`);
    const routerAddr = await crowdfund.router();
    console.log(`Router: ${routerAddr}`);
    const factoryAddr = await crowdfund.factory();
    console.log(`Factory: ${factoryAddr}`);
  } catch (e) {
    console.warn("⚠️  Sanity check failed:", e);
  }

  // --- Print frontend-ready envs ---
  console.log("\nAdd to frontend .env.local:");
  console.log(`NEXT_PUBLIC_CROSSCHAIN_CONTRACT=${contractAddress}`);
  console.log(`NEXT_PUBLIC_ZETA_CHAIN_ID=${net.chainId.toString()}`);
  console.log(`NEXT_PUBLIC_WZETA_ADDRESS=${WZETA_ADDRESS}`);
  console.log(`NEXT_PUBLIC_ZETA_RPC_HTTP=${RPC}`);
  console.log(`NEXT_PUBLIC_ROUTE_HUB=${opt("ROUTE_HUB", USDC_ZRC20) ?? ""}`);
  console.log(`NEXT_PUBLIC_GATEWAY_ZEVM=${GATEWAY}`);
}

main().catch((e) => {
  console.error("\n❌ Deployment failed:", e);
  process.exit(1);
});
