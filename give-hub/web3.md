# GiveHub Web3 Integration Guide

This project currently runs in off-chain mode. All wallet prompts and contract calls have been removed from the user flows for campaign creation, campaign editing, and donations. This document outlines where to re-introduce Web3 logic, which environment variables to use, suggested libraries, and recommended patterns.

Use this as a blueprint to integrate a production-grade blockchain flow with clear separation of concerns.

---

## Architecture Overview

- UI triggers off-chain actions today. Web3 is reintroduced only where marked in code.
- Primary touchpoints:
  - `app/create/page.tsx` → form submit handler for creating a campaign
  - `app/studio/page.tsx` → save handler for editing a campaign
  - `lib/payments/index.ts` → donation processing adapter (provider switch via env)
- Optional helpers/archives:
  - `lib/web3/client.ts` (legacy helper prototype; not imported by flows)
  - `lib/services/zetachain.ts` (example provider/ABI container for server-side utilities)
  - `lib/sync/indexer.ts` (example off-chain indexer reading chain events)

---

## Environment Variables

Set these in `.env.local` (frontend) and/or deployment secrets.

- NEXT_PUBLIC_PAYMENT_PROVIDER: 'local' | 'mock' | 'zetachain'
- NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS: 0x...
- NEXT_PUBLIC_ZETA_CHAIN_ID: e.g. 7001 (testnet)
- NEXT_PUBLIC_ZETA_RPC_URL: https://...
- Optional UX labels:
  - NEXT_PUBLIC_ZETA_CHAIN_NAME: e.g. "ZetaChain Testnet"
  - NEXT_PUBLIC_ZETA_NATIVE_SYMBOL: e.g. "ZETA"
  - NEXT_PUBLIC_ZETA_EXPLORER_URL: https://...

Tips:
- Treat NEXT_PUBLIC_* values as public. Never put secrets in them.
- For server-only jobs (e.g., indexers), prefer non-public names without NEXT_PUBLIC_ prefix.

---

## Integration Points in Code

Below are the exact places to add back wallet and contract logic. Search for the TODO(web3) markers or reference paths/handlers called out here.

### 1) Campaign Creation
- File: `app/create/page.tsx`
- Handler: `handleSubmit()`
- Current behavior: Off-chain POST to `/api/campaigns` with `onChainId: null`.
- Where to integrate:
  1. Ensure wallet connection and network:
     - Detect injected provider (e.g., MetaMask)
     - Switch/add target chain (ZetaChain) if needed
  2. (Optional) Register creator on-chain (e.g., `registerCreator(username, preferredToken)`)
  3. Pre-check duplication by title via on-chain event logs (`CampaignCreated`) to avoid duplicates (compare `creator` vs current wallet).
  4. Send `createCampaign(...)` and wait for receipt; parse `CampaignCreated` to obtain `campaignId`.
  5. Set `onChainId` in the payload to backend.

- Suggested structure:
  - Re-introduce a minimal helper in `lib/web3/client.ts` or a new `lib/web3/campaigns.ts` that:
    - connects wallet
    - ensures chain/network
    - sends transaction via signer
    - parses receipt/events

### 2) Campaign Editing
- File: `app/studio/page.tsx`
- Handler: `handleSave(update)`
- Current behavior: Off-chain PUT to `/api/campaigns/[id]/edit` only.
- Where to integrate:
  1. If campaign has `onChainId`, ensure wallet/network
  2. Call contract `updateCampaign(...)` (or your chosen fields), await receipt
  3. If success, proceed to off-chain PUT; otherwise surface error

- Recommended: Keep on-chain sync best-effort but explicit to the user. If chain update fails, show an error and do not persist off-chain changes to maintain consistency unless you explicitly want to allow temporary divergence.

### 3) Donations
- File: `lib/payments/index.ts`
- Entry point: `processDonation(input)`
- Provider selection: `NEXT_PUBLIC_PAYMENT_PROVIDER`
  - `local` → stores in localStorage (demo only)
  - `mock` → POST `/api/payments` (demo server)
  - `zetachain` → currently returns a placeholder error

