# Developer Reference: Campaign Creation System

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   Campaign Creation Flow                    │
└─────────────────────────────────────────────────────────────┘

USER INTERFACE (give-hub/app/create/page.tsx)
  ├─ Form Inputs
  │  ├─ title (required)
  │  ├─ description (required)
  │  ├─ goal (required)
  │  ├─ category (required)
  │  ├─ preferredToken (required)
  │  ├─ payoutAddress (optional) ← NEW
  │  └─ payoutGasLimit (optional) ← NEW
  │
  ├─ Validation Layer
  │  ├─ Basic field validation
  │  ├─ Address validation (isAddress utility)
  │  └─ Gas limit range check (50k-500k)
  │
  └─ Submit Handler (handleSubmit)
     ├─ Validates all inputs
     ├─ Connects wallet
     ├─ Switches network to 7001 (ZetaChain)
     └─ Calls createAndConfigureCampaign()

         ↓

WEB3 INTEGRATION LAYER (lib/web3/client.ts)
  └─ createAndConfigureCampaign({
       preferredZRC20,
       payoutAddress,
       payoutGasLimit
     })
     ├─ Step 1: createCampaignOnChain()
     │          └─ Calls contract.createCampaign(preferredZRC20)
     │             Returns: { id, txHash }
     │
     ├─ Step 2: updateCampaignPayoutToken()
     │          └─ Consistency check
     │
     ├─ Step 3: updateCampaignDestination()
     │          └─ Calls contract.updateCampaignDestination(
     │               campaignId,
     │               payoutAddress,
     │               payoutGasLimit
     │            )
     │
     └─ Returns: { campaignId, txHash }

         ↓

DATABASE LAYER (api/campaigns)
  └─ Save campaign record with:
     ├─ title, description, goal, category
     ├─ preferredZRC20
     ├─ payoutAddress ← NEW
     ├─ payoutGasLimit ← NEW
     ├─ onChain metadata
     └─ creator reference
```

---

## Form Data Structure

```typescript
interface CampaignFormData {
  // Basic Information
  title: string;              // Campaign title
  description: string;        // Campaign details
  goal: string;              // Target amount (as string, parsed to number)
  category: string;          // Category selection
  image?: string;            // Base64 image data
  
  // Web3/Payment Configuration
  preferredToken: string;    // ZRC20 token address
  
  // Payout Configuration (NEW)
  payoutAddress: string;     // Destination address for funds
  payoutGasLimit: string;    // Gas limit as string (parsed to number)
}
```

---

## Validation Rules Reference

```typescript
// Field Validations
const validations = {
  title: {
    required: true,
    minLength: 1,
    rule: (val) => val.trim().length > 0,
    error: "Title is required"
  },
  description: {
    required: true,
    minLength: 1,
    rule: (val) => val.trim().length > 0,
    error: "Description is required"
  },
  goal: {
    required: true,
    min: 1,
    rule: (val) => parseFloat(val) > 0,
    error: "Goal must be greater than 0"
  },
  category: {
    required: true,
    rule: (val) => val.length > 0,
    error: "Category is required"
  },
  payoutAddress: {
    required: false,  // Optional
    rule: (val) => {
      if (!val || val.trim() === '') return true;  // Empty is OK
      return isAddress(val);  // If provided, must be valid
    },
    error: "Payout address must be a valid EVM address (0x...)"
  },
  payoutGasLimit: {
    required: false,
    min: 50000,
    max: 500000,
    rule: (val) => {
      const num = parseInt(val || '100000', 10);
      return num >= 50000 && num <= 500000;
    },
    error: "Gas limit must be between 50,000 and 500,000"
  }
}
```

---

## Smart Contract Integration

### Functions Called

#### 1. createCampaign(preferredZRC20)
```solidity
function createCampaign(address preferredZRC20) external
  • Creates new campaign
  • Emits: CampaignCreated(uint256 indexed campaignId, address indexed creator, address preferredZRC20)
  • Returns: campaignId extracted from event log
```

#### 2. updateCampaignPayoutToken(campaignId, token)
```solidity
function updateCampaignPayoutToken(uint256 campaignId, address token) external
  • Updates preferred payout token
  • Ensures consistency across operations
