# Deploying GiveHub to Testnet (ZetaChain)

This guide explains how to switch from the local dev setup to ZetaChain testnet. It covers contracts deployment, environment variables, router/token setup, and frontend configuration.

If you only need a quick checklist, skip to the end.

---

## 1) Prerequisites

- __Wallet__: MetaMask or Zeta-compatible wallet.
- __Testnet ZETA__: Get ZETA from ZetaChain faucet (see official docs) to pay gas.
- __RPC + Explorer__: Get the testnet RPC URL and Explorer URL from ZetaChain docs.
- __WZETA + SystemContract addresses__: From ZetaChain docs for the specific testnet.
- __Private key__: A funded testnet wallet private key exported as an env var (DO NOT commit).

---

## 2) Configure Hardhat for Testnet

Add a testnet network to `contracts/hardhat.config.js` if not present.

Example (update RPC and account key):

```js
networks: {
  localhost: { url: 'http://127.0.0.1:8545' },
  zetatest: {
    url: process.env.ZETA_RPC_URL, // e.g. Zeta testnet RPC from docs
    accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    chainId: Number(process.env.ZETA_CHAIN_ID || '7001'),
  },
},
```

Required env vars (place in `contracts/.env` — never commit secrets):

```env
ZETA_RPC_URL=https://<zetachain-testnet-rpc>
ZETA_CHAIN_ID=7001
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```

---

## 3) Set Contract Environment Variables

Our contract uses the following envs in `contracts/.env`:

```env
# Zeta addresses – get from ZetaChain testnet docs
WZETA_ADDRESS=0x...      # WZETA (wrapped ZETA)
SYSTEM_CONTRACT_ADDRESS=0x...

# Optional DEX router – leave empty if you want fallback-to-WZETA behavior
# If you have a UniswapV2-compatible router deployed on testnet, set it here.
UNISWAP_ROUTER=
```

Notes:
- If `UNISWAP_ROUTER` is left empty, donations will gracefully fallback to paying creators in WZETA when a swap is requested.
- If you plan to swap into other ZRC-20 tokens on testnet, you must either:
  - Deploy and seed a UniswapV2-compatible router and pools on testnet, or
  - Integrate a router available on Zeta testnet (if any), and set its address here.

---

## 4) Deploy Contracts to Testnet

From the `contracts/` directory:

```bash
# Install deps (first time)
npm install

# Compile
npm run compile

# Deploy CrossChainCrowdfund to testnet
npx hardhat run scripts/deploy.js --network zetatest
```

Take note of the deployed `CrossChainCrowdfund` address printed by the script.

Optionally wire a router (only if you set up a UniswapV2 router on testnet):

```js
// via hardhat console, script, or UI
await crossChainCrowdfund.setUniswapRouter("0xYourRouterOnTestnet")
```

Recommended for early testing: keep preferred token as `WZETA` to avoid swaps.

---

## 5) Frontend Environment (Next.js)

Edit `give-hub/.env.local`:

```env
# Select on-chain provider
NEXT_PUBLIC_PAYMENT_PROVIDER=zetachain

# Zeta testnet chain info
NEXT_PUBLIC_ZETA_CHAIN_ID=7001
NEXT_PUBLIC_ZETA_RPC_URL=https://<zetachain-testnet-rpc>
NEXT_PUBLIC_ZETA_EXPLORER_URL=https://<zetachain-testnet-explorer>

# Deployed contracts
NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS=0xYourCrowdfundOnTestnet

# Tokens / Router
NEXT_PUBLIC_WZETA_ADDRESS=0x...
# Optional – only if you actually have a router on testnet
NEXT_PUBLIC_UNISWAP_ROUTER=0x...

# Optional: token options displayed to creators (if you have testnet tokens)
# Provide addresses for any ZRC-20s you want to appear in the dropdown
NEXT_PUBLIC_ETHZ_ADDRESS=0x...
NEXT_PUBLIC_BTCZ_ADDRESS=0x...
```

Then build/run the frontend:

```bash
cd give-hub
npm install
npm run dev
```

---

## 6) Creator Preferences and Swaps on Testnet

- __Best first run__: set campaign preferred token to `WZETA`. No swap required; everything should work immediately.
- __If choosing a non-WZETA token__ and you have not wired a router:
  - Donations will fallback to paying the creator in WZETA.
  - The UI will show a toast: “Swap unavailable, paid in WZETA (fallback used)”.
- __If you wired a router and seeded liquidity__ for `WZETA-<YourToken>`:
  - The contract will attempt `swapExactTokensForTokens` via your router.
  - On success, event `SwapExecuted` is emitted and the creator is paid in the preferred token.
  - On failure, event `PaidInWZETA` is emitted and creator is paid in WZETA.

---

## 7) Wallet: Add Testnet to MetaMask

- Use `NEXT_PUBLIC_ZETA_CHAIN_ID`, RPC URL, currency symbol (ZETA) from Zeta docs.
- The app attempts `wallet_switchEthereumChain`. If MetaMask doesn’t recognize the chain, add it manually.

---

## 8) Verifying End-to-End

1. __Create a campaign__ in the UI and set preferred token.
2. __Donate__ from the payment modal.
3. __Observe toast__: whether swap happened or WZETA fallback.
4. __Open Explorer__: Follow the link if `NEXT_PUBLIC_ZETA_EXPLORER_URL` is set.
5. __Check balances__: Creator should receive tokens on testnet.

---

## 9) Cross-Chain Notes

- This app is built as a ZetaChain Universal App. For true cross-chain deposits (e.g., originating from Ethereum/BTC/Solana), ensure:
  - Correct `SystemContract` address is set.
  - ZRC-20 representations are configured and supported on the testnet.
  - Any DEX/router you rely on exists on testnet with sufficient liquidity.
- If you’re only testing single-chain Zeta testnet donations, `donateNative()` + WZETA flow is sufficient.

---

## 10) Troubleshooting

- __Swap failed / PaidInWZETA__: No router set or no liquidity. This is expected unless you configure a router.
- __InvalidCampaign / CampaignInactive__: Ensure the campaign exists and is active on-chain.
- __InvalidToken__: Preferred token address is invalid or not a ZRC-20/WZETA on this network.
- __Insufficient funds__: Fund your testnet wallet with ZETA for gas.
- __RPC/Chain errors__: Verify `NEXT_PUBLIC_ZETA_CHAIN_ID` and RPC URL.

---

## Quick Checklist

- __Contracts__
  - [ ] Set `ZETA_RPC_URL`, `ZETA_CHAIN_ID`, `DEPLOYER_PRIVATE_KEY` in `contracts/.env`
  - [ ] Set `WZETA_ADDRESS`, `SYSTEM_CONTRACT_ADDRESS` in `contracts/.env`
  - [ ] Optional: set `UNISWAP_ROUTER` if you have one on testnet
  - [ ] Deploy: `npx hardhat run scripts/deploy.js --network zetatest`

- __Frontend__
  - [ ] `NEXT_PUBLIC_PAYMENT_PROVIDER=zetachain`
  - [ ] `NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS=0x...`
  - [ ] `NEXT_PUBLIC_WZETA_ADDRESS=0x...`
  - [ ] Optional: `NEXT_PUBLIC_UNISWAP_ROUTER=0x...`
  - [ ] Optional: token addresses for dropdown
  - [ ] Run: `npm run dev`

- __Test__
  - [ ] Create campaign (prefer `WZETA` initially)
  - [ ] Donate
  - [ ] Check explorer + creator balance
