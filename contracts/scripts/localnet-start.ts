// scripts/localnet-start.ts
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load existing .env if it exists
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Hardcoded localnet values (from your earlier successful runs)
const LOCALNET_ENV = {
  LOCALNET_RPC_URL: "http://127.0.0.1:8545",
  PRIVATE_KEY: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // anvil default
  GATEWAY: "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e", // ZetaChain localnet gateway
  UNISWAP_ROUTER: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0", // localnet uniswapV2Router02
  GAS_LIMIT: "100000",
  // Add your Crowdfund-specific ones if needed
  INITIAL_OWNER: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // anvil default
};

// Write or update .env
const envContent = Object.entries(LOCALNET_ENV)
  .map(([k, v]) => `${k}=${v}`)
  .join("\n");

fs.writeFileSync(envPath, envContent);
console.log(".env updated for localnet!");

// Start localnet
console.log("Starting ZetaChain localnet...");
execSync("yarn zetachain localnet start --force-kill --exit-on-error --no-analytics", {
  stdio: "inherit",
});

console.log("Localnet started! You can now deploy.");
