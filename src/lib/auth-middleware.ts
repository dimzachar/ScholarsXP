/**
 * Auth Middleware - Privy-First Authentication with Token Verification
 * 
 * Uses cryptographic verification of Privy auth tokens to prevent spoofing.
 * Falls back to X-Privy-User-Id header only in development when PRIVY_APP_SECRET is not set.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyPrivyToken, extractBearerToken } from './privy-server'
import {
  UserRole,
  Permission,
  hasPermission,
  normalizeRole,
  isValidRole,
  hasRoleOrHigher,
  ROLE_HIERARCHY
} from './roles'

// Re-export for backward compatibility
export type { UserRole, Permission }

export interface UserProfile {
  id: string
  privyUserId?: string
  email: string | null
  username: string | null
  role: UserRole
  totalXp: number
  currentWeekXp: number
  streakWeeks: number
  missedReviews: number
  discordId?: string | null
  discordHandle?: string | null
  discordAvatarUrl?: string | null
  movementWalletAddress?: string | null
  walletLinkedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface AuthenticatedRequest extends NextRequest {
  user: {
    id: string
    email: string
    user_metadata?: Record<string, unknown>
  }
  userProfile: UserProfile
}

export class AuthError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message)
    this.name = 'AuthError'
  }
}

/**
 * Get user profile by Privy user ID
 */
export async function getUserProfileByPrivyId(privyUserId: string): Promise<UserProfile | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from('User')
    .select('*')
    .eq('privyUserId', privyUserId)
    .single()

  if (error || !data) {
    return null
  }

  return data as UserProfile
}

/**
 * Verify the Privy auth token and extract the user ID.
 * 
 * SECURITY: In production, ONLY accepts cryptographically verified Bearer tokens.
 * The X-Privy-User-Id header is NEVER trusted in production as it can be spoofed.
 * 
 * Development: Tries Bearer token first, falls back to X-Privy-User-Id header
 * for backward compatibility with components not yet updated.
 */
async function getVerifiedPrivyUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get('authorization')
  const bearerToken = extractBearerToken(authHeader)
  const isProduction = process.env.NODE_ENV === 'production'

  // If we have a Bearer token, verify it cryptographically
  if (bearerToken) {
    try {
      const verified = await verifyPrivyToken(bearerToken)
      return verified.userId
    } catch (error) {
      console.error('Privy token verification failed:', error)
      // In production, fail. In dev, fall through to header fallback.
      if (isProduction) {
        return null
      }
    }
  }

  // PRODUCTION: Never accept unverified headers
  if (isProduction) {
    return null
  }

  // DEVELOPMENT ONLY: Allow X-Privy-User-Id header as fallback
  const privyUserIdHeader = request.headers.get('x-privy-user-id')
  if (privyUserIdHeader) {
    return privyUserIdHeader
  }

  return null
}