```

#### 3. updateCampaignDestination(campaignId, payoutAddress, payoutGasLimit)
```solidity
function updateCampaignDestination(
  uint256 campaignId,
  address payoutAddress,
  uint256 payoutGasLimit
) external {
  require(campaigns[campaignId].creator == msg.sender);
  campaigns[campaignId].payoutAddress = payoutAddress;
  campaigns[campaignId].payoutGasLimit = payoutGasLimit;
}
```

### Campaign Struct (On-Chain)
```solidity
struct Campaign {
  address creator;           // Campaign creator (ZEVM address)
  address preferredZRC20;   // Token for donations
  bool active;              // Campaign active status
  address payoutAddress;    // Destination for withdrawals (0x address)
  uint256 payoutGasLimit;   // Gas for cross-chain payout
}
```

---

## Error Handling Map

```javascript
// Validation Errors (UI-level, no blockchain)
ValidationError: {
  "Missing required fields": "Show error, stay on form",
  "Invalid payout address": "Show error, stay on form",
  "Gas limit out of range": "Show error, stay on form"
}

// Wallet Errors (User action required)
WalletError: {
  "Not connected": "Show connect wallet prompt",
  "Wrong network": "Show network switch prompt",
  "User rejected": "Show cancellation message"
}

// Blockchain Errors (Recoverable)
BlockchainError: {
  "Insufficient gas": "Show error with balance check",
  "Transaction reverted": "Show detailed error from contract",
  "Timeout": "Show retry prompt"
}

// Database Errors (Critical but recoverable)
DatabaseError: {
  "Campaign on-chain but DB save failed": "Show warning with campaign ID",
  "Conflict with existing campaign": "Show error and advice"
}
```

---

## State Management

### React State in CreateCampaignPage
```typescript
// Form data
const [formData, setFormData] = useState<CampaignFormData>({...})

// UI state
const [submitLoading, setSubmitLoading] = useState(false)
const [submitMessage, setSubmitMessage] = useState('')
const [txPhase, setTxPhase] = useState<'idle'|'confirming'|'mining'|'done'|'error'>()
const [txHash, setTxHash] = useState<string>('')

// Advanced options
const [preferredToken, setPreferredToken] = useState('')
const [zrc20Options, setZrc20Options] = useState([])
const [isTokenValid, setIsTokenValid] = useState(false)

// Image handling
const [image, setImage] = useState<string>('')
const [imageGenLoading, setImageGenLoading] = useState(false)

// Error handling
const [errorOpen, setErrorOpen] = useState(false)
const [errorText, setErrorText] = useState('')
const [errorDetails, setErrorDetails] = useState<unknown>(null)
```

---

## API Endpoints Used

### POST /api/campaigns
Create new campaign in database

**Request Body:**
```typescript
{
  title: string;
  description: string;
  imgSrc: string;              // Base64 image
  category: string;
  goal: number;
  creatorId: string;
  preferredZRC20: string;      // Token address
  payoutAddress?: string;      // NEW
  payoutGasLimit?: number;     // NEW
  onChain?: {                  // If on-chain campaign created
    chainId: number;           // 7001
    contract: string;          // Contract address
    campaignId: string;        // Blockchain campaign ID
  }
}
```

**Response:**
```typescript
{
  campaign: {
    id: string;
    title: string;
    ...
  }
}
```

### GET /api/zrc20-options
Fetch available ZRC20 tokens by chain

**Response:**
```typescript
{
  byChain: {
    "ZetaChain": [
      { address: "0x...", symbol: "WZETA", decimals: 18 },
      { address: "0x...", symbol: "zETH", decimals: 18 }
    ],
    "Ethereum": [
      { address: "0x...", symbol: "zETH", decimals: 18 }
    ]
  }
}
```

---

## Utility Functions Used

### isAddress(address: string): boolean
```typescript
// Import from @/lib/address
// Validates if string is a valid EVM address (0x + 40 hex chars)
// Returns: true if valid, false otherwise

isAddress('0x742d35Cc6634C0532925a3b844Bc2e7d6Ec63D7E')  // true
isAddress('invalid')                                      // false
isAddress('')                                             // false
```

### showError / showSuccess / showInfo
```typescript
// Import from @/components/notification-manager
showError(message: string, title: string): void
showSuccess(message: string, title: string): void
showInfo(message: string, title: string): void

// Example
showError("Gas limit out of range", "Validation Error")
showSuccess("Campaign created!", "Success")
showInfo("Switching networks...", "Network Change")
```

### parseEther / formatEther
```typescript
// Import from 'viem'
import { parseEther } from 'viem'

// For user input
const weiAmount = parseEther('1.5')  // Converts 1.5 ETH to wei

// For display
import { formatEther } from 'viem'
const ethAmount = formatEther(BigInt(1500000000000000000))  // "1.5"
```

---

## Configuration Reference

### Environment Variables Required

```bash
# Network
NEXT_PUBLIC_ZETA_CHAIN_ID=7001
NEXT_PUBLIC_ZETA_EXPLORER_URL=https://testnet.zetachain.com

