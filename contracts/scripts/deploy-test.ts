const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  console.log("Starting deployment...");
  
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance));

  const Crowdfund = await ethers.getContractFactory("CrossChainCrowdfund");
  console.log("Contract factory created");

  const args = [
    "0x239e96c8f17C85c30100AC26F635Ea15f23E9c67", // SYSTEM_CONTRACT
    "0x6c533f7fe93fae114d0954697069df33c9b74fd7", // GATEWAY
    "0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf", // WZETA
    "0x05BA149A7bd6dC1F937fA9046A9e05C05f3b18b0", // ETH_ZRC20
    "0xfC9201f4116aE6b054722E10b98D904829b469c3", // BTC_ZRC20
    "0xcC683A782f4B30c138787CB5576a86AF66fdc31d"  // USDC_ZRC20
  ];

  console.log("Deploying contract with args:", args);
  const contract = await Crowdfund.deploy(...args);
  console.log("Contract deployed to:", await contract.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });
