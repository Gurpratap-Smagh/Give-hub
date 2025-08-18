# ZetaChain Smart Contract Imports & Frontend Functions for Your Crowdfunding dApp

## Smart Contract Implementation

### Required Solidity Imports

Based on your pseudo-code structure, here are the essential ZetaChain contract imports you need:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// Core ZetaChain contracts for Universal App functionality
import "@zetachain/protocol-contracts/contracts/zevm/interfaces/UniversalContract.sol";
import "@zetachain/protocol-contracts/contracts/zevm/GatewayZEVM.sol";
import "@zetachain/protocol-contracts/contracts/zevm/interfaces/IZRC20.sol";

// Standard OpenZeppelin contracts for utilities
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
```

### Complete Smart Contract Implementation

Here's your crowdfunding contract with proper ZetaChain integration:

```solidity
contract CrowdfundingCampaign is UniversalContract, Ownable, ReentrancyGuard {
    GatewayZEVM public immutable gateway;
    
    struct Campaign {
        address creator;
        bool active;
        string metadata; // IPFS hash or JSON metadata
        mapping(address => mapping(address => uint256)) donatedByToken;
    }
    
    // Campaigns mapped by UUID (bytes32)
    mapping(bytes32 => Campaign) public campaigns;
    
    // Events matching your specification
    event CampaignCreated(bytes32 indexed uuid, address indexed creator);
    event Donation(address indexed sender, bytes32 indexed uuid, address indexed creator, uint256 amount, address token);
    event Active(bytes32 indexed uuid, bool active);
    
    error Unauthorized();
    error CampaignNotFound();
    error CampaignInactive();
    
    modifier onlyGateway() {
        if (msg.sender != address(gateway)) revert Unauthorized();
        _;
    }
    
    modifier onlyCreator(bytes32 uuid) {
        if (campaigns[uuid].creator != msg.sender) revert Unauthorized();
        _;
    }
    
    constructor(address payable gatewayAddress) Ownable(msg.sender) {
        gateway = GatewayZEVM(gatewayAddress);
    }
    
    /**
     * @dev Create a new campaign (called directly on ZetaChain)
     * @param uuid Unique identifier for the campaign
     * @param metadata IPFS hash or JSON string with campaign details
     */
    function createCampaign(bytes32 uuid, string calldata metadata) external {
        require(campaigns[uuid].creator == address(0), "Campaign already exists");
        
        campaigns[uuid].creator = msg.sender;
        campaigns[uuid].active = true;
        campaigns[uuid].metadata = metadata;
        
        emit CampaignCreated(uuid, msg.sender);
        emit Active(uuid, true);
    }
    
    /**
     * @dev Handle donations from connected chains via Gateway
     * @param context Cross-chain message context
     * @param zrc20 Address of the ZRC-20 token being donated
     * @param amount Amount of tokens donated
     * @param message Encoded campaign UUID
     */
    function onCall(
        MessageContext calldata context,
        address zrc20,
        uint256 amount,
        bytes calldata message
    ) external override onlyGateway nonReentrant {
        // Decode campaign UUID from message
        bytes32 uuid = abi.decode(message, (bytes32));
        
        // Validate campaign exists and is active
        if (campaigns[uuid].creator == address(0)) revert CampaignNotFound();
        if (!campaigns[uuid].active) revert CampaignInactive();
        
        // Record donation in mapping
        campaigns[uuid].donatedByToken[context.sender][zrc20] += amount;
        
        // Emit donation event with all required parameters
        emit Donation(context.sender, uuid, campaigns[uuid].creator, amount, zrc20);
    }
    
    /**
     * @dev Activate/deactivate a campaign (only creator)
     * @param uuid Campaign identifier
     * @param _active New active status
     */
    function activate(bytes32 uuid, bool _active) external onlyCreator(uuid) {
        campaigns[uuid].active = _active;
        emit Active(uuid, _active);
    }
    
    /**
     * @dev Get donation amount for a specific donor, campaign, and token
     * @param uuid Campaign identifier
     * @param donor Donor address
     * @param token ZRC-20 token address
     * @return amount Total donated amount
     */
    function getDonationAmount(
        bytes32 uuid,
        address donor,
        address token
    ) external view returns (uint256 amount) {
        return campaigns[uuid].donatedByToken[donor][token];
    }
    
    /**
     * @dev Get campaign details
     * @param uuid Campaign identifier
     * @return creator Campaign creator address
     * @return active Whether campaign is active
     * @return metadata Campaign metadata
     */
    function getCampaign(bytes32 uuid) external view returns (
        address creator,
        bool active,
        string memory metadata
    ) {
        Campaign storage campaign = campaigns[uuid];
        return (campaign.creator, campaign.active, campaign.metadata);
    }
}
```

## Frontend TypeScript Implementation

### Required Dependencies

Install the ZetaChain frontend libraries:

```bash
npm install @zetachain/toolkit @zetachain/universalkit wagmi viem
```

### Core Frontend Functions

Here are the essential TypeScript functions for your React/Next.js frontend:

```typescript
import { evmDepositAndCall, evmDeposit } from "@zetachain/toolkit";
import { parseEther, encodeFunctionData } from "viem";

