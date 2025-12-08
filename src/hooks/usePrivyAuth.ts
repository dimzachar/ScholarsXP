'use client'

import { useCallback, useMemo } from 'react'
import { 
  usePrivy, 
  useLogin as usePrivyLogin, 
  useLogout as usePrivyLogout,
  User as PrivyUser,
} from '@privy-io/react-auth'
// IMPORTANT: useCreateWallet must be imported from extended-chains for chainType support
import { useCreateWallet } from '@privy-io/react-auth/extended-chains'

export interface WalletInfo {
  address: string
  publicKey?: string
  chainType: 'aptos'
}

export interface UsePrivyAuthReturn {
  // Auth state
  isAuthenticated: boolean
  isLoading: boolean
  isReady: boolean
  user: PrivyUser | null
  
  // Wallet state
  walletAddress: string | null
  hasWallet: boolean
  
  // Actions
  login: () => void
  logout: () => Promise<void>
  createWallet: () => Promise<WalletInfo | null>
  
  // Raw Privy user for advanced use cases
  privyUser: PrivyUser | null
}

/**
 * Hook that wraps Privy authentication with wallet management.
 * Handles automatic wallet creation for new users in the onComplete callback.
 */
export function usePrivyAuth(): UsePrivyAuthReturn {
  const { ready, authenticated, user } = usePrivy()
  const { createWallet: privyCreateWallet } = useCreateWallet()
  const { logout: privyLogout } = usePrivyLogout()

  // Extract Aptos/Movement wallet from linked accounts
  // CRITICAL: Must filter by chainType === 'aptos' for Movement Network
  const aptosWallet = useMemo(() => {
    if (!user?.linkedAccounts) return null
    
    // Find Movement wallet (chainType: 'aptos')
    const wallet = user.linkedAccounts.find(
      (account): account is typeof account & { address: string } => 
        account.type === 'wallet' && 
        'chainType' in account && 
        account.chainType === 'aptos'
    )
    
    // Log warning if Ethereum wallets exist but no Movement wallet
    if (!wallet) {
      const ethereumWallets = user.linkedAccounts.filter(
        (account) => account.type === 'wallet' && 
          'chainType' in account && 
          (account as { chainType?: string }).chainType === 'ethereum'
      )
      if (ethereumWallets.length > 0) {
        console.warn(
          `Found ${ethereumWallets.length} Ethereum wallet(s) but no Movement wallet. ` +
          'User may need to create a Movement wallet.'
        )
      }
    }
    
    return wallet || null
  }, [user?.linkedAccounts])

  const walletAddress = aptosWallet?.address || null
  const hasWallet = !!walletAddress

  // Login handler - the actual login is triggered by calling this
  // The onComplete callback handles wallet creation
  const { login } = usePrivyLogin({
    onComplete: async ({ user, isNewUser }) => {
      console.log('Privy login complete:', { userId: user.id, isNewUser })
      
      // Check for existing Aptos/Movement wallet (MUST filter by chainType: 'aptos')
      const existingWallet = user.linkedAccounts?.find(
        (account) => account.type === 'wallet' && 
          'chainType' in account && 
          (account as { chainType?: string }).chainType === 'aptos'
      )
      
      if (existingWallet) {
        console.log('Existing Movement wallet found:', existingWallet)
        return
      }
      
      // Check if user has Ethereum wallet but no Aptos wallet - log warning
      const ethereumWallet = user.linkedAccounts?.find(
        (account) => account.type === 'wallet' && 
          'chainType' in account && 
          (account as { chainType?: string }).chainType === 'ethereum'
      )
      if (ethereumWallet) {
        console.warn('User has Ethereum wallet but no Movement wallet. Creating Movement wallet...')
      }
      
      // Create new Movement wallet for users without one
      // CRITICAL: Must specify chainType: 'aptos' for Movement Network
      if (isNewUser || !existingWallet) {
        try {
          console.log('Creating new Movement wallet with chainType: aptos...')
          const wallet = await privyCreateWallet({ chainType: 'aptos' })
          
          // Cast to any to access address property (Privy types don't expose it directly)
          const walletData = wallet as { address?: string; chainType?: string }
          
          // Verify wallet was created with correct chain type
          if (walletData && walletData.chainType !== 'aptos') {
            console.error('Wallet created with wrong chain type:', walletData.chainType)
          } else {
            console.log('Movement wallet created:', walletData?.address)
          }
        } catch (error) {
          // Check if error is "already has wallet" - this is fine, not an error
          const errorMessage = error instanceof Error ? error.message : String(error)
          if (errorMessage.includes('already has an embedded wallet')) {
            console.log('User already has an embedded wallet, skipping creation')
          } else {
            console.error('Failed to create Movement wallet:', error)
          }
          // Don't throw - user can retry from profile
        }
      }
    },
    onError: (error) => {
      console.error('Privy login error:', error)
    },
  })

  // Logout handler
  const logout = useCallback(async () => {
    try {
      await privyLogout()
      
      // Clear local storage
      if (typeof window !== 'undefined') {
        localStorage.clear()
        sessionStorage.clear()
      }
      
      // Redirect to home
      window.location.href = '/'
    } catch (error) {
      console.error('Logout error:', error)
      // Still redirect on error
      window.location.href = '/'
    }
  }, [privyLogout])

  // Manual wallet creation (for users who need to retry)
  // CRITICAL: Must specify chainType: 'aptos' for Movement Network
  const createWallet = useCallback(async (): Promise<WalletInfo | null> => {
    try {
      console.log('Creating Movement wallet with chainType: aptos...')
      const wallet = await privyCreateWallet({ chainType: 'aptos' })
      
      // Cast to any to access address property (Privy types don't expose it directly)
      const walletData = wallet as { address?: string; chainType?: string }
      
      if (walletData && walletData.address) {
        // Verify wallet was created with correct chain type
        if (walletData.chainType !== 'aptos') {
          console.error('Wallet created with wrong chain type:', walletData.chainType)
          throw new Error('Failed to create Movement wallet - wrong chain type')
        }
        
        console.log('Movement wallet created:', walletData.address)
        return {
          address: walletData.address,
          chainType: 'aptos',
        }
      }
      return null
    } catch (error) {
      console.error('Failed to create Movement wallet:', error)
      throw error
    }
  }, [privyCreateWallet])

  return {
    // Auth state
    isAuthenticated: authenticated,
    isLoading: !ready,
    isReady: ready,
    user,
    
    // Wallet state
    walletAddress,
    hasWallet,
    
    // Actions
    login,
    logout,
    createWallet,
    
    // Raw user
    privyUser: user,
  }
}

export default usePrivyAuth
