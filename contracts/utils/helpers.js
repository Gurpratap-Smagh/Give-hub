const fs = require("fs");
const path = require("path");

/**
 * Save deployment information to deployments directory
 */
async function saveDeployment(deploymentInfo) {
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  
  // Create deployments directory if it doesn't exist
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  // Save network-specific deployment
  const networkFile = path.join(deploymentsDir, `${deploymentInfo.network}.json`);
  fs.writeFileSync(networkFile, JSON.stringify(deploymentInfo, null, 2));

  // Save latest deployment
  const latestFile = path.join(deploymentsDir, "latest.json");
  fs.writeFileSync(latestFile, JSON.stringify(deploymentInfo, null, 2));

  console.log(`📁 Deployment saved to: ${networkFile}`);
}

/**
 * Load deployment information
 */
function loadDeployment(network = "latest") {
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const deploymentFile = path.join(deploymentsDir, `${network}.json`);
  
  if (!fs.existsSync(deploymentFile)) {
    throw new Error(`Deployment file not found: ${deploymentFile}`);
  }

  return JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
}

/**
 * Get ZetaChain system contract addresses for different networks
 */
function getSystemContract(chainId) {
  const contracts = {
    7001: { // ZetaChain Testnet
      systemContract: "0x239e96c8f17C85c30100AC26F635Ea15f23E9c67",
      wzeta: "0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf",
      connector: "0x000007Cf399229b2f5A4D043F20E90C9C98B7C6a",
    },
    7000: { // ZetaChain Mainnet
      systemContract: "0x91d18e54DAf4F677cB28167158d6dd21F6aB3921",
      wzeta: "0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf",
      connector: "0x000007Cf399229b2f5A4D043F20E90C9C98B7C6a",
    },
  };

  return contracts[chainId];
}

/**
 * Get supported ZRC20 token addresses
 */
function getZRC20Tokens(chainId) {
  const tokens = {
    7001: { // ZetaChain Testnet
      "ETH.ETH": "0x65a45c57636f9BcCeD4fe193A602008578BcA90b",
      "BTC.BTC": "0x13A0c5930C028511Dc02665E7285134B6d11A5f4",
      "BNB.BNB": "0x48f80608B672DC30DC7e3dbBd0343c5F02C738Eb",
      "MATIC.MATIC": "0x3832d2F059E55934220881F831bE501D180671A7",
      "USDC.ETH": "0x0cbe0dF132a6c6B4a2974Fa1b7Fb953CF0Cc798a",
      "USDT.ETH": "0x7c8dDa80bbBE1254a7aACf3219EBe1481c6E01d7",
    },
    7000: { // ZetaChain Mainnet
      "ETH.ETH": "0xd97B1de3619ed2c6BEb3860147E30cA8A7dC9891",
      "BTC.BTC": "0x13A0c5930C028511Dc02665E7285134B6d11A5f4",
      "BNB.BNB": "0x48f80608B672DC30DC7e3dbBd0343c5F02C738Eb",
      "MATIC.MATIC": "0x3832d2F059E55934220881F831bE501D180671A7",
      "USDC.ETH": "0x0cbe0dF132a6c6B4a2974Fa1b7Fb953CF0Cc798a",
      "USDT.ETH": "0x7c8dDa80bbBE1254a7aACf3219EBe1481c6E01d7",
    },
  };

  return tokens[chainId] || {};
}

/**
 * Format address for display
 */
function formatAddress(address, chars = 4) {
  if (!address) return "";
  return `${address.slice(0, 2 + chars)}...${address.slice(-chars)}`;
}

/**
 * Convert amount to display format
 */
function formatAmount(amount, decimals = 18, precision = 4) {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const remainder = amount % divisor;
  
  if (remainder === 0n) {
    return whole.toString();
  }
  
  const decimal = Number(remainder) / Number(divisor);
  return (Number(whole) + decimal).toFixed(precision);
}

module.exports = {
  saveDeployment,
  loadDeployment,
  getSystemContract,
  getZRC20Tokens,
  formatAddress,
  formatAmount,
};
