'use client'

import { usePrivyAuth } from '@/hooks/usePrivyAuth'
import { LoginButton } from '@/components/Auth/LoginButton'
import { Zap } from 'lucide-react'

interface LoginScreenProps {
  title?: string
  subtitle?: string
}

/**
 * Reusable login screen component matching the /login page design.
 * Can be embedded in any page that requires authentication.
 */
export function LoginScreen({ 
  title = 'Welcome to ScholarXP',
  subtitle = 'Sign in with Discord to start earning XP'
}: LoginScreenProps) {
  const { isLoading: privyLoading } = usePrivyAuth()

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
            {title}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {subtitle}
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

export default LoginScreen
