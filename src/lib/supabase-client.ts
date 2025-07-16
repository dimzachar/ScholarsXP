'use client'

import { createClient } from '@supabase/supabase-js'
import type { Database } from './supabase'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  },
  global: {
    headers: {
      'X-Client-Info': 'scholars-xp-web'
    }
  },
  db: {
    schema: 'public'
  },
  realtime: {
    log_level: 'error'
  }
})
