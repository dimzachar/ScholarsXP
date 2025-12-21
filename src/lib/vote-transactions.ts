/**
 * Vote Transaction Builder
 * 
 * Builds transactions for the scholarxp::vote contract.
 * Falls back to self-transfer when contract is not deployed.
 */

import {
  AccountAuthenticatorEd25519,
  Ed25519PublicKey,
  Ed25519Signature,
  generateSigningMessageForTransaction,
} from '@aptos-labs/ts-sdk';
import { movementClient, VOTE_CONTRACT_ADDRESS, toHex, isVoteContractEnabled } from './movement';

// 5 minutes expiration (Shinami recommendation)
const FIVE_MINUTES_IN_SECONDS = 5 * 60;

export interface SignRawHashFunction {
  (params: { address: string; chainType: 'aptos'; hash: `0x${string}` }): Promise<{
    signature: string;
  }>;
}

/**
 * Build a vote transaction for the contract
 * Falls back to self-transfer if contract not deployed
 */
export async function buildVoteTransaction(
  submissionId: string,
  xpChoice: number,
  walletAddress: string
) {
  const expirationTime = Math.floor(Date.now() / 1000) + FIVE_MINUTES_IN_SECONDS;

  // Get sequence number (0 for new accounts)
  let accountSequenceNumber: bigint = BigInt(0);
  try {
    const accountInfo = await movementClient.account.getAccountInfo({ accountAddress: walletAddress });
    accountSequenceNumber = BigInt(accountInfo.sequence_number);
  } catch {
    // Account doesn't exist yet - use 0
  }

  // Fallback to self-transfer if no contract deployed
  if (!isVoteContractEnabled()) {
    console.warn('[vote-transactions] No VOTE_CONTRACT_ADDRESS set, using self-transfer fallback');
    return movementClient.transaction.build.simple({
      sender: walletAddress,
      withFeePayer: true,
      data: {
        function: "0x1::aptos_account::transfer",
        functionArguments: [walletAddress, 0],
      },
      options: { expireTimestamp: expirationTime, accountSequenceNumber },
    });
  }

  // Build contract call
  return movementClient.transaction.build.simple({
    sender: walletAddress,
    withFeePayer: true,
    data: {
      function: `${VOTE_CONTRACT_ADDRESS}::vote::cast_vote`,
      functionArguments: [
        Array.from(new TextEncoder().encode(submissionId)),
        xpChoice,
      ],
    },
    options: { expireTimestamp: expirationTime, accountSequenceNumber },
  });
}

/**
 * Sign transaction with Privy embedded wallet
 */
export async function signWithPrivy(
  transaction: Awaited<ReturnType<typeof buildVoteTransaction>>,
  publicKeyHex: string,
  signRawHash: SignRawHashFunction,
  walletAddress: string
) {
  // Generate signing message
  const message = generateSigningMessageForTransaction(transaction);

  // Sign with Privy
  const { signature: rawSignature } = await signRawHash({
    address: walletAddress,
    chainType: 'aptos',
    hash: `0x${toHex(message)}`,
  });

  // Clean public key (remove 0x prefix and potential 00 prefix byte)
  let cleanPublicKey = publicKeyHex.startsWith('0x') ? publicKeyHex.slice(2) : publicKeyHex;
  if (cleanPublicKey.length === 66) {
    cleanPublicKey = cleanPublicKey.slice(2);
  }

  // Create authenticator
  const senderAuth = new AccountAuthenticatorEd25519(
    new Ed25519PublicKey(cleanPublicKey),
    new Ed25519Signature(rawSignature.startsWith('0x') ? rawSignature.slice(2) : rawSignature)
  );

  return senderAuth;
}

/**
 * Check if wallet has voted on submission (via contract view function)
 */
export async function checkHasVotedOnChain(
  walletAddress: string,
  submissionId: string
): Promise<boolean> {
  if (!isVoteContractEnabled()) {
    return false; // Can't check without contract
  }

  try {
    const result = await movementClient.view({
      payload: {
        function: `${VOTE_CONTRACT_ADDRESS}::vote::has_voted`,
        functionArguments: [
          walletAddress,
          Array.from(new TextEncoder().encode(submissionId)),
        ],
      },
    });
    return Boolean(result[0]);
  } catch (error) {
    console.error('[vote-transactions] Error checking has_voted:', error);
    return false;
  }
}

/**
 * Get vote count for a submission (via contract view function)
 */
export async function fetchVoteCountOnChain(submissionId: string): Promise<number> {
  if (!isVoteContractEnabled()) {
    return 0;
  }

  try {
    const result = await movementClient.view({
      payload: {
        function: `${VOTE_CONTRACT_ADDRESS}::vote::get_vote_count`,
        functionArguments: [Array.from(new TextEncoder().encode(submissionId))],
      },
    });
    return Number(result[0]);
  } catch {
    return 0;
  }
}
