'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { usePrivy } from '@privy-io/react-auth'
// IMPORTANT: useCreateWallet must be imported from extended-chains for chainType support
import { useCreateWallet } from '@privy-io/react-auth/extended-chains'
import { setPrivyUserId, setPrivyAuthToken } from '@/lib/api-client'
import { ADMIN_ROLES, REVIEWER_ROLES } from '@/lib/roles'

export type UserRole = 'USER' | 'REVIEWER' | 'ADMIN' | 'DEVELOPER'

export interface SyncedUser {
  id: string
  privyUserId: string
  email: string | null
  username: string | null
  role: UserRole
  totalXp: number
  currentWeekXp: number
  streakWeeks: number
  missedReviews: number
  discordId: string | null
  discordHandle: string | null
  discordAvatarUrl: string | null
  movementWalletAddress: string | null
  walletLinkedAt: string | null
  createdAt: string
  updatedAt: string
}

interface PrivyAuthSyncContextType {
  // Synced user from Supabase
  user: SyncedUser | null
  
  // Sync state
  isSyncing: boolean
  lastSyncedAt: Date | null
  syncError: Error | null
  
  // Loading state
  isLoading: boolean
  
  // Actions
  syncUserToSupabase: (walletAddress?: string) => Promise<void>
  refreshUser: () => Promise<void>
  
  // Role helpers
  hasRole: (role: UserRole) => boolean
  isAdmin: boolean
  isReviewer: boolean
}

const PrivyAuthSyncContext = createContext<PrivyAuthSyncContextType | undefined>(undefined)


export function usePrivyAuthSync() {
  const context = useContext(PrivyAuthSyncContext)
  if (context === undefined) {
    throw new Error('usePrivyAuthSync must be used within a PrivyAuthSyncProvider')
  }
  return context
}

interface PrivyAuthSyncProviderProps {
  children: React.ReactNode
}

