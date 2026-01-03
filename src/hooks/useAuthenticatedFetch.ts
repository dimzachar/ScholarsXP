/**
 * Hook for making authenticated API requests using Privy auth.
 * Provides fetch wrapper that automatically includes X-Privy-User-Id header.
 */

import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { useCallback } from 'react'

export function useAuthenticatedFetch() {
  const { user } = usePrivyAuthSync()

  const getAuthHeaders = useCallback((): HeadersInit => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    if (user?.privyUserId) {
      headers['X-Privy-User-Id'] = user.privyUserId
    }

    return headers
  }, [user?.privyUserId])

  const authenticatedFetch = useCallback(async (
    url: string,
    options: RequestInit = {}
  ): Promise<Response> => {
    const headers = getAuthHeaders()

    return fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    })
  }, [getAuthHeaders])

  return {
    getAuthHeaders,
    authenticatedFetch,
    isAuthenticated: !!user?.privyUserId,
    privyUserId: user?.privyUserId,
  }
}

export default useAuthenticatedFetch
