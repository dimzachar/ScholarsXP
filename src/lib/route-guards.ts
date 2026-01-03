/**
 * Route Guards - Privy-First Authentication with Token Verification
 * 
 * Uses Bearer token verification for secure authentication.
 * Falls back to X-Privy-User-Id header only in development.
 */

import { NextRequest } from 'next/server'
import { getUserProfileByPrivyId, UserRole } from './auth-middleware'
import { verifyPrivyToken, extractBearerToken } from './privy-server'

export interface AuthenticatedUser {
  id: string
  email: string
  role: UserRole
  privyUserId: string
}

/**
 * Verify the Privy auth token and extract the user ID.
 * In production, ONLY accepts cryptographically verified Bearer tokens.
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

/**
 * Higher-order function that creates a route guard requiring specific roles
 * @param allowedRoles Array of roles that are allowed to access the route
 * @returns Function that validates user role and returns authenticated user
 */
export function requireRole(allowedRoles: UserRole[]) {
  return async (request: NextRequest): Promise<AuthenticatedUser> => {
    // Verify Bearer token and get Privy user ID
    const privyUserId = await getVerifiedPrivyUserId(request)
    
    if (!privyUserId) {
      throw new Error('Authentication required - please sign in')
    }

    // Get user profile by Privy ID
    const userProfile = await getUserProfileByPrivyId(privyUserId)
    
    if (!userProfile) {
      throw new Error('User not found - please complete sign in')
    }

    // Check if user role is allowed
    if (!allowedRoles.includes(userProfile.role)) {
      throw new Error(`Insufficient permissions - required: ${allowedRoles.join(' or ')}, current: ${userProfile.role}`)
    }

    return {
      id: userProfile.id,
      email: userProfile.email || '',
      role: userProfile.role,
      privyUserId: userProfile.privyUserId || privyUserId,
    }
  }
}

/**
 * Convenience function for admin-only routes
 */
export const requireAdmin = requireRole(['ADMIN'])

/**
 * Convenience function for reviewer or admin routes
 */
export const requireReviewer = requireRole(['REVIEWER', 'ADMIN'])

/**
 * Convenience function for any authenticated user
 */
export const requireAuth = requireRole(['USER', 'REVIEWER', 'ADMIN'])

/**
 * Get current user from request without role restrictions
 * @param request NextRequest object
 * @returns Authenticated user or null if not authenticated
 */
export async function getCurrentUser(request: NextRequest): Promise<AuthenticatedUser | null> {
  try {
    const privyUserId = await getVerifiedPrivyUserId(request)
    
    if (!privyUserId) {
      return null
    }

    const userProfile = await getUserProfileByPrivyId(privyUserId)
    
    if (!userProfile) {
      return null
    }

    return {
      id: userProfile.id,
      email: userProfile.email || '',
      role: userProfile.role,
      privyUserId: userProfile.privyUserId || privyUserId,
    }
  } catch (error) {
    console.error('Error getting current user:', error)
    return null
  }
}

/**
 * Check if user has specific permission based on role
 * @param userRole Current user role
 * @param requiredRoles Array of roles that have the permission
 * @returns Boolean indicating if user has permission
 */
export function hasRolePermission(userRole: UserRole, requiredRoles: UserRole[]): boolean {
  return requiredRoles.includes(userRole)
}

/**
 * Get user from Bearer token (preferred) or Privy user ID header (dev only)
 * @param request NextRequest object
 * @returns Authenticated user or null
 */
export async function getUserFromPrivyHeader(request: NextRequest): Promise<AuthenticatedUser | null> {
  try {
    const privyUserId = await getVerifiedPrivyUserId(request)
    
    if (!privyUserId) {
      return null
    }

    const userProfile = await getUserProfileByPrivyId(privyUserId)
    
    if (!userProfile) {
      return null
    }

    return {
      id: userProfile.id,
      email: userProfile.email || '',
      role: userProfile.role,
      privyUserId: userProfile.privyUserId || privyUserId,
    }
  } catch (error) {
    console.error('Error getting user from Privy header:', error)
    return null
  }
}

/**
 * @deprecated Use getUserFromPrivyHeader instead
 */
export const getUserFromAuthHeader = getUserFromPrivyHeader
