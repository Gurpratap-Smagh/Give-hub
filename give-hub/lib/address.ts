/**
 * Simple Ethereum address validator.
 * - 0x-prefixed, 40 hex chars
 * - rejects zero address
 */
export function isAddress(addr: string): boolean {
  if (typeof addr !== 'string') return false
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) return false
  if (/^0x0{40}$/i.test(addr)) return false
  return true
}
