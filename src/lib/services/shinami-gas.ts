/**
 * Shinami Gas Station Service
 * 
 * Sponsors gas fees for Movement Network transactions using Shinami's Gas Station.
 * Used with Privy embedded wallets for gasless on-chain voting.
 */

import { GasStationClient } from "@shinami/clients/aptos";
import { 
  Aptos, 
  AptosConfig, 
  Network,
  AccountAuthenticator,
  SimpleTransaction,
  Deserializer,
  Hex
} from "@aptos-labs/ts-sdk";

const SHINAMI_GAS_KEY = process.env.SHINAMI_GAS_STATION_KEY;

if (!SHINAMI_GAS_KEY && process.env.NODE_ENV === 'production') {
  console.warn('[shinami-gas] SHINAMI_GAS_STATION_KEY not set - sponsored transactions disabled');
}

// Shinami Gas Station client (lazy singleton)
let gasClientInstance: GasStationClient | null = null;

function getGasClient(): GasStationClient {
  if (!SHINAMI_GAS_KEY) {
    throw new Error('SHINAMI_GAS_STATION_KEY not configured');
  }
  if (!gasClientInstance) {
    gasClientInstance = new GasStationClient(SHINAMI_GAS_KEY);
  }
  return gasClientInstance;
}

// Movement Testnet client (for Shinami Gas Station testing)
const movementConfig = new AptosConfig({
  network: Network.CUSTOM,
  fullnode: "https://testnet.movementnetwork.xyz/v1",
});

export const movementClient = new Aptos(movementConfig);

/**
 * Deserialize a transaction from hex string
 */
export function deserializeTransaction(serializedTx: string): SimpleTransaction {
  const bytes = Hex.fromHexString(serializedTx).toUint8Array();
  return SimpleTransaction.deserialize(new Deserializer(bytes));
}

/**
 * Deserialize a signature from hex string
 */
export function deserializeSignature(serializedSig: string): AccountAuthenticator {
  const bytes = Hex.fromHexString(serializedSig).toUint8Array();
  return AccountAuthenticator.deserialize(new Deserializer(bytes));
}

/**
 * Sponsor and submit a signed transaction via Shinami Gas Station.
 * 
 * @param serializedTransaction - Hex-encoded transaction bytes
 * @param serializedSenderSignature - Hex-encoded sender signature bytes
 * @returns Transaction hash
 */
export async function sponsorAndSubmitTransaction(
  serializedTransaction: string,
  serializedSenderSignature: string
): Promise<{ hash: string }> {
  const gasClient = getGasClient();
  
  const transaction = deserializeTransaction(serializedTransaction);
  const senderSignature = deserializeSignature(serializedSenderSignature);
  
  // Shinami sponsors and submits in one call
  const pendingTx = await gasClient.sponsorAndSubmitSignedTransaction(
    transaction,
    senderSignature
  );
  
  // Wait for confirmation
  const result = await movementClient.waitForTransaction({
    transactionHash: pendingTx.hash,
  });
  
  return { hash: result.hash };
}

/**
 * Get Gas Station fund balance (for monitoring/admin)
 */
export async function getGasFundBalance(): Promise<{
  balance: number;
  inFlight: number;
  network: string;
}> {
  const gasClient = getGasClient();
  const fund = await gasClient.getFund();
  
  return {
    balance: fund.balance / 100_000_000, // Convert to MOVE
    inFlight: fund.inFlight / 100_000_000,
    network: fund.network,
  };
}

/**
 * Check if Shinami Gas Station is configured and available
 */
export function isGasStationEnabled(): boolean {
  return !!SHINAMI_GAS_KEY;
}