// Configuration
const CAMPAIGN_CONTRACT_ADDRESS = "0xYourDeployedContractAddress";
const ZETACHAIN_TESTNET_ID = "7001"; // Athens testnet

/**
 * Create a new campaign (direct call to ZetaChain)
 */
export async function createCampaign(
  signer: any, // Viem or ethers signer
  uuid: string,
  metadata: string
) {
  const campaignId = keccak256(toBytes(uuid)); // Convert string to bytes32
  
  // Direct contract call on ZetaChain
  const contract = new Contract(CAMPAIGN_CONTRACT_ADDRESS, campaignABI, signer);
  
  const tx = await contract.createCampaign(campaignId, metadata);
  await tx.wait();
  
  return {
    transactionHash: tx.hash,
    campaignId
  };
}

/**
 * Donate to campaign from any connected EVM chain
 */
export async function donateToEVMCampaign(
  chainId: string,
  campaignUuid: string,
  donationAmount: string,
  tokenAddress?: string, // undefined for native token (ETH, BNB, etc.)
  signer: any
) {
  const campaignId = keccak256(toBytes(campaignUuid));
  const message = encodePacked(["bytes32"], [campaignId]);
  
  try {
    const result = await evmDepositAndCall({
      receiver: CAMPAIGN_CONTRACT_ADDRESS,
      amount: donationAmount,
      token: tokenAddress, // omit for native gas token
      message: message,
      revertOptions: {
        revertAddress: await signer.getAddress(),
        callOnRevert: false,
        abortAddress: CAMPAIGN_CONTRACT_ADDRESS,
        revertMessage: "0x",
        onRevertGasLimit: 0
      }
    }, {
      signer,
      chain: chainId
    });
    
    return result;
  } catch (error) {
    console.error("Donation failed:", error);
    throw error;
  }
}

/**
 * Donate from Solana to ZetaChain campaign
 */
export async function donateFromSolana(
  campaignUuid: string,
  donationAmount: string,
  solanaKeypair: any, // Solana Keypair
  tokenMint?: string // undefined for SOL
) {
  const { solanaDepositAndCall } = await import("@zetachain/toolkit");
  
  const campaignId = keccak256(toBytes(campaignUuid));
  
  const result = await solanaDepositAndCall({
    receiver: CAMPAIGN_CONTRACT_ADDRESS,
    amount: donationAmount,
    token: tokenMint,
    types: ["bytes32"],
    values: [campaignId],
    revertOptions: {
      revertAddress: solanaKeypair.publicKey.toBase58(),
      callOnRevert: false,
      revertMessage: "0x"
    }
  }, {
    chainId: "solana:devnet", // or mainnet
    signer: solanaKeypair
  });
  
  return result;
}

/**
 * Get campaign details
 */
export async function getCampaignDetails(
  campaignUuid: string,
  provider: any
) {
  const campaignId = keccak256(toBytes(campaignUuid));
  const contract = new Contract(CAMPAIGN_CONTRACT_ADDRESS, campaignABI, provider);
  
  const [creator, active, metadata] = await contract.getCampaign(campaignId);
  
  return {
    creator,
    active,
    metadata,
    uuid: campaignUuid
  };
}

/**
 * Get donation amount for specific donor and token
 */
export async function getDonationAmount(
  campaignUuid: string,
  donorAddress: string,
  tokenAddress: string,
  provider: any
) {
  const campaignId = keccak256(toBytes(campaignUuid));
  const contract = new Contract(CAMPAIGN_CONTRACT_ADDRESS, campaignABI, provider);
  
  const amount = await contract.getDonationAmount(campaignId, donorAddress, tokenAddress);
  return amount;
}

/**
 * Activate/deactivate campaign (creator only)
 */
export async function toggleCampaignStatus(
  campaignUuid: string,
  active: boolean,
  creatorSigner: any
) {
  const campaignId = keccak256(toBytes(campaignUuid));
  const contract = new Contract(CAMPAIGN_CONTRACT_ADDRESS, campaignABI, creatorSigner);
  
  const tx = await contract.activate(campaignId, active);
  await tx.wait();
  
  return tx.hash;
}

/**
 * Track cross-chain transaction status
 */
export async function trackCrosschainTransaction(txHash: string) {
  // Use ZetaChain's transaction tracking
  const response = await fetch(`https://zetachain-athens.blockpi.network/rpc/v1/tx_search?query="tx.hash='${txHash}'"&prove=true`);
  const data = await response.json();
  
  return data;
}
```

### React Hook for Campaign Management

```typescript
import { useState, useEffect } from "react";
import { useAccount, useSigner } from "wagmi";

