const { ethers } = require("hardhat");
const { saveDeployment, getSystemContract } = require("../utils/helpers");

async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // Get network info
  const network = await ethers.provider.getNetwork();
  console.log("Network:", network.name, "Chain ID:", network.chainId);

  // ZetaChain system contract addresses
  let systemContract, wzeta;
  
  if (network.chainId === 7001n) { // ZetaChain Testnet
    systemContract = "0x239e96c8f17C85c30100AC26F635Ea15f23E9c67";
    wzeta = "0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf";
  } else if (network.chainId === 7000n) { // ZetaChain Mainnet
    systemContract = "0x91d18e54DAf4F677cB28167158d6dd21F6aB3921";
    wzeta = "0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf";
  } else if (network.chainId === 31337n) { // ZetaChain Localnet (Anvil)
    // Read from .env (copy from `npx zetachain@latest localnet start` output)
    systemContract =
      process.env.SYSTEM_CONTRACT_ADDRESS ||
      process.env.LOCAL_SYSTEM_CONTRACT ||
      process.env.LOCAL_SYSTEM_CONTRACT_ADDRESS;
    wzeta =
      process.env.WZETA_ADDRESS ||
      process.env.LOCAL_WZETA ||
      process.env.LOCAL_WZETA_ADDRESS;
    if (!systemContract || !wzeta) {
      throw new Error(
        "Missing SYSTEM_CONTRACT_ADDRESS or WZETA_ADDRESS in .env for Localnet. Start Localnet and copy the printed addresses."
      );
    }
  } else {
    throw new Error("Unsupported network for ZetaChain deployment");
  }

  // Deploy CrossChainCrowdfund (minimal createCampaign version)
  console.log("\nDeploying CrossChainCrowdfund...");
  
  const CrossChainCrowdfund = await ethers.getContractFactory("CrossChainCrowdfund");
  
  const crowdfund = await CrossChainCrowdfund.deploy(
    systemContract,
    wzeta
  );

  await crowdfund.waitForDeployment();
  const crowdfundAddress = await crowdfund.getAddress();

  console.log("CrossChainCrowdfund deployed to:", crowdfundAddress);
  console.log("System Contract:", systemContract);
  console.log("WZETA:", wzeta);

  // Save deployment info
  const deploymentInfo = {
    network: network.name,
    chainId: network.chainId.toString(),
    contracts: {
      CrossChainCrowdfund: {
        address: crowdfundAddress,
        constructorArgs: [systemContract, wzeta],
      },
    },
    systemContracts: {
      systemContract,
      wzeta,
    },
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  };

  await saveDeployment(deploymentInfo);

  console.log("\n✅ Deployment completed successfully!");
  console.log("📄 Deployment info saved to deployments/");
  
  // Verify on block explorer if not local network
  if (network.chainId !== 31337n) {
    console.log("\n🔍 To verify the contract, run:");
    console.log(`npx hardhat verify --network ${network.name} ${crowdfundAddress} "${systemContract}" "${wzeta}"`);
  }

  return {
    crowdfund: crowdfundAddress,
    systemContract,
    wzeta,
  };
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
