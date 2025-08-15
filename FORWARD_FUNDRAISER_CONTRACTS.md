# Give-Hub: Forward Fundraiser Contracts Usage Guide

This guide explains how to use the minimal direct-forward fundraiser contracts in Give-Hub.

Contracts:
- `contracts/BaseForwardFundraiser.sol` (abstract base)
- `contracts/DirectForwardFundraiser.sol` (deployable)

Key properties:
- No escrow: donations are forwarded immediately to the campaign creator.
- Minimal state on-chain; rich history is off-chain via events.
- Reentrancy protected donation flow.

## 1) Prerequisites

- Solidity ^0.8.26
- OpenZeppelin Contracts (v5 recommended)
- Toolchain: Hardhat or Foundry

### OpenZeppelin imports
- Foundry + remappings:
  - `forge install OpenZeppelin/openzeppelin-contracts`
  - add remapping: `openzeppelin-contracts/=lib/openzeppelin-contracts/`
- Hardhat + npm:
  - `npm i @openzeppelin/contracts`
  - change imports in contracts to `@openzeppelin/contracts/...` if you prefer npm path
  - TODO: REPLACE imports in `contracts/BaseForwardFundraiser.sol` and `contracts/DirectForwardFundraiser.sol` from `openzeppelin-contracts/...` to `@openzeppelin/contracts/...` when using npm

### Ownable constructor (OZ version)
- OZ v5: `Ownable(initialOwner)` (already used in code)
- OZ v4: change to `Ownable()` and call `transferOwnership(initialOwner)` in the constructor body
  - TODO: REPLACE the base constructor in `BaseForwardFundraiser` accordingly if you use OZ v4

## 2) Deploy

Example Hardhat script:

```ts
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const Contract = await ethers.getContractFactory("DirectForwardFundraiser");
  const contract = await Contract.deploy(deployer.address); // TODO: REPLACE owner if deploying from another account
  await contract.deployed();
  console.log("DirectForwardFundraiser:", contract.address);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Example Foundry:

```solidity
// script/Deploy.s.sol
// forge script script/Deploy.s.sol --rpc-url $RPC --private-key $PK --broadcast
pragma solidity ^0.8.26;
import "forge-std/Script.sol";
import {DirectForwardFundraiser} from "contracts/DirectForwardFundraiser.sol";

contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address owner = vm.envAddress("OWNER"); // TODO: REPLACE with your desired owner address
        vm.startBroadcast(pk);
        new DirectForwardFundraiser(owner);
        vm.stopBroadcast();
    }
}
```

## 3) Core functions

- `createCampaign(address preferredToken, uint96 start, uint96 end) returns (uint256 campaignId)`
  - `preferredToken`: `address(0)` for native, or ERC-20 address
  - `start`: unix timestamp; `0` to start immediately
  - `end`: unix timestamp; `0` for no end
  - emits `CampaignCreated` and `CampaignStatus`

- `setActive(uint256 campaignId, bool active_)`
  - Only creator or owner
  - emits `CampaignStatus`

- `donate(uint256 campaignId, address token, uint256 amount, string memo)` (payable)
  - Native path: `token == address(0)`, send `msg.value == amount`
  - ERC-20 path: approve first; contract pulls via `transferFrom` and forwards to creator
  - Updates aggregates and emits `Donation(campaignId, donor, token, amount, memo)`

- Views:
  - `exists(uint256 campaignId) -> bool`
  - `donatedOf(uint256 campaignId, address donor, address token) -> uint256`

## 4) Examples

### Create campaign
```ts
const tx = await contract.createCampaign(ethers.constants.AddressZero, 0, 0);
const rc = await tx.wait();
const evt = rc.events?.find(e => e.event === "CampaignCreated");
const campaignId = evt?.args?.campaignId;
```

### Donate native token
```ts
await contract.donate(campaignId, ethers.constants.AddressZero, ethers.utils.parseEther("0.1"), "For good cause", {
  value: ethers.utils.parseEther("0.1"), // TODO: REPLACE amount
});
```

### Donate ERC-20 token
```ts
const erc20 = new ethers.Contract(tokenAddr, ["function approve(address,uint256) external returns (bool)"], signer); // TODO: REPLACE tokenAddr
await erc20.approve(contract.address, amount); // TODO: REPLACE amount
await contract.donate(campaignId, tokenAddr, amount, "Go!"); // TODO: REPLACE memo
```

## 5) Events to index (off-chain)

- `CampaignCreated(campaignId, creator, preferredToken, start, end)`
- `CampaignStatus(campaignId, active)`
- `Donation(campaignId, donor, token, amount, memo)`

Use a subgraph/indexer to reconstruct full history and analytics.

## 6) ZetaChain hooks (integration later)

In `DirectForwardFundraiser.sol` you have stubs:
- `onMessageReceive(bytes payload) external payable`
- `onMessageRevert(bytes payload) external`
- `onRevert(bytes payload) external`

Suggested next steps:
- Restrict callers (only Zeta system contracts)
  - TODO: REPLACE `ZETA_SYSTEM_CONTRACT` placeholder and add `require(msg.sender == ZETA_SYSTEM_CONTRACT, "unauthorized");`
- Define payload schema, decode, and call `donate(...)`
  - TODO: REPLACE the example `abi.decode(payload, ...)` with your actual schema
- Handle revert/abort paths and emit detailed events

## 7) Security notes

- No escrow: funds are forwarded immediately
- `nonReentrant` on `donate`
- Validate time windows; toggle active state if needed
- Apply access control on cross-chain hooks

## 8) Testing checklist

- Create campaign, toggle active
- Native donate (correct `msg.value`), ERC-20 donate (approve -> donate)
- Aggregates update: `totalDonated` and `donatedByToken`
- Time window enforcement
- Event emission

## 9) Integration in Give-Hub app

- Create campaigns from creator dashboard
- For donations:
  - If native: call `donate(...)` with `token = address(0)` and `value = amount`
  - If ERC-20: show approval UI then call `donate(...)`
- Subscribe to events to update UI and analytics

If you want, I can add ready-to-run scripts (Hardhat/Foundry) and a minimal indexer template to track events. 
