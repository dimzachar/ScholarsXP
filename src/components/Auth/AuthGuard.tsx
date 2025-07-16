'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

interface AuthGuardProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export default function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    // Simple redirect logic - only redirect if definitely not authenticated
    if (!loading && !user) {
      router.replace('/login')
    }
  }, [user, loading, router])

  // Show loading state while checking authentication
  if (loading) {
    return (
      fallback || (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
            <p className="text-xs text-muted-foreground">Loading...</p>
          </div>
        </div>
      )
    )
  }

  // If no user, return null (redirect will happen)
  if (!user) {
    return null
  }

  // User is authenticated, show children
  return <>{children}</>
}
