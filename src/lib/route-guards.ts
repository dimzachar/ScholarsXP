import { NextRequest } from 'next/server'
import { verifyAuthToken } from './auth-middleware'
import { UserRole } from '@/contexts/AuthContext'

export interface AuthenticatedUser {
  id: string
  email: string
  role: UserRole
  access_token: string
  refresh_token: string | null
}

/**
 * Higher-order function that creates a route guard requiring specific roles
 * @param allowedRoles Array of roles that are allowed to access the route
 * @returns Function that validates user role and returns authenticated user
 */
export function requireRole(allowedRoles: UserRole[]) {
  return async (request: NextRequest): Promise<AuthenticatedUser> => {
    // Get token from request cookies
    const token = request.cookies.get('sb-access-token')?.value
    
    if (!token) {
      throw new Error('Authentication required - no token found')
    }

    // Verify token and get user with role
    const { user, error } = await verifyAuthToken(token)
    
    if (error || !user) {
      throw new Error('Authentication failed - invalid token')
    }

    // Check if user role is allowed
    if (!allowedRoles.includes(user.role)) {
      throw new Error(`Insufficient permissions - required: ${allowedRoles.join(' or ')}, current: ${user.role}`)
    }

    return user as AuthenticatedUser
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
    const token = request.cookies.get('sb-access-token')?.value
    
    if (!token) {
      return null
    }

    const { user, error } = await verifyAuthToken(token)
    
    if (error || !user) {
      return null
    }

    return user as AuthenticatedUser
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
 * Middleware helper to extract user from Authorization header
 * @param request NextRequest object
 * @returns Authenticated user or null
 */
export async function getUserFromAuthHeader(request: NextRequest): Promise<AuthenticatedUser | null> {
  try {
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null
    }

    const token = authHeader.substring(7)
    const { user, error } = await verifyAuthToken(token)
    
    if (error || !user) {
      return null
    }

    return user as AuthenticatedUser
  } catch (error) {
    console.error('Error getting user from auth header:', error)
    return null
  }
}
