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

  const isDark = resolvedTheme === 'dark'

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['discord'],
        appearance: {
          theme: isDark ? 'dark' : 'light',
          accentColor: '#E53935',
          showWalletLoginFirst: false,
        },
      }}
    >
      {children}
    </PrivyProvider>
  )
}

export default PrivyAuthProvider