export function useCampaignManagement() {
  const { address } = useAccount();
  const { data: signer } = useSigner();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const createCampaign = async (uuid: string, metadata: string) => {
    if (!signer) throw new Error("No signer available");
    
    setLoading(true);
    try {
      const result = await createCampaign(signer, uuid, metadata);
      
      // Refresh campaigns list
      await loadUserCampaigns();
      
      return result;
    } finally {
      setLoading(false);
    }
  };
  
  const donate = async (
    chainId: string,
    campaignUuid: string,
    amount: string,
    tokenAddress?: string
  ) => {
    if (!signer) throw new Error("No signer available");
    
    return await donateToEVMCampaign(chainId, campaignUuid, amount, tokenAddress, signer);
  };
  
  const loadUserCampaigns = async () => {
    if (!address) return;
    
    // Query events or use The Graph for campaign history
    // This would filter CampaignCreated events by creator address
  };
  
  useEffect(() => {
    loadUserCampaigns();
  }, [address]);
  
  return {
    campaigns,
    loading,
    createCampaign,
    donate,
    loadUserCampaigns
  };
}
```

### UniversalKit Integration

For a complete UI, use ZetaChain's UniversalKit components:

```typescript
import { 
  UniversalKitProvider,
  ConnectButton,
  TokenBalance,
  useBitcoinWallet
} from "@zetachain/universalkit";

export function CrowdfundingApp() {
  const { donate } = useCampaignManagement();
  const { address: btcAddress, connect: connectBTC } = useBitcoinWallet();
  
  return (
    
      
        
        
        {/* Bitcoin wallet connection */}
        
          Connect Bitcoin Wallet
        
        
        {/* Campaign creation form */}
        
        
        {/* Donation interface */}
        
        
        {/* Token balances across chains */}
        
      
    
  );
}
```

## Key Integration Points

1. **Universal Contract Interface**: Your contract implements `UniversalContract` and handles `onCall` for cross-chain donations[1][2]

2. **Gateway Integration**: Use `GatewayZEVM` for outgoing calls and receive donations through the Gateway's `onCall` mechanism[3]

3. **ZRC-20 Support**: All donated tokens arrive as ZRC-20 representations, enabling unified token handling[4]

4. **Multi-chain Frontend**: Use Toolkit functions for different chains (EVM, Solana, Bitcoin, etc.)[5][6]

5. **Event Tracking**: Your contract events enable comprehensive donation tracking and history[1]

This implementation provides exactly the functionality described in your pseudo-code while leveraging ZetaChain's universal crypto capabilities for seamless multi-currency crowdfunding campaigns.

[1] https://www.zetachain.com/docs/developers/tutorials/call/
[2] https://www.zetachain.com/docs/developers/tutorials/hello/
[3] https://www.zetachain.com/docs/developers/evm/gateway/
[4] https://www.zetachain.com/docs/developers/evm/zrc20/
[5] https://www.zetachain.com/docs/reference/toolkit/
[6] https://www.npmjs.com/package/@zetachain/toolkit
[7] https://www.zetachain.com/docs/start/evm/
[8] https://github.com/sherlock-audit/2025-05-dodo-cross-chain-dex-judging/issues/263
[9] https://www.zetachain.com/docs/developers/evm/
[10] https://github.com/zeta-chain/node/issues/1804
[11] https://www.zetachain.com/docs/start/app/
[12] https://www.youtube.com/watch?v=UrAMdR807JQ
[13] https://www.npmjs.com/package/@zetachain/protocol-contracts/v/7.0.0
[14] https://www.coinbase.com/en-ca/developer-platform/discover/protocol-guides/guide-to-zetachain
[15] https://www.zetachain.com/docs/developers/chains/zetachain/
[16] https://www.zetachain.com/docs/developers/chains/evm/
[17] https://github.com/zeta-chain/FluidUSDC
[18] https://audits.sherlock.xyz/contests/857
[19] https://github.com/zeta-chain/standard-contracts
[20] https://www.youtube.com/watch?v=4PLFJ0LnVcQ
[21] https://github.com/zeta-chain/toolkit
[22] https://www.zetachain.com/docs/developers/architecture/protocol/contracts/evm/GatewayEVM.sol/contract.GatewayEVM
[23] https://blog.tenderly.co/build-universal-apps-on-zetachain-with-tenderly/
[24] https://github.com/zeta-chain/example-frontend
[25] https://www.zetachain.com/docs/reference/universalkit/
[26] https://www.youtube.com/watch?v=h2BcitZPMn4
[27] https://aptos.dev/build/sdks/ts-sdk/ts-examples
[28] https://www.reddit.com/r/nextjs/comments/1jt9i3m/master_the_2025_stack_complete_guide_to_nextjs_15/
[29] https://github.com/zeta-chain/template
[30] https://www.gate.com/learn/articles/understanding-zetachain-a-beginners-guide/3593
[31] https://www.zetachain.com/docs/developers/tutorials/messaging/
[32] https://functional.works-hub.com/jobs/remote-senior-typescript-engineer-886
[33] https://dev.to/spataroinc/how-to-add-50-integrations-to-your-react-app-for-free-56h7
[34] https://www.zetachain.com/whitepaper.pdf
[35] https://www.npmjs.com/~fadeev
[36] https://trustwallet.com/ru/blog/guides/beginners-guide-to-zeta-chain
[37] https://www.zetachain.com/blog/introduction-to-universal-apps-on-zetachain
[38] https://www.zetachain.com/docs/reference/
[39] https://www.zetachain.com/blog/zetachain-now-supports-sui-with-native-btc-and-full-universal-interop