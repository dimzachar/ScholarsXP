import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from '../supabase'

export const createClient = async () => {
  const cookieStore = await cookies()

  // Get the session token from cookies
  const accessToken = cookieStore.get('sb-access-token')?.value
  const refreshToken = cookieStore.get('sb-refresh-token')?.value

  const supabase = createSupabaseClient<Database>(
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
          'Cache-Control': 'no-cache',
          ...(accessToken && { Authorization: `Bearer ${accessToken}` })
        }
      }
    }
  )

  // If we have tokens, set the session
  if (accessToken && refreshToken) {
    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    })
  }

  return supabase
}

export { createClient as createServerSupabaseClient }
