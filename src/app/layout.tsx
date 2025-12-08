// Temporarily disabled simple log filter for debugging
// import '@/lib/simple-log-filter'
import type { Metadata } from 'next'
import { Oxanium } from 'next/font/google'
import './globals.css'
import AuthErrorBoundary from '@/components/Auth/AuthErrorBoundary'
import ConditionalLayout from '@/components/ConditionalLayout'
import { ThemeProvider } from '@/components/theme-provider'
import { PrivyAuthProvider } from '@/components/providers/PrivyAuthProvider'
// import { PerformanceMonitorProvider } from '@/components/PerformanceMonitorProvider'
import { Toaster } from 'sonner'
import { Analytics } from '@vercel/analytics/next';
import { WalletProvider } from '@/lib/wallet-provider'
import { WalletSyncProvider } from '@/contexts/WalletSyncContext'
import { PrivyAuthSyncProvider } from '@/contexts/PrivyAuthSyncContext'

const oxanium = Oxanium({
  subsets: ['latin'],
  variable: '--font-oxanium',
})

export const metadata: Metadata = {
  title: 'ScholarXP Evaluation System',
  description: 'Submit your content and earn XP through peer review',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

import CustomCursor from '@/components/ui/CustomCursor'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://cdn.discordapp.com" />
      </head>
      <body suppressHydrationWarning className={`${oxanium.variable} font-sans`}>
        <CustomCursor />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PrivyAuthProvider>
            <PrivyAuthSyncProvider>
              <WalletProvider>
                <AuthErrorBoundary>
                  <WalletSyncProvider>
                    <ConditionalLayout>
                      {children}
                    </ConditionalLayout>
                    <Toaster />
                  </WalletSyncProvider>
                </AuthErrorBoundary>
              </WalletProvider>
            </PrivyAuthSyncProvider>
          </PrivyAuthProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}

