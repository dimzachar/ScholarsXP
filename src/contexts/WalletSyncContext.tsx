'use client'

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { useWallet } from '@aptos-labs/wallet-adapter-react'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { supabase } from '@/lib/supabase-client'

interface WalletSyncContextType {
  // Wallet state (from Aptos Wallet Adapter)
  walletAddress: string | null
  walletName: string | null
  isConnected: boolean
  
  // Loading states
  isLoading: boolean
  isSyncing: boolean
  
  // Actions
  connectWallet: () => Promise<void>
  disconnectWallet: () => Promise<void>
  syncWalletToSupabase: () => Promise<void>
  
  // Status
  hasLinkedWallet: boolean
  needsWalletLink: boolean
  
  // Error state
  error: string | null
}

const WalletSyncContext = createContext<WalletSyncContextType | undefined>(undefined)

export function useWalletSync() {
  const context = useContext(WalletSyncContext)
  if (context === undefined) {
    throw new Error('useWalletSync must be used within a WalletSyncProvider')
  }
  return context
}

interface WalletSyncProviderProps {
  children: ReactNode
}


export function WalletSyncProvider({ children }: WalletSyncProviderProps) {
  const { connected, account, wallet, connect, disconnect } = useWallet()
  const { user, refreshUser } = usePrivyAuthSync()
  
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkedWalletAddress, setLinkedWalletAddress] = useState<string | null>(null)

  // Derive wallet address from Aptos Wallet Adapter
  const walletAddress = account?.address?.toString() ?? null
  const walletName = wallet?.name ?? null
  const isConnected = connected && !!walletAddress

  // Check if user has a wallet linked in their profile
  const hasLinkedWallet = !!linkedWalletAddress
  const needsWalletLink = !!user && !hasLinkedWallet

  // Load linked wallet from user profile on mount
  useEffect(() => {
    const loadLinkedWallet = async () => {
      if (!user?.id) {
        setLinkedWalletAddress(null)
        setIsLoading(false)
        return
      }

      try {
        // Try to fetch the wallet address - this may fail if the column doesn't exist yet
        // (migration not applied). In that case, we silently continue without a linked wallet.
        const { data, error: fetchError } = await supabase
          .from('User')
          .select('movementWalletAddress')
          .eq('id', user.id)
          .single()

        if (fetchError) {
          // Check if error is due to missing column (migration not applied yet)
          const errorMsg = fetchError.message || ''
          if (errorMsg.includes('column') || errorMsg.includes('does not exist') || fetchError.code === '42703') {
            // Column doesn't exist yet - migration not applied, silently continue
            console.log('Wallet column not yet available - migration pending')
          } else {
            console.error('Error fetching linked wallet:', fetchError)
          }
        } else {
          setLinkedWalletAddress(data?.movementWalletAddress ?? null)
        }
      } catch (err) {
        console.error('Error loading linked wallet:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadLinkedWallet()
  }, [user?.id])

  // Connect wallet using Aptos Wallet Adapter
  const connectWallet = useCallback(async () => {
    setError(null)
    try {
      await connect(wallet?.name ?? 'Nightly')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to connect wallet'
      // Ignore user rejection errors
      if (!errorMsg.includes('rejected') && !errorMsg.includes('cancelled')) {
        setError(errorMsg)
      }
    }
  }, [connect, wallet?.name])

  // Disconnect wallet
  const disconnectWallet = useCallback(async () => {
    setError(null)
    try {
      await disconnect()
    } catch (err) {
      console.error('Error disconnecting wallet:', err)
    }
  }, [disconnect])


  // Sync connected wallet to Supabase user profile
  const syncWalletToSupabase = useCallback(async () => {
    if (!user?.id || !walletAddress) {
      setError('No user or wallet address to sync')
      return
    }

    setIsSyncing(true)
    setError(null)

    try {
      // Validate wallet address format (0x + 64 hex chars for Aptos/Movement)
      const isValidAddress = /^0x[a-fA-F0-9]{64}$/.test(walletAddress)
      if (!isValidAddress) {
        throw new Error('Invalid wallet address format')
      }

      // Check if wallet is already linked to another user
      const { data: existingUser, error: checkError } = await supabase
        .from('User')
        .select('id')
        .eq('movementWalletAddress', walletAddress)
        .neq('id', user.id)
        .single()

      // If column doesn't exist yet, skip the check
      if (checkError && !checkError.message?.includes('column') && checkError.code !== '42703' && checkError.code !== 'PGRST116') {
        // Only throw if it's not a "no rows" or "column missing" error
        if (existingUser) {
          throw new Error('This wallet is already linked to another account')
        }
      }

      // Update user profile with wallet address
      const { error: updateError } = await supabase
        .from('User')
        .update({
          movementWalletAddress: walletAddress,
          walletLinkedAt: new Date().toISOString()
        })
        .eq('id', user.id)

      if (updateError) {
        // Check if error is due to missing column
        if (updateError.message?.includes('column') || updateError.code === '42703') {
          throw new Error('Wallet feature not yet available. Database migration pending.')
        }
        throw new Error(updateError.message)
      }

      // Update local state
      setLinkedWalletAddress(walletAddress)
      
      // Refresh user profile to get updated data
      await refreshUser()

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to sync wallet'
      setError(errorMsg)
      console.error('Error syncing wallet to Supabase:', err)
    } finally {
      setIsSyncing(false)
    }
  }, [user?.id, walletAddress, refreshUser])

  const value: WalletSyncContextType = {
    walletAddress,
    walletName,
    isConnected,
    isLoading,
    isSyncing,
    connectWallet,
    disconnectWallet,
    syncWalletToSupabase,
    hasLinkedWallet,
    needsWalletLink,
    error
  }

  return (
    <WalletSyncContext.Provider value={value}>
      {children}
    </WalletSyncContext.Provider>
  )
}
