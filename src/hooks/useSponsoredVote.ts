"use client";

import { useState, useCallback } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { 
  Aptos, 
  AptosConfig, 
  Network,
  Serializer,
} from "@aptos-labs/ts-sdk";

// Movement Mainnet client
const movementClient = new Aptos(new AptosConfig({
  network: Network.CUSTOM,
  fullnode: "https://full.mainnet.movementinfra.xyz/v1",
}));

// 5 minutes expiration (Shinami workshop recommendation)
const FIVE_MINUTES_IN_SECONDS = 5 * 60;

export interface SponsoredVoteResult {
  success: boolean;
  transactionHash: string;
}

export interface UseSponsoredVoteReturn {
  vote: (submissionId: string, voteXp: number) => Promise<SponsoredVoteResult>;
  isLoading: boolean;
  error: string | null;
  isConnected: boolean;
}

/**
 * Hook for submitting gasless votes via Shinami Gas Station.
 * 
 * Flow:
 * 1. Build transaction with feePayer = 0x0
 * 2. Sign with connected wallet (Privy/Nightly)
 * 3. Send to backend for gas sponsorship
 * 4. Backend sponsors via Shinami and submits to chain
 */
export function useSponsoredVote(): UseSponsoredVoteReturn {
  const { account, signTransaction } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vote = useCallback(async (
    submissionId: string, 
    voteXp: number
  ): Promise<SponsoredVoteResult> => {
    if (!account?.address) {
      throw new Error("Wallet not connected");
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Build transaction with feePayer placeholder
      const expirationTime = Math.floor(Date.now() / 1000) + FIVE_MINUTES_IN_SECONDS;

      const transaction = await movementClient.transaction.build.simple({
        sender: account.address,
        withFeePayer: true, // Sets feePayerAddress to 0x0
        data: {
          // TODO: Replace with actual Judgment contract when deployed
          // For now, this is a placeholder - the actual contract call
          // will be: "0xCONTRACT::judgment::cast_vote"
          function: "0x1::aptos_account::transfer",
          functionArguments: [account.address, 0], // No-op transfer to self
        },
        options: {
          expireTimestamp: expirationTime,
        },
      });

      // 2. Sign with connected wallet (SIGN ONLY, not submit!)
      // The wallet adapter returns { authenticator, rawTransaction }
      const signResult = await signTransaction({
        transactionOrPayload: transaction,
      });

      // 3. Serialize for backend
      const serializedTransaction = transaction.bcsToHex().toString();
      
      // Serialize the authenticator
      const serializer = new Serializer();
      signResult.authenticator.serialize(serializer);
      const serializedSignature = Buffer.from(serializer.toUint8Array()).toString('hex');

      // 4. Send to backend for sponsorship
      const response = await fetch("/api/vote/sponsored", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          voteXp,
          serializedTransaction,
          serializedSignature: `0x${serializedSignature}`,
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
  }, [account?.address, signTransaction]);

  return { 
    vote, 
    isLoading, 
    error, 
    isConnected: !!account?.address 
  };
}

export default useSponsoredVote;
