'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase-client'

export type UserRole = 'USER' | 'REVIEWER' | 'ADMIN'

export interface UserProfile {
  id: string
  email: string
  username: string | null
  role: UserRole
  totalXp: number
  currentWeekXp: number
  streakWeeks: number
  missedReviews: number
  createdAt: string
  updatedAt: string
}

interface AuthContextType {
  user: User | null
  session: Session | null
  userProfile: UserProfile | null
  loading: boolean
  signOut: () => Promise<void>
  refreshUserProfile: () => Promise<void>
  hasRole: (role: UserRole) => boolean
  isAdmin: boolean
  isReviewer: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  userProfile: null,
  loading: true,
  signOut: async () => {},
  refreshUserProfile: async () => {},
  hasRole: () => false,
  isAdmin: false,
  isReviewer: false
})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: React.ReactNode
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  // Function to fetch user profile from database
  const fetchUserProfile = async (userId: string) => {
    try {
      // First try to find by ID
      let { data, error } = await supabase
        .from('User')
        .select('*')
        .eq('id', userId)
        .single()

      // If not found by ID, try to find by email (for cases where auth ID changed)
      if (error && user?.email) {
        const { data: emailData, error: emailError } = await supabase
          .from('User')
          .select('*')
          .eq('email', user.email)
          .single()

        if (!emailError && emailData) {
          // Update the user record with the new auth ID
          const { error: updateError } = await supabase
            .from('User')
            .update({ id: userId })
            .eq('email', user.email)

          if (!updateError) {
            data = { ...emailData, id: userId }
          } else {
            data = emailData
          }
        }
      }

      if (data) {
        setUserProfile(data as UserProfile)
      }
    } catch (error) {
      console.error('Error fetching user profile:', error)
    }
  }

  // Function to refresh user profile
  const refreshUserProfile = async () => {
    if (user?.id) {
      await fetchUserProfile(user.id)
    }
  }

  useEffect(() => {
    let mounted = true

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state change:', event, !!session)

        if (!mounted) return

        setSession(session)
        setUser(session?.user ?? null)

        // Set/clear the access token cookie for middleware
        if (session?.access_token) {
          document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=3600; SameSite=Lax`
        } else {
          document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
        }

        // Fetch user profile when user is available
        if (session?.user) {
          fetchUserProfile(session.user.id).catch(console.error)
        } else {
          setUserProfile(null)
        }

        setLoading(false)

        // Create user profile only on actual sign in
        if (event === 'SIGNED_IN' && session?.user) {
          console.log('User signed in, creating profile...')
          createOrUpdateUserProfile(session.user).catch(console.error)
        }
      }
    )

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        setSession(session)
        setUser(session?.user ?? null)

        // Set the access token cookie for middleware
        if (session?.access_token) {
          document.cookie = `sb-access-token=${session.access_token}; path=/; max-age=3600; SameSite=Lax`
        }

        // Fetch user profile if session exists
        if (session?.user) {
          fetchUserProfile(session.user.id).catch(console.error)
        }

        setLoading(false)
        console.log('Initial session loaded:', !!session)
      }
    }).catch((error) => {
      console.error('Error getting session:', error)
      if (mounted) {
        setLoading(false)
      }
    })

    // Fallback timeout
    const timeout = setTimeout(() => {
      if (mounted) {
        setLoading(false)
      }
    }, 3000)

    return () => {
      mounted = false
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const createOrUpdateUserProfile = async (user: User) => {
    // Prevent multiple calls for the same user using a simple cache
    const cacheKey = `user_created_${user.id}`
    if (typeof window !== 'undefined' && window.sessionStorage.getItem(cacheKey)) {
      // Silently skip user creation if already processed
      return
    }

    // Set processing flag immediately to prevent concurrent calls
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(cacheKey, 'processing')
    }

    try {
      // Use upsert to avoid 409 conflicts - insert if new, update if exists
      const userData = {
        id: user.id,
        email: user.email!,
        username: user.user_metadata?.full_name ||
                 user.user_metadata?.name ||
                 user.email?.split('@')[0] ||
                 'User',
        totalXp: 0,
        currentWeekXp: 0,
        streakWeeks: 0,
        missedReviews: 0
      }

      // First try to insert, if it fails due to conflict, that's okay
      const { error } = await supabase
        .from('User')
        .upsert(userData, {
          onConflict: 'id',
          ignoreDuplicates: false // Don't ignore duplicates, let it update
        })

      if (error) {
        // Check if it's a duplicate key error (user already exists) - ignore these
        if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('conflict')) {
          console.log('User already exists, continuing with existing profile')
        } else {
          console.error('Error upserting user profile:', error)
          // Remove processing flag on error
          if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem(cacheKey)
          }
          return
        }
      } else {
        console.log('User profile created/updated successfully')
      }

      // Always cache successful operation and refresh profile
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(cacheKey, 'processed')
      }

      // Refresh the user profile to get the latest data including role
      await fetchUserProfile(user.id)
    } catch (error) {
      console.error('Error managing user profile:', error)
      // Remove processing flag on error
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(cacheKey)
      }
    }
  }

  const signOut = async () => {
    try {
      // Clear local state immediately for better UX
      setUser(null)
      setSession(null)

      // Clear cached data immediately
      localStorage.clear()
      sessionStorage.clear()

      // Clear the access token cookie
      document.cookie = 'sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'

      // Sign out from Supabase with timeout
      const signOutPromise = supabase.auth.signOut()
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Sign out timed out')), 3000)
      })

      try {
        await Promise.race([signOutPromise, timeoutPromise])
      } catch (error) {
        console.error('Sign out error (continuing anyway):', error)
      }

      // Redirect immediately regardless of Supabase response
      window.location.href = '/login'

    } catch (error) {
      console.error('Error during sign out:', error)
      // Still redirect even if there's an error
      window.location.href = '/login'
    }
  }

  // Role helper functions
  const hasRole = (role: UserRole): boolean => {
    return userProfile?.role === role
  }

  const isAdmin = userProfile?.role === 'ADMIN'
  const isReviewer = userProfile?.role === 'REVIEWER' || userProfile?.role === 'ADMIN'

  const value = {
    user,
    session,
    userProfile,
    loading,
    signOut,
    refreshUserProfile,
    hasRole,
    isAdmin,
    isReviewer
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
