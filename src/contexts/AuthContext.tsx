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

  // Emergency timeout to prevent infinite loading (fallback)
  useEffect(() => {
    const emergencyTimeout = setTimeout(() => {
      if (loading) {
        // console.log('⚠️ AuthProvider: Emergency timeout triggered - auth flow took longer than expected')
        setLoading(false)
      }
    }, 5000) // 5 second timeout as fallback

    return () => clearTimeout(emergencyTimeout)
  }, [loading])

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

  const syncSessionCookies = async (nextSession: Session | null) => {
    try {
      if (nextSession?.access_token) {
        const response = await fetch('/api/auth/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            accessToken: nextSession.access_token,
            refreshToken: nextSession.refresh_token,
            expiresAt: nextSession.expires_at ?? null
          })
        })

        if (!response.ok) {
          console.error('Failed to persist Supabase session cookie', await response.text())
        }
      } else {
        const response = await fetch('/api/auth/session', {
          method: 'DELETE',
          credentials: 'include'
        })

        if (!response.ok) {
          console.error('Failed to clear Supabase session cookie', await response.text())
        }
      }
    } catch (error) {
      console.error('Error syncing Supabase session cookies:', error)
    }
  }

  useEffect(() => {
    let mounted = true

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {

        if (!mounted) return

        setSession(session)
        setUser(session?.user ?? null)

        await syncSessionCookies(session)

        // Fetch user profile when user is available
        if (session?.user) {
          fetchUserProfile(session.user.id).catch(console.error)
        } else {
          setUserProfile(null)
        }

        setLoading(false)

        // Create user profile only on actual sign in
        if (event === 'SIGNED_IN' && session?.user) {
          // console.log('User signed in, creating profile...')
          createOrUpdateUserProfile(session.user).catch(console.error)
        }
      }
    )

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        setSession(session)
        setUser(session?.user ?? null)

        syncSessionCookies(session).catch(error => {
          console.error('Error syncing initial Supabase session cookies:', error)
        })

        // Fetch user profile if session exists
        if (session?.user) {
          fetchUserProfile(session.user.id).catch(console.error)
        }

        setLoading(false)
        // console.log('Initial session loaded:', !!session)
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
    // Prevent multiple calls for the same user using a robust cache
    const cacheKey = `user_created_${user.id}`

    if (typeof window !== 'undefined') {
      const existingCache = window.sessionStorage.getItem(cacheKey)

      if (existingCache === 'processing') {
        // console.log('User profile creation already in progress, skipping')
        return
      }
    }

    // Set processing flag immediately to prevent concurrent calls
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(cacheKey, 'processing')
    }

    try {
      // Try multiple Discord metadata fields to get the username
      const discordHandle = user.user_metadata?.username ||
                           user.user_metadata?.global_name ||
                           user.user_metadata?.name ||
                           user.user_metadata?.preferred_username

      // console.log('Discord metadata:', {
      //   username: user.user_metadata?.username,
      //   global_name: user.user_metadata?.global_name,
      //   name: user.user_metadata?.name,
      //   preferred_username: user.user_metadata?.preferred_username,
      //   full_name: user.user_metadata?.full_name,
      //   selected_handle: discordHandle
      // })

      // Create/update user profile first
      const userData = {
        id: user.id,
        email: user.email!,
        username: user.user_metadata?.full_name ||
                 user.user_metadata?.name ||
                 user.user_metadata?.global_name ||
                 user.user_metadata?.username ||
                 user.email?.split('@')[0] ||
                 'User',
        // Discord-specific fields
        discordId: user.user_metadata?.provider_id || null,
        discordHandle: discordHandle || null,
        discordAvatarUrl: user.user_metadata?.avatar_url || null,
        // Keep existing XP values - merge service will handle XP updates
        streakWeeks: 0,
        missedReviews: 0
      }

      // Upsert user profile
      const { error: upsertError } = await supabase
        .from('User')
        .upsert(userData, {
          onConflict: 'id',
          ignoreDuplicates: false
        })

      if (upsertError) {
        // Check if it's a duplicate key error (user already exists) - ignore these
        if (upsertError.code === '23505' || upsertError.message?.includes('duplicate') || upsertError.message?.includes('conflict')) {
          // console.log('User already exists, continuing with existing profile')
        } else {
          console.error('Error upserting user profile:', upsertError)
          // Remove processing flag on error
          if (typeof window !== 'undefined') {
            window.sessionStorage.removeItem(cacheKey)
          }
          return
        }
      } else {
        // console.log('User profile created/updated successfully')
      }

      // Initiate legacy account merge using API call
      if (discordHandle) {
        // console.log('🔄 Initiating legacy account merge...')

        try {
          // Call the merge API endpoint
          const response = await fetch('/api/merge/initiate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
            },
            body: JSON.stringify({
              realUserId: user.id,
              discordHandle: discordHandle,
              discordId: user.user_metadata?.provider_id,
              email: user.email!,
              initiatedBy: 'SYSTEM'
            })
          })

          if (response.ok) {
            const mergeResult = await response.json()

            if (mergeResult.success) {
              if (mergeResult.status === 'COMPLETED') {
                // console.log('✅ Legacy account merge completed successfully')
                // console.log(`   Transactions transferred: ${mergeResult.details?.transactionsTransferred || 0}`)
                // console.log(`   Total XP transferred: ${mergeResult.details?.totalXpTransferred || 0}`)
                // console.log(`   Processing time: ${mergeResult.details?.processingTimeMs || 0}ms`)
              } else if (mergeResult.status === 'NO_LEGACY_ACCOUNT') {
                // console.log('ℹ️ No legacy account found for this user')
              } else if (mergeResult.status === 'ALREADY_COMPLETED') {
                // console.log('ℹ️ Legacy account merge was already completed')
              }
            } else {
              console.error('❌ Legacy account merge failed:', mergeResult.message)
              if (mergeResult.error) {
                console.error('   Error details:', mergeResult.error)
              }
              // Don't fail the entire auth process if merge fails
              // User can still use the app, merge can be retried later
            }
          } else {
            console.error('❌ Merge API call failed:', response.status, response.statusText)
            // Don't fail the entire auth process if merge fails
          }
        } catch (mergeError) {
          console.error('❌ Error during legacy account merge:', mergeError)
          // Don't fail the entire auth process if merge fails
        }
      } else {
        // console.log('No Discord handle found in metadata, skipping legacy account merge')
      }

      // Cache successful operation and refresh profile
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(cacheKey, 'completed')
      }

      // Small delay to ensure database changes are committed
      await new Promise(resolve => setTimeout(resolve, 500))

      // Refresh the user profile to get the latest data including role and XP
      await fetchUserProfile(user.id)

      // Also clear any cached profile data to ensure fresh data is loaded
      if (typeof window !== 'undefined') {
        // Clear profile cache to force refresh of complete profile data
        const profileCacheKey = `profile-${user.id}`
        localStorage.removeItem(profileCacheKey)
        sessionStorage.removeItem(profileCacheKey)

        // Also clear any other related cache keys
        Object.keys(localStorage).forEach(key => {
          if (key.includes(user.id) || key.includes('profile') || key.includes('dashboard')) {
            localStorage.removeItem(key)
          }
        })
      }

      // console.log('✅ User profile creation and merge process completed')


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

      await syncSessionCookies(null)

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
