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
        console.log('⚠️ AuthProvider: Emergency timeout triggered - auth flow took longer than expected')
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

  useEffect(() => {
    let mounted = true

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {

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
    // Prevent multiple calls for the same user using a robust cache
    const cacheKey = `user_created_${user.id}`
    const mergeCacheKey = `merge_completed_${user.id}`

    if (typeof window !== 'undefined') {
      const existingCache = window.sessionStorage.getItem(cacheKey)
      const mergeCompleted = window.sessionStorage.getItem(mergeCacheKey)

      if (existingCache === 'completed' || mergeCompleted === 'true') {
        console.log('User profile creation/merge already completed, skipping')
        return
      }

      if (existingCache === 'processing') {
        console.log('User profile creation already in progress, skipping')
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

      console.log('Discord metadata:', {
        username: user.user_metadata?.username,
        global_name: user.user_metadata?.global_name,
        name: user.user_metadata?.name,
        preferred_username: user.user_metadata?.preferred_username,
        full_name: user.user_metadata?.full_name,
        selected_handle: discordHandle
      })

      // Check if there's an existing legacy account with this Discord handle
      let existingLegacyUser = null
      if (discordHandle) {
        // Extract base handle without discriminator (e.g., "raki5629#0" -> "raki5629")
        const baseHandle = discordHandle.split('#')[0]

        try {
          // First try exact match with full Discord handle
          const { data: legacyUser, error: legacyError } = await supabase
            .from('User')
            .select('*')
            .eq('discordHandle', discordHandle)
            .eq('email', `${discordHandle}@legacy.import`)
            .maybeSingle()

          if (!legacyError && legacyUser) {
            existingLegacyUser = legacyUser
            console.log(`Legacy account lookup for ${discordHandle}: FOUND (exact match)`)
          } else {
            // Try with base handle (without discriminator)
            const { data: legacyUserBase, error: baseError } = await supabase
              .from('User')
              .select('*')
              .eq('discordHandle', baseHandle)
              .eq('email', `${baseHandle}@legacy.import`)
              .maybeSingle()

            if (!baseError && legacyUserBase) {
              existingLegacyUser = legacyUserBase
              console.log(`Legacy account lookup for ${discordHandle}: FOUND (base handle match: ${baseHandle})`)
            } else {
              console.log(`Legacy account lookup for ${discordHandle}: NOT FOUND`)
            }
          }
        } catch (error) {
          console.log(`Legacy account lookup failed for ${discordHandle}:`, error)
          // Continue without legacy account
        }
      }

      // Fallback: If no legacy account found by discordHandle, try by username
      if (!existingLegacyUser && discordHandle) {
        const baseHandle = discordHandle.split('#')[0]
        try {
          const { data: legacyUserByUsername, error: usernameError } = await supabase
            .from('User')
            .select('*')
            .eq('username', baseHandle)
            .ilike('email', '%@legacy.import')
            .maybeSingle()

          if (!usernameError && legacyUserByUsername) {
            existingLegacyUser = legacyUserByUsername
            console.log(`Legacy account found by username fallback for ${baseHandle}`)
          }
        } catch (error) {
          console.log(`Legacy username lookup failed for ${baseHandle}:`, error)
          // Continue without legacy account
        }
      }

      if (!discordHandle) {
        console.log('No Discord handle found in metadata, skipping legacy account lookup')
      }

      // Use upsert to avoid 409 conflicts - insert if new, update if exists
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
        // Only reset XP to 0 if there's a legacy account to merge
        // Otherwise preserve existing XP to prevent regression
        ...(existingLegacyUser ? {
          // Start with 0 XP - will be recalculated from transferred transactions
          // DO NOT copy totalXp from legacy account to avoid duplicate XP
          totalXp: 0,
          currentWeekXp: 0,
        } : {}),
        streakWeeks: existingLegacyUser?.streakWeeks || 0,
        missedReviews: existingLegacyUser?.missedReviews || 0
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

        // If we merged a legacy account, transfer all associated data and clean it up
        if (existingLegacyUser && discordHandle) {
          console.log(`Merging legacy account data for ${discordHandle}`)

          try {
            // Get legacy XP transactions to transfer with proper type mapping
            const { data: legacyTransactions, error: fetchError } = await supabase
              .from('XpTransaction')
              .select('*')
              .eq('userId', existingLegacyUser.id)

            if (fetchError) {
              console.error('Error fetching legacy transactions:', fetchError)
            } else if (legacyTransactions && legacyTransactions.length > 0) {
              console.log(`Found ${legacyTransactions.length} legacy transactions to transfer`)

              // Check if transactions have already been transferred to prevent duplicates
              const { data: existingTransactions } = await supabase
                .from('XpTransaction')
                .select('description')
                .eq('userId', user.id)
                .ilike('description', '%Legacy transfer:%')

              const existingDescriptions = new Set(existingTransactions?.map(t => t.description) || [])

              // Transfer each transaction with proper type mapping (skip duplicates)
              let transferredCount = 0
              for (const transaction of legacyTransactions) {
                const newDescription = transaction.description.replace('Legacy import:', 'Legacy transfer:')

                // Skip if this transaction was already transferred
                if (existingDescriptions.has(newDescription)) {
                  console.log(`Skipping duplicate transaction: ${newDescription}`)
                  continue
                }

                // Keep SUBMISSION_REWARD type for legacy transactions (already correct)
                const newType = transaction.type

                // Create new transaction for real user with corrected type
                const { error: createError } = await supabase
                  .from('XpTransaction')
                  .insert({
                    userId: user.id,
                    amount: transaction.amount,
                    type: newType,
                    description: newDescription,
                    sourceId: transaction.sourceId,
                    weekNumber: transaction.weekNumber,
                    createdAt: transaction.createdAt
                  })

                if (createError) {
                  console.error('Error creating transferred transaction:', createError)
                } else {
                  transferredCount++
                }
              }

              console.log(`✅ Transferred ${transferredCount} new transactions (${legacyTransactions.length - transferredCount} duplicates skipped)`)

              // Delete the original legacy transactions to allow account cleanup
              if (transferredCount > 0) {
                console.log('Cleaning up original legacy transactions...')
                const { error: deleteTransactionsError } = await supabase
                  .from('XpTransaction')
                  .delete()
                  .eq('userId', existingLegacyUser.id)

                if (deleteTransactionsError) {
                  console.error('Error deleting legacy transactions:', deleteTransactionsError)
                } else {
                  console.log('✅ Legacy transactions cleaned up')
                }
              }

              // Delete original legacy transactions
              const { error: deleteError } = await supabase
                .from('XpTransaction')
                .delete()
                .eq('userId', existingLegacyUser.id)

              if (deleteError) {
                console.error('Error deleting legacy transactions:', deleteError)
              } else {
                console.log('✅ Transferred and converted XP transactions with proper types')
              }
            }

            // Transfer WeeklyStats from legacy account to real account
            const { error: weeklyStatsError } = await supabase
              .from('WeeklyStats')
              .update({ userId: user.id })
              .eq('userId', existingLegacyUser.id)

            if (weeklyStatsError) {
              console.error('Error transferring WeeklyStats:', weeklyStatsError)
            } else {
              console.log('✅ Transferred WeeklyStats')
            }

            // Note: LegacySubmissions are linked by discordHandle, so they don't need transfer

            // Only recalculate totalXp if we actually transferred transactions
            if (transferredCount > 0) {
              console.log('Recalculating totalXp from transferred transactions...')

              // Recalculate totalXp from transferred transactions to avoid duplicate XP
              const { data: userTransactions } = await supabase
                .from('XpTransaction')
                .select('amount')
                .eq('userId', user.id)

              const calculatedTotalXp = userTransactions?.reduce((sum, tx) => sum + tx.amount, 0) || 0

              // Update user's totalXp with calculated value
              const { error: updateXpError } = await supabase
                .from('User')
                .update({ totalXp: calculatedTotalXp })
                .eq('id', user.id)

              if (updateXpError) {
                console.error('Error updating user totalXp:', updateXpError)
              } else {
                console.log(`✅ Recalculated totalXp: ${calculatedTotalXp} from ${userTransactions?.length || 0} transactions`)
              }
            } else {
              console.log('No transactions transferred, skipping XP recalculation')
            }

            // Now clean up the legacy account
            console.log(`Cleaning up legacy account for ${discordHandle}`)
            const { error: deleteError } = await supabase
              .from('User')
              .delete()
              .eq('id', existingLegacyUser.id)

            if (deleteError) {
              console.error('Error deleting legacy account:', deleteError)
              // Don't fail the entire process if cleanup fails
            } else {
              console.log('✅ Legacy account cleaned up successfully')
            }
          } catch (mergeError) {
            console.error('Error during account merge:', mergeError)
          }
        }
      }

      // Always cache successful operation and refresh profile
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(cacheKey, 'completed')
        if (existingLegacyUser) {
          window.sessionStorage.setItem(`merge_completed_${user.id}`, 'true')
        }
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

      console.log('✅ Account merge completed and profile refreshed')
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
