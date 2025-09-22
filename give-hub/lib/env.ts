/**
 * Environment Variable Parsing and Validation
 * 
 * This module centralizes all environment variable access and validation
 * using Zod for type safety and validation.
 */

import { z } from 'zod';

export async function getGatewayAddress(sourceChainId: number): Promise<string> {
  // Preferred: JSON map
  const raw = await process.env.NEXT_PUBLIC_GATEWAYS;
  if (raw) {
    try {
      const map = JSON.parse(raw) as Record<string, string>;
      const addr = map[String(sourceChainId)];
      if (addr && /^0x[0-9a-fA-F]{40}$/.test(addr)) return addr;
    } catch {}
  }

  // Fallbacks
  if (sourceChainId === 7001 && process.env.NEXT_PUBLIC_ZEVM_GATEWAY)
    return process.env.NEXT_PUBLIC_ZEVM_GATEWAY!;
  if (sourceChainId === 11155111 && process.env.NEXT_PUBLIC_SEPOLIA_GATEWAY)
    return process.env.NEXT_PUBLIC_SEPOLIA_GATEWAY!;

  throw new Error(`No gateway address configured for chainId ${sourceChainId}`);
}


// Define schema for environment variables (Zod v4 compatible)
export const env = z.object({
  // App Configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Web3/Blockchain Configuration (client-side)
  NEXT_PUBLIC_RPC_URL: z.string().url().optional().or(z.literal('')),
  NEXT_PUBLIC_ZETA_RPC_URL: z.string().url().optional().or(z.literal('')),
  NEXT_PUBLIC_ZETA_RPC_HTTP: z.string().url().optional().or(z.literal('')),
  NEXT_PUBLIC_CHAIN_ID: z.coerce.number().optional(),
  NEXT_PUBLIC_ZETA_CHAIN_ID: z.coerce.number().optional(),
  NEXT_PUBLIC_CONTRACT: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().or(z.literal('')),
  NEXT_PUBLIC_CROSSCHAIN_CONTRACT: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().or(z.literal('')),
  NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().or(z.literal('')),
  NEXT_PUBLIC_DONATION_CONTRACT: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().or(z.literal('')),
  NEXT_PUBLIC_ZETA_CHAIN_NAME: z.string().optional(),
  NEXT_PUBLIC_WZETA_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().or(z.literal('')),
  NEXT_PUBLIC_WZETA: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().or(z.literal('')),
  NEXT_PUBLIC_SYSTEM_CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().or(z.literal('')),
  NEXT_PUBLIC_ZETA_NATIVE_SYMBOL: z.string().optional(),
  NEXT_PUBLIC_ZETA_EXPLORER_URL: z.string().url().optional().or(z.literal('')),
  
  // Server-side secrets
  PRIVATE_KEY: z.string().optional(),
  RPC_URL: z.string().url().optional().or(z.literal('')),
}).parse(process.env);

// Helper functions for common environment variable patterns
export function getContractAddress(): string {
  return env.NEXT_PUBLIC_CROSSCHAIN_CONTRACT || 
         env.NEXT_PUBLIC_GIVEHUB_CONTRACT_ADDRESS || 
         env.NEXT_PUBLIC_DONATION_CONTRACT || 
         '';
}

export function getChainId(): string {
  return String(env.NEXT_PUBLIC_ZETA_CHAIN_ID || 
         env.NEXT_PUBLIC_CHAIN_ID || 
         '7001'); // Default to ZetaChain Athens
}

export function getRpcUrl(): string {
  return env.NEXT_PUBLIC_ZETA_RPC_URL || 
         env.NEXT_PUBLIC_RPC_URL || 
         env.NEXT_PUBLIC_ZETA_RPC_HTTP ||
         'https://zetachain-athens-evm.blockpi.network/v1/rpc/public';
}

export function getChainName(): string {
  return env.NEXT_PUBLIC_ZETA_CHAIN_NAME || 'ZetaChain Athens';
}

export function getWzetaAddress(): string {
  return env.NEXT_PUBLIC_WZETA_ADDRESS || 
         env.NEXT_PUBLIC_WZETA || 
         '';
}

export function getSystemContractAddress(): string {
  return env.NEXT_PUBLIC_SYSTEM_CONTRACT_ADDRESS || '';
}

export function getNativeSymbol(): string {
  return env.NEXT_PUBLIC_ZETA_NATIVE_SYMBOL || 'ZETA';
}

export function getExplorerUrl(): string {
  return env.NEXT_PUBLIC_ZETA_EXPLORER_URL || '';
}

// Server-side only environment variables
export function getPrivateKey(): string {
  if (typeof window !== 'undefined') {
    throw new Error('Cannot access server-side environment variables in browser');
  }
  return env.PRIVATE_KEY || '';
}

export function getServerRpcUrl(): string {
  if (typeof window !== 'undefined') {
    throw new Error('Cannot access server-side environment variables in browser');
  }
  return env.RPC_URL || getRpcUrl();
}
