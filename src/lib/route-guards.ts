/**
 * Route Guards - Privy-First Authentication
 * 
 * Uses Privy user ID header (X-Privy-User-Id) for authentication.
 */

import { NextRequest } from 'next/server'
import { getUserProfileByPrivyId, UserRole } from './auth-middleware'

export interface AuthenticatedUser {
  id: string
  email: string
  role: UserRole
  privyUserId: string
}

/**
 * Higher-order function that creates a route guard requiring specific roles
 * @param allowedRoles Array of roles that are allowed to access the route
 * @returns Function that validates user role and returns authenticated user
 */
export function requireRole(allowedRoles: UserRole[]) {
  return async (request: NextRequest): Promise<AuthenticatedUser> => {
    // Get Privy user ID from header
    const privyUserId = request.headers.get('x-privy-user-id')
    
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
    const privyUserId = request.headers.get('x-privy-user-id')
    
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
 * Get user from Privy user ID header
 * @param request NextRequest object
 * @returns Authenticated user or null
 */
export async function getUserFromPrivyHeader(request: NextRequest): Promise<AuthenticatedUser | null> {
  try {
    const privyUserId = request.headers.get('x-privy-user-id')
    
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
