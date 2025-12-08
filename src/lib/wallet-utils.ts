/**
 * Utility functions for wallet address handling
 */

/**
 * Truncates a wallet address to format: 0x1234...5678
 * @param address - Full wallet address
 * @returns Truncated address or original if too short
 */
export function truncateWalletAddress(address: string): string {
  if (!address || address.length < 10) return address
  const prefix = address.slice(0, 6)
  const suffix = address.slice(-4)
  return `${prefix}...${suffix}`
}
