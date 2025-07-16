import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import AuthErrorBoundary from '@/components/Auth/AuthErrorBoundary'
import ConditionalLayout from '@/components/ConditionalLayout'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from 'sonner'
// Import console configuration to reduce log noise
import '@/lib/console-config'

export const metadata: Metadata = {
  title: 'ScholarXP Evaluation System',
  description: 'Submit your content and earn XP through AI evaluation and peer review',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
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

