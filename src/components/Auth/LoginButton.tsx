'use client'

import { usePrivyAuth } from '@/hooks/usePrivyAuth'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoginButtonProps {
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'sm' | 'default' | 'lg'
  className?: string
}

/**
 * Login button that triggers Privy authentication modal.
 * Shows loading state during authentication.
 */
export function LoginButton({ 
  variant = 'default', 
  size = 'default',
  className 
}: LoginButtonProps) {
  const { login, isLoading, isReady } = usePrivyAuth()

  const handleLogin = () => {
    if (!isReady || isLoading) return
    login()
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleLogin}
      disabled={!isReady || isLoading}
      className={cn('min-w-[100px]', className)}
    >
      {isLoading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading...
        </>
      ) : (
        'Sign In'
      )}
    </Button>
  )
}

export default LoginButton
