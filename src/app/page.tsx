'use client'

import React from 'react'
import { useAuth } from '@/contexts/AuthContext'
import LandingPage from '@/components/LandingPage'
import { Zap } from 'lucide-react'

export default function Home() {
  const { user, loading, signOut } = useAuth()

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading application...</p>
        </div>
      </div>
    )
  }

  // Show landing page for unauthenticated users
  if (!user) {
    return <LandingPage />
  }

  // Show redirect message for authenticated users
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center max-w-md mx-auto p-8">
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-full mb-4">
            <Zap className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome back!</h1>
          <p className="text-muted-foreground mb-6">
            You're signed in and ready to earn XP. Let's go to your dashboard!
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="w-full bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Go to Dashboard
          </button>
          <button
            onClick={signOut}
            className="w-full bg-secondary text-secondary-foreground px-6 py-2 rounded-lg text-sm hover:bg-secondary/90 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}