export function createRoleBasedHandler() {
  return {
    withPermission: (permission: Permission) => {
      return (handler: (request: AuthenticatedRequest, context?: any) => Promise<NextResponse>) => {
        return async (request: NextRequest, context?: any) => {
          try {
            // Verify Privy token and get user ID
            const privyUserId = await getVerifiedPrivyUserId(request)

            if (!privyUserId) {
              const response = NextResponse.json(
                { error: 'Authentication required - please sign in' },
                { status: 401 }
              )
              // Add cache headers even for 401 responses
              response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
              response.headers.set('Pragma', 'no-cache')
              response.headers.set('Expires', '0')
              return response
            }

            // Get user profile by Privy ID
            const userProfile = await getUserProfileByPrivyId(privyUserId)

            if (!userProfile) {
              const response = NextResponse.json(
                { error: 'User not found - please complete sign in' },
                { status: 401 }
              )
              // Add cache headers even for 401 responses
              response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
              response.headers.set('Pragma', 'no-cache')
              response.headers.set('Expires', '0')
              return response
            }

            // Check permission using normalized role
            const userRole = normalizeRole(userProfile.role)
            if (!hasPermission(userRole, permission)) {
              const response = NextResponse.json(
                {
                  error: 'Insufficient permissions',
                  required: permission,
                  userRole: userProfile.role
                },
                { status: 403 }
              )
              // Add cache headers even for 403 responses
              response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
              response.headers.set('Pragma', 'no-cache')
              response.headers.set('Expires', '0')
              return response
            }

            // Create authenticated request
            const authenticatedRequest = request as AuthenticatedRequest
            authenticatedRequest.user = {
              id: userProfile.id,
              email: userProfile.email || '',
              user_metadata: {
                username: userProfile.username,
                avatar_url: userProfile.discordAvatarUrl
              }
            }
            authenticatedRequest.userProfile = userProfile

            return await handler(authenticatedRequest, context)
          } catch (error) {
            if (error instanceof AuthError) {
              return NextResponse.json(
                { error: error.message },
                { status: error.statusCode }
              )
            }

            console.error('Auth middleware error:', error)
            return NextResponse.json(
              { error: 'Internal server error' },
              { status: 500 }
            )
          }
        }
      }
    },

    withRole: (requiredRole: UserRole) => {
      return (handler: (request: AuthenticatedRequest, context?: any) => Promise<NextResponse>) => {
        return async (request: NextRequest, context?: any) => {
          try {
            // Verify Privy token and get user ID
            const privyUserId = await getVerifiedPrivyUserId(request)

            if (!privyUserId) {
              return NextResponse.json(
                { error: 'Authentication required - please sign in' },
                { status: 401 }
              )
            }

            // Get user profile by Privy ID
            const userProfile = await getUserProfileByPrivyId(privyUserId)

            if (!userProfile) {
              return NextResponse.json(
                { error: 'User not found - please complete sign in' },
                { status: 401 }
              )
            }

            // Check role using hierarchy (admin/developer can access everything)
            const userRole = normalizeRole(userProfile.role)
            const hasAccess = hasRoleOrHigher(userRole, requiredRole)

            if (!hasAccess) {
              return NextResponse.json(
                {
                  error: 'Insufficient role',
                  required: requiredRole,
                  userRole: userProfile.role
                },
                { status: 403 }
              )
            }

            // Create authenticated request
            const authenticatedRequest = request as AuthenticatedRequest
            authenticatedRequest.user = {
              id: userProfile.id,
              email: userProfile.email || '',
              user_metadata: {
                username: userProfile.username,
                avatar_url: userProfile.discordAvatarUrl
              }
            }
            authenticatedRequest.userProfile = userProfile

            return await handler(authenticatedRequest, context)
          } catch (error) {
            if (error instanceof AuthError) {
              return NextResponse.json(
                { error: error.message },
                { status: error.statusCode }
              )
            }

            console.error('Auth middleware error:', error)
            return NextResponse.json(
              { error: 'Internal server error' },
              { status: 500 }
            )
          }
        }
      }
    },

    // Simple auth check without role/permission requirements
    withAuth: (handler: (request: AuthenticatedRequest, context?: any) => Promise<NextResponse>) => {
      return async (request: NextRequest, context?: any) => {
        try {
          // Verify Privy token and get user ID
          const privyUserId = await getVerifiedPrivyUserId(request)

          if (!privyUserId) {
            return NextResponse.json(
              { error: 'Authentication required - please sign in' },
              { status: 401 }
            )
          }

          // Get user profile by Privy ID
          const userProfile = await getUserProfileByPrivyId(privyUserId)

          if (!userProfile) {
            return NextResponse.json(
              { error: 'User not found - please complete sign in' },
              { status: 401 }
            )
          }

          // Create authenticated request
          const authenticatedRequest = request as AuthenticatedRequest
          authenticatedRequest.user = {
            id: userProfile.id,
            email: userProfile.email || '',
            user_metadata: {
              username: userProfile.username,
              avatar_url: userProfile.discordAvatarUrl
            }
          }
          authenticatedRequest.userProfile = userProfile

          return await handler(authenticatedRequest, context)
        } catch (error) {
          if (error instanceof AuthError) {
            return NextResponse.json(
              { error: error.message },
              { status: error.statusCode }
            )
          }

          console.error('Auth middleware error:', error)
          return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
          )
        }
      }
    }
  }
}

// Export singleton instance
export const authMiddleware = createRoleBasedHandler()

// Export convenience functions
export const withAuth = authMiddleware.withAuth
export const withRole = authMiddleware.withRole
export const withPermission = authMiddleware.withPermission
