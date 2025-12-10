/**
 * Sponsored Vote API Endpoint
 * 
 * Accepts a signed transaction from the frontend, sponsors gas via Shinami,
 * and submits to the Movement Network.
 */

import { NextResponse } from "next/server";
import { 
  sponsorAndSubmitTransaction, 
  isGasStationEnabled 
} from "@/lib/services/shinami-gas";
import { prisma } from "@/lib/prisma";
import { withAuth, AuthenticatedRequest } from "@/lib/auth-middleware";

async function handleSponsoredVote(request: AuthenticatedRequest) {
  try {
    // Check if gas station is enabled
    if (!isGasStationEnabled()) {
      return NextResponse.json(
        { error: "Sponsored transactions not available" },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { 
      submissionId, 
      voteXp, 
      serializedTransaction, 
      serializedSignature 
    } = body;

    // Validate inputs
    if (!submissionId || typeof voteXp !== "number") {
      return NextResponse.json(
        { error: "Invalid vote data" },
        { status: 400 }
      );
    }

    if (!serializedTransaction || !serializedSignature) {
      return NextResponse.json(
        { error: "Missing transaction data" },
        { status: 400 }
      );
    }

    // Get primary wallet from UserWallet table
    const userId = request.user.id;
    const userWallets = await prisma.$queryRaw<Array<{ address: string }>>`
      SELECT address FROM "UserWallet" 
      WHERE "userId" = ${userId}::uuid AND "isPrimary" = true
      LIMIT 1
    `;
    
    const walletAddress = userWallets[0]?.address;
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: "No primary wallet linked to account" },
        { status: 400 }
      );
    }

    // Check if user has already voted (via any of their wallets)
    const allUserWallets = await prisma.$queryRaw<Array<{ address: string }>>`
      SELECT address FROM "UserWallet" WHERE "userId" = ${userId}::uuid
    `;
    const walletAddresses = allUserWallets.map(w => w.address);
    
    const existingVote = await prisma.judgmentVote.findFirst({
      where: { 
        submissionId, 
        walletAddress: { in: walletAddresses } 
      }
    });

    if (existingVote) {
      return NextResponse.json(
        { error: "Already voted on this submission" },
        { status: 409 }
      );
    }

    // Sponsor and submit transaction via Shinami
    const { hash } = await sponsorAndSubmitTransaction(
      serializedTransaction,
      serializedSignature
    );

    // Record vote in database
    await prisma.judgmentVote.create({
      data: {
        submissionId,
        walletAddress,
        voteXp,
        signature: hash, // tx hash as proof
      }
    });

    return NextResponse.json({ 
      success: true, 
      transactionHash: hash 
    });
  } catch (error) {
    console.error("Sponsored vote error:", error);
    
    const message = error instanceof Error ? error.message : "Unknown error";
    
    // Handle specific Shinami errors
    if (message.includes("insufficient funds")) {
      return NextResponse.json(
        { error: "Gas sponsorship temporarily unavailable" },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Failed to submit vote", details: message },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handleSponsoredVote);
