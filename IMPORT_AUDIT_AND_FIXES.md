# Complete Import Audit & Fixes for Give-Hub

**Date:** December 29, 2025  
**Status:** All issues identified and fixes ready to apply

---

## Executive Summary

Your repo has **version conflicts** and **incorrect import paths** that cause the build to fail:

1. **@zetachain/toolkit version mismatch**: package.json claims `^1.1.0` but `16.3.0` is installed
2. **Wrong import path**: Trying to import from `@zetachain/toolkit/evm` which doesn't exist in v16.3.0
3. **Function signature mismatch**: The `evmDepositAndCall` API changed between versions
4. **@google/genai**: ✅ CORRECT - Already migrated, no issues

---

## Issue-by-Issue Breakdown

### Issue #1: @zetachain/toolkit Version Conflict

**Location:** [give-hub/package.json](give-hub/package.json) (line 20) and [contracts/package.json](contracts/package.json) (line 27)

**Problem:**
- `give-hub/package.json` declares: `"@zetachain/toolkit": "^1.1.0"`
- `contracts/package.json` declares: `"@zetachain/toolkit": "^1.1.0"`
- **Actual installed version:** `16.3.0` (completely different API surface)

**Why this matters:**
- v1.1.0 exports do NOT match v16.3.0
- v16.3.0 moved client SDK to `packages/client/src/`
- Previous functions like `evmDepositAndCall` are now at: `@zetachain/toolkit/packages/client`

**Evidence from yarn:**
```
yarn list @zetachain/toolkit
└─ @zetachain/toolkit@16.3.0
```

---

### Issue #2: Incorrect Import Path for ZetaChain Functions

**Location:** [give-hub/lib/hooks/useCrowdfundContract.ts](give-hub/lib/hooks/useCrowdfundContract.ts#L5)

**Current Code:**
```typescript
import { evmDepositAndCall } from '@zetachain/toolkit/evm';
```

**Problem:**
- Path `@zetachain/toolkit/evm` does **NOT exist** in v16.3.0
- Correct path (for v16.3.0): `@zetachain/toolkit/client` (via package.json exports)

**Available in v16.3.0:**
```
node_modules/@zetachain/toolkit/package.json exports:
  "./client": {
    "types": "./dist/types/packages/client/src/index.d.ts",
    "import": "./dist/esm/packages/client/src/index.js",
    "default": "./dist/cjs/packages/client/src/index.js"
  }
```

**Fix:**
```typescript
import { ZetaChainClient } from '@zetachain/toolkit/client';
```

---

### Issue #3: Function Signature Mismatch in evmDepositAndCall

**Location:** [give-hub/lib/hooks/useCrowdfundContract.ts](give-hub/lib/hooks/useCrowdfundContract.ts#L179)

**Current Code (WRONG for v16.3.0):**
```typescript
const result = await evmDepositAndCall(
  {
    amount: parseEther(amount),
    receiver: CROWDFUND_ADDRESS,
    token: '0x0000000000000000000000000000000000000000', // ← wrong parameter name
    types: ['uint256', 'string', 'string'],
    values: [campaignId, donorName, note],
  },
  { signer: walletClient as any }
);
```

**Actual v16.3.0 Signature:**
```typescript
evmDepositAndCall(this: ZetaChainClient, args: {
  amount: string;
  erc20?: string;              // ← should be 'erc20', not 'token'
  gatewayEvm?: string;
  receiver: string;
  revertOptions: RevertOptions; // ← required
  txOptions: TxOptions;         // ← required
  types: string[];
  values: ParseAbiValuesReturnType;
}) => Promise<ethers.ContractTransactionResponse>
```

**Key Differences:**
- Parameter `token` should be `erc20`
- Requires `revertOptions` (not optional)
- Requires `txOptions` (not optional)
- Different calling convention (not `function(args, {signer})` anymore)

**Fix:**
```typescript
const result = await evmDepositAndCall.call(walletClient, {
  amount: parseEther(amount).toString(),
  erc20: '0x0000000000000000000000000000000000000000', // native token
  receiver: CROWDFUND_ADDRESS,
  types: ['uint256', 'string', 'string'],
  values: [campaignId, donorName, note],
  revertOptions: {
    onRevert: true,
    revertAddress: CROWDFUND_ADDRESS,
  },
  txOptions: {
    gasLimit: '500000',
  },
});
```

---

### Issue #4: @google/generative-ai vs @google/genai ✅ CORRECT

**Location:** [give-hub/lib/gemini.ts](give-hub/lib/gemini.ts#L4)

**Current Code:**
```typescript
import { GoogleGenAI } from "@google/genai";
import type { GenerateContentResponse } from "@google/genai";
```

**Status:** ✅ **CORRECT**
- Package.json has: `"@google/genai": "^1.34.0"` (modern SDK)
- Imports are correct
- No issues here

---

## Assumptions Made

1. **@zetachain/toolkit v16.3.0 is the intended version** - Since it's installed, assuming it's what you want
2. **evmDepositAndCall is a method on ZetaChainClient** - Based on v16.3.0 API design pattern
3. **You don't need backward compatibility with v1.1.0** - Migrating forward to v16.3.0
4. **NEXT_PUBLIC_CROWDFUND_ADDRESS env var exists** - Already defined in useCrowdfundContract.ts

---

## Summary of Required Fixes

| File | Issue | Fix |
|------|-------|-----|
| `give-hub/package.json` | Version mismatch | Update `"@zetachain/toolkit": "^16.3.0"` |
| `give-hub/lib/hooks/useCrowdfundContract.ts:5` | Wrong import path | Change to `from '@zetachain/toolkit/client'` |
| `give-hub/lib/hooks/useCrowdfundContract.ts:179` | Wrong API call signature | Update function call and parameters to match v16.3.0 |

**Total files to fix: 1**  
**Total edits: 3**

---

## Testing Checklist

After applying fixes, verify:
- [ ] `yarn build` completes without TypeScript errors
- [ ] Type checking passes: `yarn typecheck`
- [ ] No "Cannot find module" errors for @zetachain/toolkit
- [ ] useCrowdfundContract hooks compile correctly
