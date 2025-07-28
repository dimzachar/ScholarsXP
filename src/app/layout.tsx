// Temporarily disabled simple log filter for debugging
// import '@/lib/simple-log-filter'
import type { Metadata } from 'next'
import { Oxanium } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import AuthErrorBoundary from '@/components/Auth/AuthErrorBoundary'
import ConditionalLayout from '@/components/ConditionalLayout'
import { ThemeProvider } from '@/components/theme-provider'
// import { PerformanceMonitorProvider } from '@/components/PerformanceMonitorProvider'
import { Toaster } from 'sonner'

const oxanium = Oxanium({
  subsets: ['latin'],
  variable: '--font-oxanium',
})

export const metadata: Metadata = {
  title: 'ScholarXP Evaluation System',
  description: 'Submit your content and earn XP through AI evaluation and peer review',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${oxanium.variable} font-sans`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthErrorBoundary>
            <AuthProvider>
              <ConditionalLayout>
                {children}
              </ConditionalLayout>
              <Toaster />
            </AuthProvider>
          </AuthErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  )
}

