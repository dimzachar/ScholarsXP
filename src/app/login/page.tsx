'use client'

import { useEffect, useRef } from 'react'
import { usePrivyAuth } from '@/hooks/usePrivyAuth'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { LoginScreen } from '@/components/Auth/LoginScreen'
import { Zap } from 'lucide-react'

export default function LoginPage() {
  const { isAuthenticated, isLoading: privyLoading } = usePrivyAuth()
  const { user, isLoading: syncLoading, syncError } = usePrivyAuthSync()
  const hasRedirected = useRef(false)

  useEffect(() => {
    // Redirect to dashboard once authenticated AND synced (only once)
    if (isAuthenticated && !privyLoading && !syncLoading && user && !hasRedirected.current) {
      hasRedirected.current = true
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  return <LoginScreen />
}
