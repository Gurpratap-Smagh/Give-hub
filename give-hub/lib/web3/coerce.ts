/**
 * Internal type coercion utilities for contract calls
 * Ensures ABI-compatible types without changing public function signatures
 */

import { ethers } from "ethers";

/**
 * Coerce value to address format and validate
 */
export const asAddress = (v: string): `0x${string}` => {
  if (!v || typeof v !== 'string') {
    throw new Error(`Invalid address: ${v}`);
  }
  
  try {
    const normalized = ethers.getAddress(v);
    return normalized as `0x${string}`;
  } catch {
    throw new Error(`Invalid address format: ${v}`);
  }
};

/**
 * Coerce value to BigInt
 */
export const toBig = (v: string | number | bigint): bigint => {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number') return BigInt(Math.floor(v));
  if (typeof v === 'string') {
    try {
      return BigInt(v);
    } catch {
      throw new Error(`Cannot convert to BigInt: ${v}`);
    }
  }
  throw new Error(`Cannot convert to BigInt: ${v}`);
};

/**
 * Convert human-readable amount to wei (18 decimals by default)
 */
export const toWei18 = (v: string | number | bigint): bigint => {
  try {
    return ethers.parseEther(String(v));
  } catch {
    throw new Error(`Cannot convert to wei: ${v}`);
  }
};

/**
 * Convert human-readable amount to token units with specified decimals
 */
export const toTokenUnits = (v: string | number | bigint, decimals: number = 18): bigint => {
  try {
    return ethers.parseUnits(String(v), decimals);
  } catch {
    throw new Error(`Cannot convert to token units: ${v} (decimals: ${decimals})`);
  }
};

/**
 * Convert wei/token units back to human-readable format
 */
export const fromWei18 = (v: string | number | bigint | undefined): string => {
  if (v === undefined || v === null) {
    return "0";
  }
  try {
    return ethers.formatEther(toBig(v));
  } catch {
    throw new Error(`Cannot convert from wei: ${v}`);
  }
};

/**
 * Convert token units back to human-readable format with specified decimals
 */
export const fromTokenUnits = (v: string | number | bigint, decimals: number = 18): string => {
  try {
    return ethers.formatUnits(toBig(v), decimals);
  } catch {
    throw new Error(`Cannot convert from token units: ${v} (decimals: ${decimals})`);
  }
};

/**
 * Coerce boolean values
 */
export const toBool = (v: unknown): boolean => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const lower = v.toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0' || lower === '') return false;
  }
  if (typeof v === 'number') return v !== 0;
  return Boolean(v);
};
