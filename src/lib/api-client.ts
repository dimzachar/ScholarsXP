import { supabase } from '@/lib/supabase-client'

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message)
    this.name = 'ApiError'
  }
}

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
      headers: {
        ...headers,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new ApiError(
        errorData.error || errorData.message || `HTTP ${response.status}`,
        response.status,
        errorData.code
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
  return response.json()
}

export async function apiPost<T = any>(
  url: string, 
  data?: any
): Promise<T> {
  const response = await authenticatedFetch(url, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  })
  return response.json()
}

export async function apiPatch<T = any>(
  url: string, 
  data?: any
): Promise<T> {
  const response = await authenticatedFetch(url, {
    method: 'PATCH',
    body: data ? JSON.stringify(data) : undefined,
  })
  return response.json()
}

export async function apiPut<T = any>(
  url: string, 
  data?: any
): Promise<T> {
  const response = await authenticatedFetch(url, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  })
  return response.json()
}

export async function apiDelete<T = any>(url: string): Promise<T> {
  const response = await authenticatedFetch(url, {
    method: 'DELETE',
  })
  return response.json()
}

// Convenience functions for common API patterns
export const api = {
  get: apiGet,
  post: apiPost,
  patch: apiPatch,
  put: apiPut,
  delete: apiDelete,
}

// Hook for handling API errors in components
export function handleApiError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        return 'Authentication required. Please sign in again.'
      case 403:
        return 'You don\'t have permission to perform this action.'
      case 404:
        return 'The requested resource was not found.'
      case 429:
        return 'Too many requests. Please try again later.'
      case 500:
        return 'Server error. Please try again later.'
      default:
        return error.message || 'An unexpected error occurred.'
    }
  }
  
  if (error instanceof Error) {
    return error.message
  }
  
  return 'An unexpected error occurred.'
}
