# Campaign Creation Workflow - Complete On-Chain Integration

## Overview

The campaign creation workflow now properly implements the complete on-chain sequence:

1. **Campaign Creation** → `createCampaign(preferredZRC20)`
2. **Payout Token Setup** → `updateCampaignPayoutToken(campaignId, preferredZRC20)`
3. **Payout Configuration** → `updateCampaignDestination(campaignId, payoutAddress, payoutGasLimit)`
4. **Database Save** → MongoDB campaign record with all metadata

## UI Form Fields

### Basic Configuration
- **Campaign Title** (required) - Short, compelling title
- **Campaign Description** (required) - Detailed explanation, goals, fund usage
- **Funding Goal** (required) - Target amount in base units
- **Campaign Category** (required) - Select from predefined categories or "Other"
- **Preferred Payout Token** (required) - Token donations will be swapped to (WZETA, zETH, etc.)

### Payout Configuration (Advanced)
- **Payout Address** (optional) - EVM address where funds will be sent
  - If empty: defaults to your connected wallet
  - If provided: must be valid 0x address
  - Different from wallet address when sending to multi-sig, DAO treasury, etc.

- **Payout Gas Limit** (required) - Gas for cross-chain payout execution
  - Range: 50,000 - 500,000
  - Default: 100,000
  - Increase for complex cross-chain operations
  - Typical values:
    - **50,000-100,000**: Simple withdrawals on same chain
    - **100,000-150,000**: Standard cross-chain operations
    - **200,000-300,000**: Complex swaps and multi-hop withdrawals
    - **300,000+**: Advanced scenarios with multiple token swaps

## Form Validation

```typescript
// Title, description, goal, category are required
if (!formData.title || !formData.description || !formData.goal || !formData.category) {
  showError("Please fill in all required fields", "Validation Error");
}

// Payout address must be valid if provided
if (formData.payoutAddress && !isAddress(formData.payoutAddress)) {
  showError("Payout address must be a valid EVM address (0x...)", "Validation Error");
}

// Gas limit must be in range
const gasLimit = parseInt(formData.payoutGasLimit || '100000', 10);
if (gasLimit < 50000 || gasLimit > 500000) {
  showError("Gas limit must be between 50,000 and 500,000", "Validation Error");
}
```

## Backend Processing Flow

### Step 1: Form Submission
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  
  // Validate all fields
  // Extract payoutAddress and payoutGasLimit from form
  
  const payoutAddress = formData.payoutAddress || connectedWalletAddress;
  const payoutGasLimit = parseInt(formData.payoutGasLimit || '100000', 10);
```

### Step 2: On-Chain Operations
```typescript
const res = await createAndConfigureCampaign({
  preferredZRC20: selectedToken,           // User's preferred token
  payoutAddress: formData.payoutAddress || address,  // Override or use wallet
  payoutGasLimit: parseInt(formData.payoutGasLimit, 10),  // 50k-500k
});
// Returns: { campaignId, txHash }
```

### Step 3: Multi-Step Execution
Inside `createAndConfigureCampaign()`:

1. **Create Campaign**
   ```solidity
   createCampaign(preferredZRC20)
   // Emits: CampaignCreated(campaignId, creator, preferredZRC20)
   ```

2. **Set Payout Token**
   ```solidity
   updateCampaignPayoutToken(campaignId, preferredZRC20)
   ```

3. **Configure Payout**
   ```solidity
   updateCampaignDestination(campaignId, payoutAddress, payoutGasLimit)
   // Stores payout address and gas limit on-chain
   ```

4. **Return Final TX Hash**
   - Returns hash of the last successful transaction
   - UI shows explorer link for verification

### Step 4: Database Save
```typescript
const campaignData = {
  title: formData.title,
  description: formData.description,
  goal: parseFloat(formData.goal),
  category: formData.category,
  preferredZRC20: preferredToken,
  payoutAddress: formData.payoutAddress,
  payoutGasLimit: parseInt(formData.payoutGasLimit, 10),
  creatorId: user.id,
  onChain: {
    chainId: 7001,  // ZetaChain
    contract: CROWDFUND_ADDRESS,
    campaignId: onChainCampaignId.toString(),
  }
};

