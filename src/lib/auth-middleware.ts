import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { UserRole, UserProfile } from '@/contexts/AuthContext'

export interface AuthenticatedRequest extends NextRequest {
  user: {
    id: string
    email: string
    user_metadata?: any
    access_token?: string
    refresh_token?: string | null
  }
  userProfile: UserProfile
}

type Permission =
  | 'authenticated'
  | 'submit_content'
  | 'review_content'
  | 'admin_access'
  | 'manage_users'
  | 'view_analytics'

type RolePermissions = {
  [key in UserRole]: Permission[]
}

const ROLE_PERMISSIONS: RolePermissions = {
  USER: ['authenticated', 'submit_content'],
  REVIEWER: ['authenticated', 'submit_content', 'review_content'],
  ADMIN: ['authenticated', 'submit_content', 'review_content', 'admin_access', 'manage_users', 'view_analytics']
}

export class AuthError extends Error {
  constructor(message: string, public statusCode: number = 401) {
    super(message)
    this.name = 'AuthError'
  }
}

export async function verifyAuthToken(token: string) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false
        }
      }
    )

    const { data, error } = await supabase.auth.getUser(token)

    if (error || !data.user) {
      return { user: null, error: error || new Error('Invalid token') }
    }

    // Get user profile with role
    const userProfile = await getUserProfile(data.user.id, data.user.email!)

    return {
      user: {
        ...data.user,
        role: userProfile.role,
        access_token: token,
        refresh_token: null // Will be handled separately if needed
      },
      error: null
    }
  } catch (error) {
    return { user: null, error: error as Error }
  }
}

export async function getAuthenticatedUser(request: NextRequest) {
  // First try to get token from Authorization header
  const authHeader = request.headers.get('authorization')
  let accessToken: string | undefined

  if (authHeader && authHeader.startsWith('Bearer ')) {
    accessToken = authHeader.substring(7)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set() {
          // Can't set cookies in middleware
        },
        remove() {
          // Can't remove cookies in middleware
        },
      },
    }
  )

  let user
  let error

  if (accessToken) {
    // Use the token from Authorization header
    const { data, error: tokenError } = await supabase.auth.getUser(accessToken)
    user = data.user
    error = tokenError
  } else {
    // Fall back to cookies
    const { data, error: cookieError } = await supabase.auth.getUser()
    user = data.user
    error = cookieError
  }

  if (error || !user) {
    throw new AuthError('Authentication required', 401)
  }

  return user
}

export async function getUserProfile(userId: string, email: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // First try to find by ID
  let { data, error } = await supabase
    .from('User')
    .select('*')
    .eq('id', userId)
    .single()

  // If not found by ID, try to find by email
  if (error && email) {
    const { data: emailData, error: emailError } = await supabase
      .from('User')
      .select('*')
      .eq('email', email)
      .single()

    if (!emailError && emailData) {
      // Update the user record with the new auth ID
      const { error: updateError } = await supabase
        .from('User')
        .update({ id: userId })
        .eq('email', email)

      if (!updateError) {
        data = { ...emailData, id: userId }
      } else {
        data = emailData
      }
    }
  }

  if (!data) {
    throw new AuthError('User profile not found', 404)
  }

  return data as UserProfile
}

export function hasPermission(userRole: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[userRole].includes(permission)
}

export function createRoleBasedHandler() {
  return {
    withPermission: (permission: Permission) => {
      return (handler: (request: AuthenticatedRequest, context?: any) => Promise<NextResponse>) => {
        return async (request: NextRequest, context?: any) => {
          try {
            // Get token from Authorization header or cookies
            const authHeader = request.headers.get('authorization')
            let accessToken: string | undefined

            if (authHeader && authHeader.startsWith('Bearer ')) {
              accessToken = authHeader.substring(7)
            } else {
              // Try to get from cookies
              accessToken = request.cookies.get('sb-access-token')?.value
            }

            if (!accessToken) {
              return NextResponse.json(
                { error: 'Authentication required - no token found' },
                { status: 401 }
              )
            }

            // Verify token and get user with access_token included
            const { user, error } = await verifyAuthToken(accessToken)

            if (error || !user) {
              return NextResponse.json(
                { error: 'Authentication failed - invalid token' },
                { status: 401 }
              )
            }

            // Get user profile with role (already included in verifyAuthToken result)
            const userProfile = {
              id: user.id,
              email: user.email!,
              role: user.role,
              username: user.user_metadata?.username || user.email!.split('@')[0]
            }

            // Check permission
            if (!hasPermission(userProfile.role, permission)) {
              return NextResponse.json(
                {
                  error: 'Insufficient permissions',
                  required: permission,
                  userRole: userProfile.role
                },
                { status: 403 }
              )
            }

            // Create authenticated request
            const authenticatedRequest = request as AuthenticatedRequest
            authenticatedRequest.user = user
            authenticatedRequest.userProfile = userProfile

            // Call the handler
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
            // Get authenticated user
            const user = await getAuthenticatedUser(request)
            
            // Get user profile with role
            const userProfile = await getUserProfile(user.id, user.email!)
            
            // Check role (admin can access everything)
            const hasAccess = userProfile.role === requiredRole || 
                             userProfile.role === 'ADMIN' ||
                             (requiredRole === 'REVIEWER' && userProfile.role === 'ADMIN')

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
            authenticatedRequest.user = user
            authenticatedRequest.userProfile = userProfile

            // Call the handler
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
          // Get authenticated user
          const user = await getAuthenticatedUser(request)
          
          // Get user profile
          const userProfile = await getUserProfile(user.id, user.email!)

          // Create authenticated request
          const authenticatedRequest = request as AuthenticatedRequest
          authenticatedRequest.user = user
          authenticatedRequest.userProfile = userProfile

          // Call the handler
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
