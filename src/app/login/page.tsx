'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { usePrivyAuth } from '@/hooks/usePrivyAuth'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { LoginButton } from '@/components/Auth/LoginButton'
import { Zap } from 'lucide-react'

export default function LoginPage() {
  const { isAuthenticated, isLoading: privyLoading } = usePrivyAuth()
  const { user, isLoading: syncLoading, syncError } = usePrivyAuthSync()
  const router = useRouter()
  const hasRedirected = useRef(false)

  useEffect(() => {
    // console.log('Login page state:', { isAuthenticated, privyLoading, syncLoading, hasUser: !!user, hasRedirected: hasRedirected.current })
    
    // Redirect to dashboard once authenticated AND synced (only once)
    if (isAuthenticated && !privyLoading && !syncLoading && user && !hasRedirected.current) {
      // console.log('Redirecting to dashboard...')
      hasRedirected.current = true
      // Use window.location.assign for guaranteed navigation
      window.location.assign('/dashboard')
    }
  }, [isAuthenticated, privyLoading, syncLoading, user])

  if (privyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Show sync error if it occurred
  if (isAuthenticated && syncError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-4">
          <div className="text-red-500 mb-4">
            <Zap className="h-12 w-12 mx-auto" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Sync Failed</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {syncError.message || 'Failed to sync your account. Please try again.'}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (isAuthenticated && (syncLoading || !user)) {
    // Show loading while syncing
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Syncing your account...</p>
        </div>
      </div>
    )
  }

  if (isAuthenticated && user) {
    // Show loading while redirecting
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/50 to-muted py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 text-center">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg">
            <Zap className="h-8 w-8 text-primary-foreground" />
          </div>
        </div>
        
        {/* Title */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Welcome to ScholarXP
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with Discord to start earning XP
          </p>
        </div>
        
        {/* Login Button */}
        <div className="mt-8">
          <LoginButton 
            variant="default" 
            size="lg" 
            className="w-full max-w-xs mx-auto text-lg py-6"
          />
        </div>
        
        {/* Info */}
        <p className="text-xs text-muted-foreground mt-4">
          By signing in, you&apos;ll automatically get a Movement wallet for voting
        </p>
      </div>
    </div>
  )
}
