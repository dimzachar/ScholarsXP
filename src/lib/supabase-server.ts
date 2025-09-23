import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from './supabase'

/**
 * Creates an anonymous Supabase client that respects RLS policies
 * This should be used for most API operations as it enforces database-level security
 */
export function createAnonClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          'Cache-Control': 'no-cache'
        }
      },
      db: {
        schema: 'public'
      },
      realtime: {
        log_level: 'error'
      }
    }
  )
}

/**
 * Creates a Supabase client with service role privileges
 * ⚠️ WARNING: This bypasses RLS policies and should ONLY be used for:
 * - Admin operations that require elevated privileges
 * - System operations like user synchronization
 * - Operations that cannot be performed through RLS
 */
export function createServiceClient() {
  // Removed console warning to reduce log noise in production
  // Service client should only be used for admin operations that require bypassing RLS

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          'Cache-Control': 'no-cache'
        }
      },
      db: {
        schema: 'public'
      },
      realtime: {
        log_level: 'error'
      }
    }
  )
}

/**
 * Creates an authenticated Supabase client for server-side operations
 * This client respects RLS policies and uses the user's session
 */
export function createAuthenticatedClient(accessToken: string, refreshToken?: string) {
  const client = createAnonClient()

  // Set the user session to ensure RLS policies are applied correctly
  if (accessToken) {
    client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken || null
    })
  }

  return client
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use createAnonClient() instead
 */
export const createServerSupabaseClient = () => {
  const cookieStore = cookies()

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          'Cache-Control': 'no-cache'
        }
      },
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: Record<string, unknown>) {
          cookieStore.set({ name, value: '', ...options })
        },
      },
    }
  )
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use createAnonClient() instead
 */
export const createRouteHandlerSupabaseClient = () => {
  return createAnonClient()
}
