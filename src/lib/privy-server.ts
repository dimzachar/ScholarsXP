/**
 * Privy Server-Side Authentication
 * 
 * Provides cryptographic verification of Privy auth tokens.
 * This prevents spoofing of the X-Privy-User-Id header.
 */

import { PrivyClient } from '@privy-io/node'

// Singleton Privy client instance
let privyClient: PrivyClient | null = null

/**
 * Get or create the Privy server client.
 */
function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
    const appSecret = process.env.PRIVY_APP_SECRET

    if (!appId || !appSecret) {
      throw new Error(
        'Privy configuration missing: NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET are required'
      )
    }

    privyClient = new PrivyClient({ appId, appSecret })
  }

  return privyClient
}

export interface VerifiedPrivyUser {
  userId: string
  appId: string
  issuedAt: Date
  expiresAt: Date
}

/**
 * Verify a Privy auth token and extract the user ID.
 * 
 * @param authToken - The Bearer token from the Authorization header
 * @returns The verified user info including the Privy user ID
 * @throws Error if token is invalid, expired, or verification fails
 */
export async function verifyPrivyToken(authToken: string): Promise<VerifiedPrivyUser> {
  const client = getPrivyClient()

  try {
    const verifiedClaims = await client.utils().auth().verifyAuthToken(authToken)

    return {
      userId: verifiedClaims.user_id,
      appId: verifiedClaims.app_id,
      issuedAt: new Date(verifiedClaims.issued_at * 1000),
      expiresAt: new Date(verifiedClaims.expiration * 1000),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token verification failed'
    throw new Error(`Privy token verification failed: ${message}`)
  }
}

/**
 * Extract the Bearer token from an Authorization header value.
 * 
 * @param authHeader - The full Authorization header value
 * @returns The token without the "Bearer " prefix, or null if invalid
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  
  const parts = authHeader.split(' ')
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null
  }
  
  return parts[1]
}
