# GiveHub No-Escrow Donation Model

This document explains the “no escrow” architecture for GiveHub donations:
- Donor pays in whatever they have.
- ZetaChain handles cross-chain delivery and swap.
- Funds are forwarded immediately to the campaign creator.
- The contract does not hold balances and there is no “withdraw” step.

## Goals
- Immediate delivery: creators receive funds as soon as the donation is processed.
- No contract custody: the contract does not store funds or require withdrawals.
- Cross-chain support via ZetaChain Universal App pattern.

## High-Level Flow
1) Donor initiates a donation (same-chain or cross-chain).
2) ZetaChain routes the payment to the UniversalContract on Zeta as ZRC-20 (or native ZETA) with payload.
3) Contract decodes payload, optionally swaps to the creator’s preferred ZRC-20, and immediately transfers tokens to the creator.
4) Contract emits events for analytics but keeps no balances.

## Contract Design
File: `contracts/_archive_min_rollback/CrossChainCrowdfund.sol`

- Keep `createCampaign(...)` and campaign metadata as-is.
- Replace donation handling to “forward on receipt”:
  - In `_handleDonation(...)`:
    - After computing `convertedAmount`, call `IZRC20(campaign.preferredZRC20).transfer(campaign.creator, convertedAmount)`.
    - Remove the internal `campaignTokenBalances[...] += convertedAmount;` (or leave out of code entirely).
    - Emit `ContributionReceived` for analytics/UX.
- Remove/disable `withdrawCampaignFunds(...)`:
  - If kept, make it revert with a clear message like: "No-escrow mode: nothing to withdraw".
- Swapping:
  - `_swapTokens(...)` is currently a placeholder. Wire it to Zeta’s DEX/Router when available so donations are converted automatically to the creator’s preferred token.

### Optional: Same-Chain Native Donations (Zeta)
Add a payable entrypoint (example): `donate(uint256 campaignId, string note)` which:
- Wraps native ZETA to WZETA: `IWZETA(WZETA).deposit{value: msg.value}()`.
- Swaps WZETA to the creator’s preferred ZRC-20 if necessary.
- Immediately transfers tokens to `campaign.creator`.

## Frontend Integration
Files: `lib/web3/client.ts`, `app/studio/page.tsx`

- Donations
  - On Zeta: call `donate(...)` with `{ value }` when donating in native ZETA.
  - Cross-chain: use Zeta’s official cross-chain donation flow so the UniversalContract `onCall(...)` is invoked by the Zeta system. Avoid calling `onCall` directly from an EOA—no system transfer/mint occurs in that case.
- UI/UX
  - Remove or hide “Withdraw All On-Chain Funds” from `app/studio/page.tsx`.
  - Replace with text: “Direct-forward mode: donations are instantly delivered to your wallet.”
  - Keep analytics panels (events, totals) sourced from on-chain events or off-chain DB, not from a contract balance.

## Local vs Testnet
- Local
  - You can test immediate forward using `donate` with `{ value }`. Cross-chain simulation requires mocks; a plain EOA `onCall` won’t mint ZRC-20.
- Testnet
  - Same-chain (Zeta): works immediately with `donate`.
  - Cross-chain: configure ZetaChain messaging so your contract’s `onCall` is invoked by the system, delivering ZRC-20 funds. Then swap and forward.

## Required Env Vars (frontend)
- `NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS`
- `NEXT_PUBLIC_ZETA_CHAIN_ID` (e.g., 7001)
- `NEXT_PUBLIC_ZETA_RPC_URL`
- Optionally: `NEXT_PUBLIC_ZETA_CHAIN_NAME`, `NEXT_PUBLIC_ZETA_NATIVE_SYMBOL`, `NEXT_PUBLIC_ZETA_EXPLORER_URL`

## Migration Checklist
- Contract
  - [ ] Remove internal balance mapping updates in `_handleDonation(...)`.
  - [ ] Add immediate `transfer` to `campaign.creator`.
  - [ ] Remove/disable `withdrawCampaignFunds(...)`.
  - [ ] (Optional) Add `donate(...)` + wrap/swap logic.
  - [ ] Wire `_swapTokens(...)` to Zeta Router when ready.
- Frontend
  - [ ] Update donation to use `donate(...)` on Zeta and Zeta cross-chain flow for other chains.
  - [ ] Remove Withdraw UI from `app/studio/page.tsx`.
  - [ ] Update copy: "Funds are forwarded instantly; no escrow." 

## Testing Checklist
- Same-chain (Zeta)
  - [ ] Donate with native ZETA and verify creator receives tokens immediately.
  - [ ] Verify `ContributionReceived` emits with correct args.
- Cross-chain
  - [ ] Send from another chain through Zeta, confirm arrival as ZRC-20.
  - [ ] Confirm swap + forward to creator.
- Edge cases
  - [ ] Invalid campaign ID → revert.
  - [ ] Zero amount → revert.
  - [ ] Preferred token equals input token (swap path skipped).

## Future Work
- Integrate Zeta Router for real swaps in `_swapTokens(...)`.
- Add per-campaign preferred token updates with proper access control.
- Add robust analytics (indexer or subgraph) based on events instead of balances.

---
In no-escrow mode, the contract never holds user funds. Donations are converted and forwarded instantly to the creator, simplifying UX and removing withdrawal complexity while leveraging ZetaChain for cross-chain delivery.
