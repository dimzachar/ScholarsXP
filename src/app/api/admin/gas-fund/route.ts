/**
 * Gas Fund Balance API (Admin Only)
 * 
 * Returns the current Shinami Gas Station fund balance for monitoring.
 */

import { NextResponse } from "next/server";
import { getGasFundBalance, isGasStationEnabled } from "@/lib/services/shinami-gas";
import { withRole, AuthenticatedRequest } from "@/lib/auth-middleware";

async function handleGetGasFund(_request: AuthenticatedRequest) {
  try {
    if (!isGasStationEnabled()) {
      return NextResponse.json(
        { 
          enabled: false,
          error: "Gas Station not configured" 
        },
        { status: 200 }
      );
    }

    const balance = await getGasFundBalance();
    
    return NextResponse.json({
      enabled: true,
      ...balance,
    });
  } catch (error) {
    console.error("Gas fund balance error:", error);
    return NextResponse.json(
      { error: "Failed to get balance" },
      { status: 500 }
    );
  }
}

export const GET = withRole("ADMIN")(handleGetGasFund);
