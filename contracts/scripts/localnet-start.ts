// scripts/localnet-start.ts
import { execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { setTimeout } from "timers/promises";

// Hardcoded localnet values
const LOCALNET_ENV = {
  LOCALNET_RPC_URL: "http://127.0.0.1:8545",
  PRIVATE_KEY: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  GATEWAY: "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e",
  UNISWAP_ROUTER: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  GAS_LIMIT: "100000",
  INITIAL_OWNER: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  ZETA_HTTP: "http://127.0.0.1:8545", // For deploy script
};

async function main() {
  // 1. Write .env
  const envPath = path.join(process.cwd(), ".env");
  const envContent = Object.entries(LOCALNET_ENV)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  fs.writeFileSync(envPath, envContent);
  console.log("✅ .env updated for localnet!");

  // 2. Kill any old localnet instances
  console.log("Stopping any existing localnet...");
  try { 
    execSync("zetachain localnet stop --no-analytics", { stdio: 'ignore' }); 
  } catch (e) {
    // Ignore errors if no localnet was running
  }

  // 3. Start localnet in background
  console.log("Starting ZetaChain localnet in background...");
  spawn("zetachain", [
    "localnet",
    "start",
    "--force-kill",
    "--exit-on-error",
    "--no-analytics"
  ], { stdio: "inherit" });

  // 4. Wait for registry.json to appear (Node initialization)
  const homeDir = process.env.HOME || "/home/kali";
  const registryPath = path.join(homeDir, ".zetachain/localnet/registry.json");
  
  let waited = 0;
  console.log("⌛ Waiting for registry.json to be generated...");
  
  while (!fs.existsSync(registryPath) && waited < 60) {
    await setTimeout(2000);
    waited++;
    if (waited % 5 === 0) console.log(`Still waiting... (${waited * 2}s elapsed)`);
  }

  if (!fs.existsSync(registryPath)) {
    console.error("❌ Localnet failed to start - registry.json not found after 120s");
    process.exit(1);
  }

  console.log("\n🚀 Localnet started! Registry ready.");
  console.log("--------------------------------------------------");
  console.log("Next Step: yarn deploy:crosschain:local");
  console.log("--------------------------------------------------");
}

// Execute the main function
main().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});
