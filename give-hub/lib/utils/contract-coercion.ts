/**
 * Contract Type Coercion Utilities
 * 
 * This module provides utility functions for safely coercing JavaScript/TypeScript
 * values to types compatible with blockchain contract ABIs without changing
 * existing function signatures.
 */

import { ethers } from 'ethers';

/**
 * Coerce a value to a BigInt compatible with contract calls
 * Handles string, number, bigint, and undefined inputs
 * 
 * @param value Value to coerce to BigInt
 * @param defaultValue Optional default value if input is undefined/null
 * @returns BigInt value or defaultValue
 */
export function toBigInt(value: string | number | bigint | undefined | null, defaultValue: bigint = 0n): bigint {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  
  try {
    return BigInt(value);
  } catch (e) {
    void e; // Explicitly mark as unused
    console.warn(`[contract-coercion] Failed to convert ${value} to BigInt, using default ${defaultValue}`);
    return defaultValue;
  }
}

/**
 * Coerce a value to a hex string compatible with contract calls
 * Handles address validation and normalization
 * 
 * @param address Address string to normalize
 * @param defaultValue Optional default value if input is invalid (defaults to zero address)
 * @returns Normalized address string
 */
export function toAddress(address: string | undefined | null, defaultValue: string = ethers.ZeroAddress): string {
  if (!address) {
    return defaultValue;
  }
  
  try {
    // Validate and normalize the address
    return ethers.getAddress(address);
  } catch (e) {
    void e; // Explicitly mark as unused
    console.warn(`[contract-coercion] Invalid address ${address}, using default ${defaultValue}`);
    return defaultValue;
  }
}

/**
 * Coerce a value to a boolean compatible with contract calls
 * 
 * @param value Value to coerce to boolean
 * @param defaultValue Optional default value if input is undefined/null
 * @returns Boolean value
 */
export function toBoolean(value: unknown, defaultValue: boolean = false): boolean {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  
  return Boolean(value);
}

/**
 * Coerce a value to a string compatible with contract calls
 * Handles null/undefined values and ensures string type
 * 
 * @param value Value to coerce to string
 * @param defaultValue Optional default value if input is undefined/null
 * @returns String value
 */
export function toString(value: unknown, defaultValue: string = ''): string {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  
  return String(value);
}

/**
 * Parse an amount string to wei (ethers.parseEther wrapper with error handling)
 * 
 * @param amount Amount string in ether (e.g. "0.1")
 * @param defaultValue Optional default value if parsing fails
 * @returns BigInt representing the amount in wei
 */
export function parseAmount(amount: string | number | undefined | null, defaultValue: bigint = 0n): bigint {
  if (amount === undefined || amount === null) {
    return defaultValue;
  }
  
  try {
    const amountStr = String(amount).trim();
    return ethers.parseEther(amountStr);
  } catch (e) {
    void e; // Explicitly mark as unused
    console.warn(`[contract-coercion] Failed to parse amount ${amount}, using default ${defaultValue}`);
    return defaultValue;
  }
}

/**
 * Format a BigInt wei amount to ether string (ethers.formatEther wrapper with error handling)
 * 
 * @param wei Wei amount as BigInt or string
 * @param defaultValue Optional default value if formatting fails
 * @returns Formatted ether amount as string
 */
export function formatAmount(wei: bigint | string | undefined | null, defaultValue: string = '0'): string {
  if (wei === undefined || wei === null) {
    return defaultValue;
  }
  
  try {
    const weiBigInt = typeof wei === 'string' ? BigInt(wei) : wei;
    return ethers.formatEther(weiBigInt);
  } catch (e) {
    void e; // Explicitly mark as unused
    console.warn(`[contract-coercion] Failed to format wei amount ${wei}, using default ${defaultValue}`);
    return defaultValue;
  }
}
