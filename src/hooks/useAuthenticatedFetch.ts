/**
 * Hook for making authenticated API requests using Privy auth.
 * Sends Bearer token for server-side verification.
 */

import { usePrivy } from '@privy-io/react-auth'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { useCallback } from 'react'

export function useAuthenticatedFetch() {
  const { user } = usePrivyAuthSync()
  const { getAccessToken } = usePrivy()

  const authenticatedFetch = useCallback(async (
    url: string,
    options: RequestInit = {}
  ): Promise<Response> => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    // Get fresh access token for each request
    try {
      const token = await getAccessToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
    } catch (error) {
      console.warn('Failed to get access token:', error)
    }

    return fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    })
  }, [getAccessToken])

  return {
    authenticatedFetch,
    isAuthenticated: !!user?.privyUserId,
    privyUserId: user?.privyUserId,
  }
}

export default useAuthenticatedFetch