await fetch('/api/campaigns', { method: 'POST', body: JSON.stringify(campaignData) });
```

## Smart Contract Functions Called

### createCampaign(preferredZRC20)
```solidity
function createCampaign(address preferredZRC20) external {
  require(msg.sender != address(0), "InvalidAddress");
  require(IZRC20(preferredZRC20).decimals() > 0, "InvalidToken");
  
  uint256 campaignId = nextCampaignId++;
  campaigns[campaignId] = Campaign({
    creator: msg.sender,
    preferredZRC20: preferredZRC20,
    active: true,
    payoutAddress: address(0),  // Unset initially
    payoutGasLimit: 0           // Unset initially
  });
  
  emit CampaignCreated(campaignId, msg.sender, preferredZRC20);
}
```

### updateCampaignDestination(campaignId, payoutAddress, payoutGasLimit)
```solidity
function updateCampaignDestination(
  uint256 campaignId,
  address payoutAddress,
  uint256 payoutGasLimit
) external {
  Campaign storage campaign = campaigns[campaignId];
  require(campaign.creator == msg.sender, "NotCreator");
  
  campaign.payoutAddress = payoutAddress;
  campaign.payoutGasLimit = payoutGasLimit;
}
```

## User Feedback During Creation

```
1. "Validating campaign data..." (form validation)
   ↓
2. "Creating on-chain campaign..." (connecting wallet, switching network)
   ↓
3. "Confirm campaign creation in MetaMask..." (wallet confirmation)
   ↓
4. "Campaign created on blockchain! Saving to database..."
   ↓
5. "Saving campaign to database..." (API POST /api/campaigns)
   ↓
6. ✅ "Campaign created successfully!"
   └─→ Redirect to /campaign/{campaignId}
```

## Error Handling

### Validation Errors (Before Blockchain)
- Missing required fields → Show error, stay on form
- Invalid payout address format → Show error, stay on form
- Gas limit out of range → Show error, stay on form

### Wallet Errors (During Blockchain)
- Wallet not connected → Prompt to connect
- Wrong network selected → Prompt to switch to ZetaChain (7001)
- Insufficient gas in wallet → Show error with troubleshooting

### Database Errors (After Blockchain)
- Campaign created on-chain but fails to save to DB
  - Show warning: "Campaign created on blockchain but database save failed"
  - Provide campaign ID for manual recovery
  - Allow retry

## Environment Variables Required

```bash
# Network Configuration
NEXT_PUBLIC_ZETA_CHAIN_ID=7001
NEXT_PUBLIC_ZETA_EXPLORER_URL=https://testnet.zetachain.com

# Smart Contract
NEXT_PUBLIC_CROWDFUND_ADDRESS=0xffa7CA1AEEEbBc30C874d32C7e22F052BbEa0429

# Tokens
NEXT_PUBLIC_WZETA_ADDRESS=0x0000...
NEXT_PUBLIC_ZETA_ETH_ADDRESS=0x0000...

# Fallback
NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS=0x0000...
```

## Testing Checklist

- [ ] Form renders all fields: title, description, goal, category, token, payout address, gas limit
- [ ] Form validation works for each field
- [ ] Payout address validation accepts valid 0x addresses
- [ ] Payout address validation rejects invalid addresses
- [ ] Gas limit validation rejects values < 50000
- [ ] Gas limit validation rejects values > 500000
- [ ] Wallet connection prompts if not connected
- [ ] Network switch prompts if on wrong network
- [ ] Campaign creation succeeds with metamask confirmation
- [ ] updateCampaignDestination is called with form values
- [ ] Campaign saved to database with payout fields
- [ ] TX hash link appears in UI
- [ ] Redirect to campaign page succeeds
- [ ] Error messages show for validation failures
- [ ] Error messages show for blockchain failures

## Troubleshooting

### "Payout address must be a valid EVM address"
- Ensure you're entering a full address starting with `0x`
- Example: `0x742d35Cc6634C0532925a3b844Bc2e7d6Ec63D7E`
- Copy-paste from MetaMask to avoid typos

### "Gas limit must be between 50,000 and 500,000"
- Standard withdrawals: use 100,000
- Cross-chain to Ethereum: use 150,000
- Complex operations: use 200,000+

### "Campaign created on blockchain but failed to save to database"
- Campaign is safe on-chain
- Contact support with campaign ID
- Campaign may be visible in /profile/campaigns later

### Transaction keeps failing in MetaMask
- Check you have enough ZETA for gas (min 0.01 ZETA)
- Check you have the preferred token (WZETA, zETH, etc.)
- Decrease gas price or retry with fresh wallet state
