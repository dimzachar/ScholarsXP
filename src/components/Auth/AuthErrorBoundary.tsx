'use client'

import React from 'react'

interface AuthErrorBoundaryState {
  hasError: boolean
  error?: Error
}

interface AuthErrorBoundaryProps {
  children: React.ReactNode
}

export default class AuthErrorBoundary extends React.Component<
  AuthErrorBoundaryProps,
  AuthErrorBoundaryState
> {
  constructor(props: AuthErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): AuthErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Auth Error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground mb-4">
                Authentication Error
              </h2>
              <p className="text-muted-foreground mb-6">
                There was an issue with authentication. This might be due to:
              </p>
              <ul className="text-left text-sm text-muted-foreground mb-6 space-y-2">
                <li>• Clock synchronization issues</li>
                <li>• Network connectivity problems</li>
                <li>• Supabase configuration issues</li>
              </ul>
              <button
                onClick={() => {
                  // Clear any stored auth data and reload
                  localStorage.clear()
                  sessionStorage.clear()
                  window.location.reload()
                }}
                className="w-full bg-primary text-primary-foreground py-2 px-4 rounded-md hover:bg-primary/90 transition-colors"
              >
                Clear Cache & Retry
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
