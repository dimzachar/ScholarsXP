/**
 * API Client - Updated for Standardized Error Handling
 *
 * Part of the API Error Handling Standardization Initiative
 * Updated to work with the new standardized error response format:
 * Success: { success: true, data: any }
 * Error: { success: false, error: { error: string, code: string, details?: any } }
 */

import { supabase } from '@/lib/supabase-client'

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: Record<string, any>,
    public requestId?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Type definitions for standardized API responses
export interface APISuccessResponse<T = any> {
  success: true
  data: T
}

export interface APIErrorResponse {
  success: false
  error: {
    error: string
    code: string
    details?: Record<string, any>
  }
}

export type APIResponse<T = any> = APISuccessResponse<T> | APIErrorResponse

export async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session?.access_token) {
    throw new ApiError('No authentication token available', 401)
  }

  return {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
  }
}

export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  try {
    const headers = await getAuthHeaders()

    const response = await fetch(url, {
      ...options,
      cache: options.cache ?? 'no-store',
      headers: {
        ...headers,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))

      // Handle new standardized error format
      if (errorData.success === false && errorData.error) {
        throw new ApiError(
          errorData.error.error,
          response.status,
          errorData.error.code,
          errorData.error.details,
          response.headers.get('X-Request-ID') || undefined
        )
      }

      // Handle legacy error formats for backward compatibility
      throw new ApiError(
        errorData.error || errorData.message || `HTTP ${response.status}`,
        response.status,
        errorData.code,
        undefined,
        response.headers.get('X-Request-ID') || undefined
      )
    }

    return response
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error',
      0
    )
  }
}

export async function apiGet<T = any>(url: string): Promise<T> {
  const response = await authenticatedFetch(url)
  const data: APIResponse<T> = await response.json()

  if (data.success) {
    return data.data
  }

  // This shouldn't happen since authenticatedFetch throws on error responses
  throw new ApiError(data.error.error, response.status, data.error.code, data.error.details)
}

export async function apiPost<T = any>(
  url: string,
  data?: any
): Promise<T> {
  const response = await authenticatedFetch(url, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  })
  const responseData: APIResponse<T> = await response.json()

  if (responseData.success) {
    return responseData.data
  }

  throw new ApiError(responseData.error.error, response.status, responseData.error.code, responseData.error.details)
}

export async function apiPatch<T = any>(
  url: string,
  data?: any
): Promise<T> {
  const response = await authenticatedFetch(url, {
    method: 'PATCH',
    body: data ? JSON.stringify(data) : undefined,
  })
  const responseData: APIResponse<T> = await response.json()

  if (responseData.success) {
    return responseData.data
  }

  throw new ApiError(responseData.error.error, response.status, responseData.error.code, responseData.error.details)
}

export async function apiPut<T = any>(
  url: string,
  data?: any
): Promise<T> {
  const response = await authenticatedFetch(url, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  })
  const responseData: APIResponse<T> = await response.json()

  if (responseData.success) {
    return responseData.data
  }

  throw new ApiError(responseData.error.error, response.status, responseData.error.code, responseData.error.details)
}

export async function apiDelete<T = any>(url: string): Promise<T> {
  const response = await authenticatedFetch(url, {
    method: 'DELETE',
  })
  const responseData: APIResponse<T> = await response.json()

  if (responseData.success) {
    return responseData.data
  }

  throw new ApiError(responseData.error.error, response.status, responseData.error.code, responseData.error.details)
}

// Convenience functions for common API patterns
export const api = {
  get: apiGet,
  post: apiPost,
  patch: apiPatch,
  put: apiPut,
  delete: apiDelete,
}

// Enhanced error handling for components with support for new error format
export function handleApiError(error: unknown): {
  message: string
  code?: string
  details?: Record<string, any>
  requestId?: string
} {
  if (error instanceof ApiError) {
    let message: string

    // Use specific error message from API or fallback to status-based messages
    if (error.message) {
      message = error.message
    } else {
      switch (error.status) {
        case 401:
          message = 'Authentication required. Please sign in again.'
          break
        case 403:
          message = 'You don\'t have permission to perform this action.'
          break
        case 404:
          message = 'The requested resource was not found.'
          break
        case 409:
          message = 'This resource already exists or conflicts with existing data.'
          break
        case 422:
          message = 'The request could not be processed due to business logic constraints.'
          break
        case 429:
          message = 'Too many requests. Please try again later.'
          break
        case 500:
          message = 'Server error. Please try again later.'
          break
        default:
          message = 'An unexpected error occurred.'
      }
    }

    return {
      message,
      code: error.code,
      details: error.details,
      requestId: error.requestId
    }
  }

  if (error instanceof Error) {
    return {
      message: error.message
    }
  }

  return {
    message: 'An unexpected error occurred.'
  }
}

// Legacy function for backward compatibility
export function handleApiErrorMessage(error: unknown): string {
  return handleApiError(error).message
}
