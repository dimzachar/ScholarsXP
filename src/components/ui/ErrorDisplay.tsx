/**
 * ErrorDisplay Component - Consistent Error UI
 * 
 * Part of the API Error Handling Standardization Initiative
 * 
 * Provides consistent error display across the application with:
 * - Structured error information
 * - Request ID display for debugging
 * - User-friendly error messages
 * - Action buttons for error recovery
 */

import React from 'react'
import { AlertCircle, RefreshCw, Copy, Bug } from 'lucide-react'
import { ErrorState } from '@/hooks/useApiError'
import { getErrorMessageByCode } from '@/hooks/useApiError'

interface ErrorDisplayProps {
  error: ErrorState | null
  onRetry?: () => void
  onClear?: () => void
  onReport?: () => void
  showDetails?: boolean
  className?: string
  variant?: 'default' | 'compact' | 'inline'
}

export function ErrorDisplay({
  error,
  onRetry,
  onClear,
  onReport,
  showDetails = false,
  className = '',
  variant = 'default'
}: ErrorDisplayProps) {
  if (!error) return null

  const copyRequestId = () => {
    if (error.requestId) {
      navigator.clipboard.writeText(error.requestId)
      // TODO: Show toast notification
      console.log('Request ID copied to clipboard:', error.requestId)
    }
  }

  const copyErrorDetails = () => {
    const errorDetails = {
      message: error.message,
      code: error.code,
      requestId: error.requestId,
      timestamp: error.timestamp,
      details: error.details
    }
    navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2))
    // TODO: Show toast notification
    console.log('Error details copied to clipboard')
  }

  if (variant === 'inline') {
    return (
      <div className={`flex items-center gap-2 text-sm text-red-600 ${className}`}>
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <span>{error.message}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-red-600 hover:text-red-800 underline"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-md p-3 ${className}`}>
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-800">{error.message}</p>
            {error.code && (
              <p className="text-xs text-red-600 mt-1">Error Code: {error.code}</p>
            )}
          </div>
          <div className="flex gap-1">
            {onRetry && (
              <button
                onClick={onRetry}
                className="text-red-600 hover:text-red-800 p-1"
                title="Retry"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}
            {onClear && (
              <button
                onClick={onClear}
                className="text-red-600 hover:text-red-800 p-1"
                title="Dismiss"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Default variant
  return (
    <div className={`bg-red-50 border border-red-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <AlertCircle className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-medium text-red-800 mb-2">
            Something went wrong
          </h3>
          <p className="text-sm text-red-700 mb-3">
            {error.message}
          </p>

          {error.code && (
            <div className="mb-3">
              <p className="text-xs font-medium text-red-600 mb-1">Error Code:</p>
              <code className="text-xs bg-red-100 px-2 py-1 rounded text-red-800">
                {error.code}
              </code>
            </div>
          )}

          {error.requestId && (
            <div className="mb-3">
              <p className="text-xs font-medium text-red-600 mb-1">Request ID:</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-red-100 px-2 py-1 rounded text-red-800 flex-1">
                  {error.requestId}
                </code>
                <button
                  onClick={copyRequestId}
                  className="text-red-600 hover:text-red-800 p-1"
                  title="Copy Request ID"
                >
                  <Copy className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          {showDetails && error.details && (
            <div className="mb-3">
              <p className="text-xs font-medium text-red-600 mb-1">Details:</p>
              <pre className="text-xs bg-red-100 p-2 rounded text-red-800 overflow-auto max-h-32">
                {JSON.stringify(error.details, null, 2)}
              </pre>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            {onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </button>
            )}

            {onReport && (
              <button
                onClick={onReport}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
              >
                <Bug className="h-4 w-4" />
                Report Issue
              </button>
            )}

            {(error.requestId || error.details) && (
              <button
                onClick={copyErrorDetails}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
              >
                <Copy className="h-4 w-4" />
                Copy Details
              </button>
            )}

            {onClear && (
              <button
                onClick={onClear}
                className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Specialized error displays for common scenarios
export function ValidationErrorDisplay({ 
  error, 
  onRetry, 
  className = '' 
}: Pick<ErrorDisplayProps, 'error' | 'onRetry' | 'className'>) {
  if (!error || !error.code?.includes('INVALID') && !error.code?.includes('MISSING')) {
    return null
  }

  return (
    <ErrorDisplay
      error={error}
      onRetry={onRetry}
      variant="compact"
      className={className}
    />
  )
}

export function NetworkErrorDisplay({ 
  error, 
  onRetry, 
  className = '' 
}: Pick<ErrorDisplayProps, 'error' | 'onRetry' | 'className'>) {
  if (!error || (!error.code?.includes('NETWORK') && !error.code?.includes('SERVER'))) {
    return null
  }

  return (
    <ErrorDisplay
      error={error}
      onRetry={onRetry}
      className={className}
    />
  )
}

export function AuthErrorDisplay({ 
  error, 
  className = '' 
}: Pick<ErrorDisplayProps, 'error' | 'className'>) {
  if (!error || (!error.code?.includes('UNAUTHORIZED') && !error.code?.includes('FORBIDDEN'))) {
    return null
  }

  const handleSignIn = () => {
    // TODO: Redirect to sign in page or trigger auth modal
    window.location.href = '/auth/signin'
  }

  return (
    <div className={`bg-yellow-50 border border-yellow-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <AlertCircle className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="text-lg font-medium text-yellow-800 mb-2">
            Authentication Required
          </h3>
          <p className="text-sm text-yellow-700 mb-3">
            {error.message}
          </p>
          <button
            onClick={handleSignIn}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  )
}
