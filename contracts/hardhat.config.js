require("@nomicfoundation/hardhat-toolbox");
require("@zetachain/toolkit/tasks");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.26",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // ZetaChain Testnet
    zetachain_testnet: {
      url: "https://zetachain-evm.blockpi.network/v1/rpc/public",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 7001,
      gas: 5000000,
      gasPrice: 20000000000,
    },
    // ZetaChain Mainnet
    zetachain_mainnet: {
      url: "https://zetachain-evm.blockpi.network/v1/rpc/public",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 7000,
      gas: 5000000,
      gasPrice: 20000000000,
    },
    // Ethereum Sepolia (for testing cross-chain)
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_INFURA_KEY",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
    },
    // BSC Testnet (for testing cross-chain)
    bsc_testnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 97,
    },
    // Polygon Mumbai (for testing cross-chain)
    mumbai: {
      url: process.env.MUMBAI_RPC_URL || "https://rpc-mumbai.maticvigil.com/",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 80001,
    },
    // Local development
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // ZetaChain Localnet (Anvil)
    zetachain_localnet: {
      url: process.env.LOCALNET_RPC_URL || "http://127.0.0.1:8545",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 31337,
    },
  },
  etherscan: {
    apiKey: {
      zetachain_testnet: "abc", // ZetaChain doesn't require real API key
      zetachain_mainnet: "abc",
      sepolia: process.env.ETHERSCAN_API_KEY,
      bscTestnet: process.env.BSCSCAN_API_KEY,
      polygonMumbai: process.env.POLYGONSCAN_API_KEY,
    },
    customChains: [
      {
        network: "zetachain_testnet",
        chainId: 7001,
        urls: {
          apiURL: "https://zetachain-athens-3.blockscout.com/api",
          browserURL: "https://zetachain-athens-3.blockscout.com",
        },
      },
      {
        network: "zetachain_mainnet",
        chainId: 7000,
        urls: {
          apiURL: "https://zetachain.blockscout.com/api",
          browserURL: "https://zetachain.blockscout.com",
        },
      },
    ],
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 40000,
  },
};
