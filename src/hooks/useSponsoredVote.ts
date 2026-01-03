"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignRawHash } from "@privy-io/react-auth/extended-chains";
import { 
  Aptos, 
  AptosConfig, 
  Network,
  Serializer,
  generateSigningMessageForTransaction,
  AccountAuthenticatorEd25519,
  Ed25519PublicKey,
  Ed25519Signature,
} from "@aptos-labs/ts-sdk";
import { VOTE_CONTRACT_ADDRESS, isVoteContractEnabled } from "@/lib/movement";

// Movement Testnet client (for Shinami Gas Station testing)
const movementClient = new Aptos(new AptosConfig({
  network: Network.CUSTOM,
  fullnode: "https://testnet.movementnetwork.xyz/v1",
}));

// 5 minutes expiration (Shinami workshop recommendation)
const FIVE_MINUTES_IN_SECONDS = 5 * 60;

export interface SponsoredVoteResult {
  success: boolean;
  transactionHash: string;
}

export interface UseSponsoredVoteReturn {
  vote: (submissionId: string, voteXp: number, walletAddress: string, walletType: 'EMBEDDED' | 'EXTERNAL') => Promise<SponsoredVoteResult>;
  isLoading: boolean;
  error: string | null;
}

// Helper to convert Uint8Array to hex
function toHex(buffer: Uint8Array): string {
  return Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hook for submitting gasless votes via Shinami Gas Station.
 * Supports both Privy embedded wallets and external wallets (Nightly, etc.)
 */
export function useSponsoredVote(): UseSponsoredVoteReturn {
  // External wallet (Nightly, etc.)
  const { account: externalAccount, signTransaction, connected: externalConnected, network, wallet } = useWallet();
  
  // Privy (for embedded wallet)
  const { user: privyUser } = usePrivy();
  const { signRawHash } = useSignRawHash();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get Privy embedded wallet info
  const privyAptosWallet = privyUser?.linkedAccounts?.find(
    (account): account is typeof account & { chainType: string; address: string; publicKey: string } => 
      account.type === 'wallet' && 
      'chainType' in account && 
      (account as { chainType?: string }).chainType === 'aptos'
  );

  const vote = useCallback(async (
    submissionId: string, 
    voteXp: number,
    walletAddress: string,
    walletType: 'EMBEDDED' | 'EXTERNAL'
  ): Promise<SponsoredVoteResult> => {
    setIsLoading(true);
    setError(null);

    try {
      const expirationTime = Math.floor(Date.now() / 1000) + FIVE_MINUTES_IN_SECONDS;

      // Check if account exists on-chain to get sequence number
      // For new accounts, use 0 - the account will be created by the sponsored tx
      let accountSequenceNumber: bigint = BigInt(0);
      try {
        const accountInfo = await movementClient.account.getAccountInfo({ accountAddress: walletAddress });
        accountSequenceNumber = BigInt(accountInfo.sequence_number);
      } catch {
        // Account doesn't exist yet - use sequence 0 for new account creation
        console.log('[useSponsoredVote] Account not found on-chain, using sequence 0 for new account');
      }

      // Build transaction - use contract if deployed, otherwise fallback to self-transfer
      let transactionData;
      if (isVoteContractEnabled()) {
        // Use vote contract
        transactionData = {
          function: `${VOTE_CONTRACT_ADDRESS}::vote::cast_vote` as `${string}::${string}::${string}`,
          functionArguments: [
            Array.from(new TextEncoder().encode(submissionId)),
            voteXp,
          ],
        };
      } else {
        // Fallback: self-transfer of 0 MOVE (proof-of-participation only)
        console.warn('[useSponsoredVote] No VOTE_CONTRACT_ADDRESS set, using self-transfer fallback');
        transactionData = {
          function: "0x1::aptos_account::transfer" as `${string}::${string}::${string}`,
          functionArguments: [walletAddress, 0],
        };
      }

      const transaction = await movementClient.transaction.build.simple({
        sender: walletAddress,
        withFeePayer: true,
        data: transactionData,
        options: {
          expireTimestamp: expirationTime,
          accountSequenceNumber,
        },
      });

      let serializedTransaction: string;
      let serializedSignature: string;

      if (walletType === 'EMBEDDED') {
        // === PRIVY EMBEDDED WALLET ===
        if (!privyAptosWallet) {
          throw new Error("Privy Aptos wallet not found");
        }

        // Generate signing message
        const message = generateSigningMessageForTransaction(transaction);

        // Sign with Privy using signRawHash (for Aptos/Movement)
        const { signature: rawSignature } = await signRawHash({
          address: walletAddress,
          chainType: "aptos",
          hash: `0x${toHex(message)}`,
        });

        if (!rawSignature) {
          throw new Error("Failed to sign with embedded wallet");
        }

        // Get public key and clean it
        let cleanPublicKey = privyAptosWallet.publicKey || '';
        if (cleanPublicKey.startsWith('0x')) {
          cleanPublicKey = cleanPublicKey.slice(2);
        }
        // If 66 chars (33 bytes), remove first byte (00 prefix)
        if (cleanPublicKey.length === 66) {
          cleanPublicKey = cleanPublicKey.slice(2);
        }

        // Clean signature
        const signatureHex = rawSignature.startsWith('0x') 
          ? rawSignature.slice(2) 
          : rawSignature;

        // Create authenticator
        const senderAuth = new AccountAuthenticatorEd25519(
          new Ed25519PublicKey(cleanPublicKey),
          new Ed25519Signature(signatureHex)
        );

        // Serialize
        serializedTransaction = transaction.bcsToHex().toString();
        const serializer = new Serializer();
        senderAuth.serialize(serializer);
        serializedSignature = `0x${toHex(serializer.toUint8Array())}`;

      } else {
        // === EXTERNAL WALLET (Nightly, etc.) ===
        console.log('[useSponsoredVote] External wallet check:', { 
          externalConnected, 
          externalAccountAddress: externalAccount?.address,
          walletName: wallet?.name 
        });
        
        if (!externalConnected || !externalAccount?.address) {
          throw new Error("Please connect your external wallet (Nightly) first. Use the wallet button in the navigation bar.");
        }

        // Check if wallet is on Bardock Testnet (chainId 250), if not, prompt to switch
        if (network?.chainId !== 250) {
          console.log('[useSponsoredVote] Wrong network detected (chainId:', network?.chainId, '), attempting to switch to Bardock Testnet...');
          try {
            // Use wallet adapter's changeNetwork feature
            const changeNetworkFeature = wallet?.features?.['aptos:changeNetwork'];
            if (changeNetworkFeature && 'changeNetwork' in changeNetworkFeature) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (changeNetworkFeature as any).changeNetwork({
                name: Network.CUSTOM,
                chainId: 250,
                url: "https://testnet.movementnetwork.xyz/v1",
              });
              // Network switched successfully - ask user to try again
              throw new Error("Network switched to Bardock Testnet. Please try voting again.");
            } else {
              throw new Error("Wallet doesn't support network switching. Please manually switch to Movement Bardock Testnet.");
            }
          } catch (networkErr) {
            // Re-throw if it's our "try again" message
            if (networkErr instanceof Error && networkErr.message.includes("try voting again")) {
              throw networkErr;
            }
            console.error('[useSponsoredVote] Network switch failed:', networkErr);
            throw new Error("Please switch your wallet to Movement Bardock Testnet to vote. Open your wallet and change the network.");
          }
        }

        // Sign with wallet adapter (shows popup)
        const signResult = await signTransaction({
          transactionOrPayload: transaction,
        });

        // Serialize transaction
        serializedTransaction = transaction.bcsToHex().toString();
        
        // Serialize the authenticator
        const serializer = new Serializer();
        signResult.authenticator.serialize(serializer);
        serializedSignature = `0x${Buffer.from(serializer.toUint8Array()).toString('hex')}`;
      }

      // Send to backend for sponsorship (with auth header)
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (privyUser?.id) {
        headers["X-Privy-User-Id"] = privyUser.id;
      }

      const response = await fetch("/api/vote/sponsored", {
        method: "POST",
        headers,
        body: JSON.stringify({
          submissionId,
          voteXp,
          serializedTransaction,
          serializedSignature,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Vote failed");
      }

      return await response.json();

    } catch (err) {
      const message = err instanceof Error ? err.message : "Vote failed";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [privyUser?.id, privyAptosWallet, externalAccount?.address, externalConnected, signTransaction, signRawHash, network, wallet]);

  return { 
    vote, 
    isLoading, 
    error,
  };
}

export default useSponsoredVote;