# Smart Contract
NEXT_PUBLIC_CROWDFUND_ADDRESS=0xffa7CA1AEEEbBc30C874d32C7e22F052BbEa0429
NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS=0x...  # Fallback

# Tokens
NEXT_PUBLIC_WZETA_ADDRESS=0x...
NEXT_PUBLIC_ZETA_ETH_ADDRESS=0x...

# RPC Endpoints
NEXT_PUBLIC_ZETA_RPC_URL=https://zetachain-athens.blockpi.network/v1/rpc
```

---

## Common Code Patterns

### Checking Gas Limit Validity
```typescript
const gasLimit = parseInt(formData.payoutGasLimit || '100000', 10);
if (gasLimit < 50000 || gasLimit > 500000) {
  throw new Error("Gas limit must be between 50,000 and 500,000");
}
```

### Defaulting Payout Address
```typescript
const payoutAddress = formData.payoutAddress || connectedWalletAddress;
// If user provided address, use it; otherwise use wallet
```

### Handling Optional Payout Config
```typescript
const campaignData = {
  // ... other fields
  payoutAddress: formData.payoutAddress || undefined,
  payoutGasLimit: formData.payoutGasLimit 
    ? parseInt(formData.payoutGasLimit, 10) 
    : 100000,
};
```

### Extracting Campaign ID from Event
```typescript
const iface = new ethers.Interface(CROWDFUND_ABI);
for (const log of receipt.logs ?? []) {
  try {
    const parsed = iface.parseLog(log);
    if (parsed?.name === "CampaignCreated") {
      return parsed.args?.campaignId as bigint;
    }
  } catch {}
}
```

---

## Troubleshooting Checklist

| Symptom | Possible Cause | Fix |
|---------|----------------|-----|
| Payout fields not showing | Old component version | Clear browser cache, restart dev server |
| Validation always fails | isAddress utility not imported | Check import statement in page.tsx |
| Gas limit field won't save | FormData not updated with new fields | Verify formData state includes payoutGasLimit |
| Contract call fails | Wrong contract address | Check NEXT_PUBLIC_CROWDFUND_ADDRESS env var |
| Campaign saved but payout not set | updateCampaignDestination not called | Check createAndConfigureCampaign implementation |
| Explorer shows wrong gas | Custom gas limit not passed to function | Verify handleSubmit passes formData.payoutGasLimit |

---

## Testing Tips

### Unit Testing Validation
```typescript
import { isAddress } from '@/lib/address';

describe('Payout Address Validation', () => {
  it('accepts valid addresses', () => {
    expect(isAddress('0x742d35Cc6634C0532925a3b844Bc2e7d6Ec63D7E')).toBe(true);
  });
  
  it('rejects invalid addresses', () => {
    expect(isAddress('invalid')).toBe(false);
    expect(isAddress('0x123')).toBe(false);
  });
});
```

### Integration Testing Flow
1. Render form component
2. Fill all fields including new payout config
3. Spy on createAndConfigureCampaign
4. Submit form
5. Verify function called with correct parameters

### Manual Testing Checklist
- [ ] Form renders without errors
- [ ] Payout config section visible
- [ ] Address input validates correctly
- [ ] Gas limit input accepts 50k-500k
- [ ] Gas limit input rejects outside range
- [ ] Empty payout address defaults to wallet
- [ ] Valid address accepted
- [ ] Campaign creation succeeds end-to-end
- [ ] TX hash shown in explorer
- [ ] Database record has payout fields
- [ ] Contract state shows payout address

---

## Performance Considerations

- **Form rendering:** Minimal impact (2 new inputs)
- **Validation:** O(1) for each field
- **Blockchain calls:** Sequential (not parallel) - proper ordering
- **Database save:** Standard MongoDB operation
- **Total time:** ~30-60 seconds for full flow (mostly MetaMask confirmation)

## Security Considerations

- ✅ Address validation prevents typos
- ✅ Gas limits have bounds to prevent extreme values
- ✅ Only campaign creator can update payout
- ✅ Form validation prevents invalid state submission
- ✅ Database validation on backend (additional layer)
- ✅ Smart contract checks creator ownership

---

## Future Enhancements

1. **Gas Estimation** - Estimate required gas automatically
2. **Address Book** - Save frequently used payout addresses
3. **Advanced Options Toggle** - Hide payout config by default
4. **Multi-sig Detection** - Show warning for multi-sig addresses
5. **Historical Analytics** - Show success rate by gas limit
6. **One-Click Presets** - "Treasury Payout" (200k gas), etc.
