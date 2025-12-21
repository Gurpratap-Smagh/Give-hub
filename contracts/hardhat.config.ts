import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import "@typechain/hardhat";
import "@zetachain/toolkit/tasks";
import "dotenv/config";

const config: HardhatUserConfig = {
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
    // ZetaChain Testnet (Athens)
    zetachain_testnet: {
      url:
        process.env.ZETA_HTTP ||
        "https://zetachain-athens-evm.blockpi.network/v1/rpc/public",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 7001,
      gas: 5_000_000,
      gasPrice: 20_000_000_000,
    },
    // Alias so `--network zetachain` works
    zetachain: {
      url:
        process.env.ZETA_HTTP ||
        "https://zetachain-athens-evm.blockpi.network/v1/rpc/public",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 7001,
      gas: 5_000_000,
      gasPrice: 20_000_000_000,
    },
    // ZetaChain Athens (Alchemy)
    zeta_athens: {
      url:
        process.env.ZETA_HTTP ||
        "https://zetachain-testnet.g.alchemy.com/v2/w7aPAiyoYb5dp_tCmL1ZAU5kAlEnZDXw",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 7001,
      gas: 5_000_000,
      gasPrice: 20_000_000_000,
    },
    // ZetaChain Mainnet
    zetachain_mainnet: {
      url: "https://zetachain-evm.blockpi.network/v1/rpc/public",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 7000,
      gas: 5_000_000,
      gasPrice: 20_000_000_000,
    },
    // Other testnets for cross-chain testing
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL ||
        "https://sepolia.infura.io/v3/YOUR_INFURA_KEY",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
    },
    bsc_testnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 97,
    },
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
      zetachain_testnet: "abc",
      zetachain_mainnet: "abc",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      bscTestnet: process.env.BSCSCAN_API_KEY || "",
      polygonMumbai: process.env.POLYGONSCAN_API_KEY || "",
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
    timeout: 40_000,
  },
};
export default config;
