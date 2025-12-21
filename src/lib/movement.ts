/**
 * Movement Network Client Configuration
 * 
 * Provides Aptos SDK client configured for Movement Testnet
 * and contract address management.
 */

import { Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';

// Movement Testnet RPC
const MOVEMENT_RPC_URL = process.env.NEXT_PUBLIC_MOVEMENT_RPC_URL || 'https://testnet.movementnetwork.xyz/v1';

// Initialize Aptos SDK with Movement Testnet
export const movementClient = new Aptos(
  new AptosConfig({
    network: Network.CUSTOM,
    fullnode: MOVEMENT_RPC_URL,
  })
);

// Contract address (set after deployment via env var)
export const VOTE_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_VOTE_CONTRACT || '';

/**
 * Check if vote contract is deployed and configured
 */
export function isVoteContractEnabled(): boolean {
  return !!VOTE_CONTRACT_ADDRESS;
}

/**
 * Convert Uint8Array to hex string
 */
export function toHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Movement Testnet explorer URL for transaction
 */
export function getExplorerUrl(txHash: string): string {
  const formattedHash = txHash.startsWith('0x') ? txHash : `0x${txHash}`;
  return `https://explorer.movementnetwork.xyz/txn/${formattedHash}?network=bardock+testnet`;
}