// Exponential backoff delays in ms
const RETRY_DELAYS = [1000, 2000, 4000]
const MAX_RETRIES = 3

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function PrivyAuthSyncProvider({ children }: PrivyAuthSyncProviderProps) {
  const { ready, authenticated, user: privyUser, getAccessToken } = usePrivy()
  const { createWallet: privyCreateWallet } = useCreateWallet()
  
  const [user, setUser] = useState<SyncedUser | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null)
  const [syncError, setSyncError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  const syncInProgressRef = useRef(false)
  const lastSyncedUserIdRef = useRef<string | null>(null)
  const walletCreationAttemptedRef = useRef<Set<string>>(new Set())

  // Sync user data to Supabase with retry logic
  const syncUserToSupabase = useCallback(async (walletAddress?: string) => {
    // console.log('syncUserToSupabase called:', { hasPrivyUser: !!privyUser, syncInProgress: syncInProgressRef.current })
    
    if (!privyUser) {
      // console.log('No privy user, skipping sync')
      return
    }
    
    if (syncInProgressRef.current) {
      // console.log('Sync already in progress, skipping')
      return
    }
    
    syncInProgressRef.current = true
    setIsSyncing(true)
    setSyncError(null)
    
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Extract Discord info from Privy user
        const discordAccount = privyUser.linkedAccounts?.find(
          (account) => account.type === 'discord_oauth'
        )
        
        // Debug: Log the full Discord account object to see available fields
        // console.log('Discord account from Privy:', JSON.stringify(discordAccount, null, 2))
        
        // Extract wallet address from Privy if not provided
        const aptosWallet = privyUser.linkedAccounts?.find(
          (account) => account.type === 'wallet' && 
            'chainType' in account && 
            account.chainType === 'aptos'
        )
        const finalWalletAddress = walletAddress || (aptosWallet && 'address' in aptosWallet ? aptosWallet.address : null)
        
        // Extract email - prefer Privy email, then Discord email from linked account
        const discordEmail = discordAccount && 'email' in discordAccount ? (discordAccount.email as string | null) : null
        const userEmail = privyUser.email?.address || discordEmail || null
        
        const response = await fetch('/api/auth/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            privyUserId: privyUser.id,
            discordUsername: discordAccount && 'username' in discordAccount ? discordAccount.username : null,
            discordId: discordAccount && 'subject' in discordAccount ? discordAccount.subject : null,
            movementWalletAddress: finalWalletAddress,
            email: userEmail,
          }),
        })
        
        // console.log('Sync response status:', response.status)
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          
          // Silently handle database outages - don't throw, just log and continue
          if (response.status === 503 || response.status === 500) {
            console.warn('Database temporarily unavailable, continuing with limited functionality')
            syncInProgressRef.current = false
            setIsSyncing(false)
            setIsLoading(false)
            setSyncError(new Error('Database temporarily unavailable'))
            return
          }
          
          throw new Error(errorData.error || `Sync failed: ${response.status}`)
        }
        
        const data = await response.json()
        // console.log('Sync response data:', data)
        // console.log('Setting user to:', data.user)
        
        setUser(data.user)
        setLastSyncedAt(new Date())
        lastSyncedUserIdRef.current = privyUser.id
        
        // Set Privy user ID in API client for authenticated requests
        setPrivyUserId(privyUser.id)
        
        // Get and set the Privy auth token for secure API calls
        try {
          const authToken = await getAccessToken()
          setPrivyAuthToken(authToken)
        } catch (tokenError) {
          console.warn('Failed to get Privy auth token:', tokenError)
          // Continue without token - server will fall back to header verification in dev
        }
        
        syncInProgressRef.current = false
        setIsSyncing(false)
        setIsLoading(false)
        return
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown sync error')
        console.error(`Sync attempt ${attempt + 1} failed:`, lastError)
        
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAYS[attempt])
        }
      }
    }
    
    // All retries failed
    setSyncError(lastError)
    syncInProgressRef.current = false
    setIsSyncing(false)
    setIsLoading(false)
  }, [privyUser])


  // Refresh user data from Supabase
  const refreshUser = useCallback(async () => {
    if (!privyUser) return
    
    try {
      // Add cache-busting timestamp to ensure fresh data
      const response = await fetch(`/api/user/me?privyUserId=${encodeURIComponent(privyUser.id)}&_t=${Date.now()}`)
      
      if (response.ok) {
        const data = await response.json()
        if (data.user) {
          // console.log('refreshUser: updated user data:', data.user.movementWalletAddress)
          setUser(data.user)
        }
      }
    } catch (error) {
      console.error('Failed to refresh user:', error)
    }
  }, [privyUser])

  // Auto-sync when Privy user changes
  useEffect(() => {
    if (!ready) {
      setIsLoading(true)
      return
    }
    
    if (!authenticated || !privyUser) {
      setUser(null)
      setIsLoading(false)
      lastSyncedUserIdRef.current = null
      // Clear Privy credentials from API client on logout
      setPrivyUserId(null)
      setPrivyAuthToken(null)
      return
    }
    
    // Only sync if user changed and not already syncing
    if (lastSyncedUserIdRef.current !== privyUser.id && !syncInProgressRef.current) {
      // Keep isLoading true - syncUserToSupabase will set it false when done
      syncUserToSupabase()
    } else if (lastSyncedUserIdRef.current === privyUser.id) {
      // User already synced, just set loading to false
      setIsLoading(false)
    }
    // If sync is in progress, don't change isLoading - let the sync complete
  }, [ready, authenticated, privyUser, syncUserToSupabase])

  // Auto-create Aptos wallet if user doesn't have one (fallback for returning sessions)
  useEffect(() => {
    if (!ready || !authenticated || !privyUser) return
    
    // Skip if already attempted for this user
    if (walletCreationAttemptedRef.current.has(privyUser.id)) return
    
    const hasAptosWallet = privyUser.linkedAccounts?.some(
      (account) => account.type === 'wallet' && 
        'chainType' in account && 
        (account as { chainType?: string }).chainType === 'aptos'
    )
    
    if (hasAptosWallet) return
    
    // Mark as attempted
    walletCreationAttemptedRef.current.add(privyUser.id)
    
    const createAptosWallet = async () => {
      try {
        console.log('Creating Movement wallet for user (fallback)...')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wallet = await (privyCreateWallet as any)({ chainType: 'aptos' })
        console.log('Movement wallet created:', (wallet as { address?: string })?.address)
        // Re-sync to pick up the new wallet
        setTimeout(() => syncUserToSupabase(), 1000)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (!msg.includes('already has an embedded wallet')) {
          console.error('Failed to create Movement wallet:', error)
        }
      }
    }
    
    createAptosWallet()
  }, [ready, authenticated, privyUser, privyCreateWallet, syncUserToSupabase])

  // Role helper functions
  const hasRole = useCallback((role: UserRole): boolean => {
    return user?.role === role
  }, [user?.role])

  const isAdmin = user?.role ? ADMIN_ROLES.includes(user.role) : false
  const isReviewer = user?.role ? REVIEWER_ROLES.includes(user.role) : false

  const value: PrivyAuthSyncContextType = {
    user,
    isSyncing,
    lastSyncedAt,
    syncError,
    isLoading: isLoading || !ready,
    syncUserToSupabase,
    refreshUser,
    hasRole,
    isAdmin,
    isReviewer,
  }

  return (
    <PrivyAuthSyncContext.Provider value={value}>
      {children}
    </PrivyAuthSyncContext.Provider>
  )
}

export default PrivyAuthSyncProvider
