'use client'

import { useAuth } from '@/contexts/AuthContext'
import Navigation from '@/components/Navigation'

interface ConditionalLayoutProps {
  children: React.ReactNode
}

export default function ConditionalLayout({ children }: ConditionalLayoutProps) {
  const { user, loading } = useAuth()

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // For authenticated users, show navigation + content
  if (user) {
    return (
      <>
        <Navigation />
        {/* Add bottom padding for mobile bottom nav (shows below xl breakpoint) */}
        <div className="pb-20 xl:pb-0">
          {children}
        </div>
      </>
    )
  }

  // For unauthenticated users, show content without navigation
  // The individual pages will handle what to show (landing page vs login)
  return <>{children}</>
}
