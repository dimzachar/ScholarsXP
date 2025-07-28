/**
 * useApiError Hook - Enhanced Error Handling for React Components
 * 
 * Part of the API Error Handling Standardization Initiative
 * 
 * Provides React components with enhanced error handling capabilities:
 * - Structured error information
 * - Request ID tracking for debugging
 * - User-friendly error messages
 * - Error reporting integration
 */

import { useState, useCallback } from 'react'
import { handleApiError, ApiError } from '@/lib/api-client'

export interface ErrorState {
  message: string
  code?: string
  details?: Record<string, any>
  requestId?: string
  timestamp: Date
}

export interface UseApiErrorReturn {
  error: ErrorState | null
  setError: (error: unknown) => void
  clearError: () => void
  isError: boolean
  getErrorMessage: () => string
  getErrorCode: () => string | undefined
  getRequestId: () => string | undefined
  reportError: () => void
}

/**
 * Hook for handling API errors in React components
 */
export function useApiError(): UseApiErrorReturn {
  const [error, setErrorState] = useState<ErrorState | null>(null)

  const setError = useCallback((error: unknown) => {
    const errorInfo = handleApiError(error)
    setErrorState({
      ...errorInfo,
      timestamp: new Date()
    })
  }, [])

  const clearError = useCallback(() => {
    setErrorState(null)
  }, [])

  const getErrorMessage = useCallback(() => {
    return error?.message || ''
  }, [error])

  const getErrorCode = useCallback(() => {
    return error?.code
  }, [error])

  const getRequestId = useCallback(() => {
    return error?.requestId
  }, [error])

  const reportError = useCallback(() => {
    if (!error) return

    // In a production app, this would send error reports to monitoring services
    console.error('Error Report:', {
      message: error.message,
      code: error.code,
      details: error.details,
      requestId: error.requestId,
      timestamp: error.timestamp,
      userAgent: navigator.userAgent,
      url: window.location.href
    })

    // TODO: Integrate with error reporting service (Sentry, LogRocket, etc.)
    // Example:
    // Sentry.captureException(new Error(error.message), {
    //   tags: {
    //     errorCode: error.code,
    //     requestId: error.requestId
    //   },
    //   extra: error.details
    // })
  }, [error])

  return {
    error,
    setError,
    clearError,
    isError: error !== null,
    getErrorMessage,
    getErrorCode,
    getRequestId,
    reportError
  }
}

/**
 * Hook for handling async operations with automatic error handling
 */
export function useAsyncOperation<T = any>() {
  const { error, setError, clearError } = useApiError()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<T | null>(null)

  const execute = useCallback(async (operation: () => Promise<T>) => {
    try {
      setLoading(true)
      clearError()
      const result = await operation()
      setData(result)
      return result
    } catch (err) {
      setError(err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [setError, clearError])

  const reset = useCallback(() => {
    setData(null)
    clearError()
    setLoading(false)
  }, [clearError])

  return {
    data,
    loading,
    error,
    execute,
    reset,
    isError: error !== null
  }
}

/**
 * Utility function to create user-friendly error messages based on error codes
 */
export function getErrorMessageByCode(code?: string): string {
  if (!code) return 'An unexpected error occurred.'

  const errorMessages: Record<string, string> = {
    // Input validation errors
    INVALID_INPUT: 'Please check your input and try again.',
    MISSING_FIELD: 'Please fill in all required fields.',
    INVALID_URL: 'Please enter a valid URL.',
    INVALID_FORMAT: 'The data format is invalid.',
    CONTENT_TOO_SHORT: 'Content is too short. Please add more details.',
    CONTENT_TOO_LONG: 'Content is too long. Please shorten it.',
    INVALID_PLATFORM: 'This platform is not supported.',
    MISSING_HASHTAG: 'Please include the required hashtag.',

    // Authentication & Authorization
    UNAUTHORIZED: 'Please sign in to continue.',
    FORBIDDEN: 'You don\'t have permission to perform this action.',
    INSUFFICIENT_PERMISSIONS: 'You don\'t have sufficient permissions.',
    TOKEN_EXPIRED: 'Your session has expired. Please sign in again.',
    INVALID_TOKEN: 'Authentication failed. Please sign in again.',

    // Resources
    NOT_FOUND: 'The requested resource was not found.',
    USER_NOT_FOUND: 'User not found.',
    SUBMISSION_NOT_FOUND: 'Submission not found.',
    REVIEW_NOT_FOUND: 'Review not found.',
    CONFLICT: 'This resource already exists.',
    DUPLICATE_URL: 'This URL has already been submitted.',
    DUPLICATE_CONTENT: 'Similar content has already been submitted.',
    REVIEW_ALREADY_EXISTS: 'You have already reviewed this submission.',

    // Business logic
    BUSINESS_ERROR: 'This action cannot be completed due to business rules.',
    SUBMISSION_ALREADY_PROCESSED: 'This submission has already been processed.',
    INSUFFICIENT_REVIEWS: 'More reviews are needed before this can be processed.',
    WEEKLY_LIMIT_EXCEEDED: 'You have reached your weekly limit for this activity.',
    RATE_LIMIT_EXCEEDED: 'Too many requests. Please try again later.',
    SPAM_DETECTED: 'This content appears to be spam.',
    AI_CONTENT_DETECTED: 'AI-generated content is not allowed.',

    // System errors
    SERVER_ERROR: 'A server error occurred. Please try again later.',
    DATABASE_ERROR: 'A database error occurred. Please try again later.',
    AI_SERVICE_ERROR: 'AI service is temporarily unavailable.',
    EXTERNAL_API_ERROR: 'External service is temporarily unavailable.',
    CONTENT_FETCH_ERROR: 'Could not fetch content from the provided URL.',
    CREATION_FAILED: 'Failed to create the resource.',
    UPDATE_FAILED: 'Failed to update the resource.',
    DELETE_FAILED: 'Failed to delete the resource.'
  }

  return errorMessages[code] || 'An unexpected error occurred.'
}

/**
 * Hook for displaying toast notifications for errors
 */
export function useErrorToast() {
  const showErrorToast = useCallback((error: unknown, duration: number = 5000) => {
    const errorInfo = handleApiError(error)
    
    // In a production app, this would integrate with a toast notification library
    console.error('Error Toast:', errorInfo.message)
    
    // TODO: Integrate with toast library (react-hot-toast, react-toastify, etc.)
    // Example:
    // toast.error(errorInfo.message, {
    //   duration,
    //   id: errorInfo.requestId || undefined
    // })
  }, [])

  return { showErrorToast }
}
