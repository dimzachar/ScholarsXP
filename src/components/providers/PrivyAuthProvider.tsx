'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { useTheme } from 'next-themes'

interface PrivyAuthProviderProps {
  children: React.ReactNode
}

export function PrivyAuthProvider({ children }: PrivyAuthProviderProps) {
  const { resolvedTheme } = useTheme()

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID

  if (!appId) {
    console.error('NEXT_PUBLIC_PRIVY_APP_ID is not configured')
    return <>{children}</>
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['discord'],
        appearance: {
          theme: resolvedTheme === 'dark' ? 'dark' : 'light',
          accentColor: '#7C3AED',
          showWalletLoginFirst: false,
        },
        // We handle wallet creation manually in onComplete callback
        // to ensure sync with Supabase happens atomically
      }}
    >
      {children}
    </PrivyProvider>
  )
}

export default PrivyAuthProvider
