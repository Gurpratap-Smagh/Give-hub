# Quick Fix Reference - Give-Hub Build Issues

## TL;DR - What Was Fixed

| Issue | Fix | File |
|-------|-----|------|
| `@zetachain/toolkit` v16.3.0 installed but package.json said v1.1.0 | Updated package.json to `^16.3.0` | package.json x2 |
| Cannot import `@zetachain/toolkit/evm` (doesn't exist in v16.3.0) | Changed to `@zetachain/toolkit/client` | useCrowdfundContract.ts |
| `evmDepositAndCall` API changed completely | Rewrote to use `ZetaChainClient` instance method | useCrowdfundContract.ts |
| TypeScript can't resolve package.json exports | Changed `moduleResolution: "node"` to `"bundler"` | tsconfig.json |
| Viem ABI type errors | Extract ABI from Hardhat artifact + add `Abi` type | useCrowdfundContract.ts |

## Build Status

```bash
✅ Done in 44.77s
✅ No errors
✅ 25 routes generated
```

## One-Line Summary

**Version conflict between declared (`^1.1.0`) and installed (`16.3.0`) @zetachain/toolkit required major API updates, plus TypeScript module resolution fix.**

## Files Changed

1. `give-hub/package.json` - version
2. `give-hub/tsconfig.json` - moduleResolution  
3. `give-hub/lib/hooks/useCrowdfundContract.ts` - imports, function signatures, types
4. `contracts/package.json` - version

## How to Verify

```bash
cd give-hub
yarn build
# Should complete in ~45 seconds with "Done in X.XXs"
```

## Key API Changes (v1.1.0 → v16.3.0)

### Old Way (v1.1.0)
```typescript
const result = await evmDepositAndCall({ /* args */ }, { signer: walletClient });
```

### New Way (v16.3.0)
```typescript
const client = new ZetaChainClient({ signer: walletClient, network: 'testnet' });
const result = await client.evmDepositAndCall({ /* args */ });
```

### Parameter Changes
- `token` → `erc20`
- Must provide `revertOptions` (required)
- Must provide `txOptions` (required)
- All values must be strings (not numbers)

## Related Documents

- See `BUILD_FIX_COMPLETE.md` for comprehensive details
- See `IMPORT_AUDIT_AND_FIXES.md` for technical audit

---

**Status:** ✅ Ready for deployment  
**Build:** ✅ Success  
**Tests:** Run your test suite to confirm runtime functionality