- Where to integrate:
  - Implement `processWithZetaChain(input)` to:
    1. Ensure wallet + target chain
    2. Convert `amount` to native units (e.g., `parseEther` for ZETA)
    3. Call `donate(campaignId, token=address(0), amount, donorName, memo="", { value: amount })`
    4. Wait for receipt and return `{ ok: true, txId }`

---

## Libraries and Versions

- Preferred: `ethers` v6
- Basic patterns:
  - Browser provider: `new ethers.BrowserProvider(window.ethereum)`
  - Signer: `await provider.getSigner()`
  - Contract: `new ethers.Contract(address, abi, signer)`
  - Switch chain: `wallet_switchEthereumChain`
  - Add chain (4902): `wallet_addEthereumChain`

Ensure the ABI you use matches the deployed contract.

---

## Contract ABI & Events

- Example ABI location: `lib/abi/givehub.ts` (ensure it is aligned with the deployed binary)
- Key functions (example names—adjust to your contract):
  - `registerCreator(string username, address preferredToken)`
  - `createCampaign(string title, string description, string category, uint256 goal, bytes32 imageHash)`
  - `updateCampaign(uint256 id, string title, string description, string category, uint256 goal, bytes32 imageHash)`
  - `donate(uint256 campaignId, address token, uint256 amount, string donorName, string memo)`
- Key events:
  - `CampaignCreated(uint256 id, address creator, string title, ...)`
  - `CampaignUpdated(uint256 id, ...)`
  - `DonationReceived(uint256 id, address donor, uint256 amount, ...)`

Use event logs to:
- Map on-chain IDs to off-chain records
- Pre-check duplicates (e.g., campaign by title & creator)
- Audit and reconcile off-chain store

---

## Network Management

- Target chain: ZetaChain (testnet by default)
- Example chain data (customize):
  - chainId: `7001`
  - name: `ZetaChain Testnet`
  - nativeCurrency: `{ name: 'ZETA', symbol: 'ZETA', decimals: 18 }`
  - rpcUrls: `[NEXT_PUBLIC_ZETA_RPC_URL]`
  - blockExplorerUrls: optional

Flow:
1. Query `provider.getNetwork()` and compare `chainId`
2. Try `wallet_switchEthereumChain`
3. If 4902, call `wallet_addEthereumChain` with data above

---

## UX Considerations

- Always provide explicit prompts and feedback:
  - Pre-submit checks (e.g., title exists on chain?)
  - Network mismatch guidance
  - Clear confirmations on success/errors
- Avoid silent failures; bubble errors to UI via `notify()` pattern (see `app/` pages using `lib/utils/notify`).
- Consider optimistic UI only after transaction is broadcasted and receipt is confirmed.

---

## Security & Validation

- Client-side only for wallet prompts; never store secrets in the client.
- Validate environment and contract addresses; reject zero addresses.
- Handle reorgs: confirm by waiting N blocks, if critical.
- Sanitize user-provided strings for on-chain usage (length, encoding).

---

## Testing Checklist

- Happy path: connect → switch/add chain → sign → receipt parsed → UI updates
- Failure paths:
  - No wallet installed
  - Wrong network + switch rejected
  - Tx rejected
  - RPC failure
- Event parsing:
  - CampaignCreated event captured with correct id
  - DonationReceived logged with expected values

---

## Future Enhancements

- Background indexer (`lib/sync/indexer.ts`) to reconcile off-chain state with chain events
- Webhook or server job to verify on-chain receipts and update DB
- Multi-token support
- On-chain image hashing and content addressing (IPFS/Arweave)

---

## Quick Start (re-enable on-chain donations)

1) Set envs: NEXT_PUBLIC_PAYMENT_PROVIDER=zetachain, contract address/chain details
2) Implement `processWithZetaChain` in `lib/payments/index.ts`
3) Switch UI labels if needed (already adapts via `NEXT_PUBLIC_PAYMENT_PROVIDER`)
4) Test with a wallet on ZetaChain testnet

For campaign create/edit, follow the Integration Points above and keep server and client behavior consistent.
