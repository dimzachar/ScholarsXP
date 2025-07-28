"use client"

import { useState, useEffect, useCallback } from 'react'

// Simple cache implementation for dashboard data
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>()

const CACHE_TTL = {
  profile: 5 * 60 * 1000, // 5 minutes
  leaderboard: 2 * 60 * 1000, // 2 minutes
  analytics: 3 * 60 * 1000, // 3 minutes
  achievements: 10 * 60 * 1000, // 10 minutes
} as const

interface FetchState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

// Generic fetcher function with caching
async function fetchWithCache<T>(url: string, cacheKey: string, ttl: number, forceRefresh = false): Promise<T> {
  // Check cache first (unless force refresh is requested)
  if (!forceRefresh) {
    const cached = cache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data
    }
  }

  // Fetch fresh data
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
  }

  const data = await response.json()

  // Cache the result
  cache.set(cacheKey, {
    data,
    timestamp: Date.now(),
    ttl
  })

  return data
}

// Custom hook for profile data
export function useProfileData(userId?: string) {
  const [state, setState] = useState<FetchState<any>>({
    data: null,
    loading: true,
    error: null
  })

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!userId) return

    try {
      setState(prev => ({ ...prev, loading: true, error: null }))
      const data = await fetchWithCache(
        '/api/user/profile/complete',
        `profile-${userId}`,
        CACHE_TTL.profile,
        forceRefresh
      )
      setState({ data, loading: false, error: null })
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch profile data'
      })
    }
  }, [userId])

  const forceRefresh = useCallback(() => {
    console.log('🔄 Force refreshing profile data for user:', userId)
    return fetchData(true)
  }, [fetchData, userId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { ...state, refetch: fetchData, forceRefresh }
}

// Custom hook for leaderboard data
export function useLeaderboardData(limit = 10) {
  const [state, setState] = useState<FetchState<any>>({
    data: null,
    loading: true,
    error: null
  })

  const fetchData = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }))
      const data = await fetchWithCache(
        `/api/leaderboard?limit=${limit}`,
        `leaderboard-${limit}`,
        CACHE_TTL.leaderboard
      )
      setState({ data, loading: false, error: null })
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch leaderboard data'
      })
    }
  }, [limit])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { ...state, refetch: fetchData }
}

// Custom hook for analytics data
export function useAnalyticsData(timeframe = 'current_week', enabled = true) {
  const [state, setState] = useState<FetchState<any>>({
    data: null,
    loading: enabled,
    error: null
  })

  const fetchData = useCallback(async () => {
    if (!enabled) return

    try {
      setState(prev => ({ ...prev, loading: true, error: null }))
      
      const [xpBreakdownResponse, achievementsResponse] = await Promise.all([
        fetchWithCache(
          `/api/user/xp-breakdown?timeframe=${timeframe}`,
          `xp-breakdown-${timeframe}`,
          CACHE_TTL.analytics
        ),
        fetchWithCache(
          '/api/user/achievements',
          'achievements',
          CACHE_TTL.achievements
        )
      ])

      // Use insights directly from API (no transformation needed)
      const combinedData = {
        breakdown: xpBreakdownResponse.breakdown,
        weeklyTrends: xpBreakdownResponse.weeklyTrends || [],
        goalProgress: xpBreakdownResponse.goalProgress || [],
        insights: xpBreakdownResponse.insights || [],
        achievements: achievementsResponse,
        timeframe: xpBreakdownResponse.timeframe || timeframe
      }

      setState({ data: combinedData, loading: false, error: null })
    } catch (error) {
      setState({
        data: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch analytics data'
      })
    }
  }, [timeframe, enabled])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { ...state, refetch: fetchData }
}

// Combined hook for all dashboard data
export function useDashboardData(userId?: string, activeTab = 'overview', timeframe = 'current_week') {
  const profileData = useProfileData(userId)
  const analyticsData = useAnalyticsData(timeframe, activeTab === 'progress')

  const isLoading = profileData.loading ||
                   (activeTab === 'progress' && analyticsData.loading)

  const hasError = profileData.error || analyticsData.error

  const refetchAll = useCallback(() => {
    profileData.refetch()
    if (activeTab === 'progress') {
      analyticsData.refetch()
    }
  }, [profileData.refetch, analyticsData.refetch, activeTab])

  const forceRefreshAll = useCallback(() => {
    console.log('🔄 Force refreshing all dashboard data')
    profileData.forceRefresh?.()
    if (activeTab === 'progress') {
      analyticsData.refetch()
    }
  }, [profileData.forceRefresh, analyticsData.refetch, activeTab])

  return {
    profile: profileData,
    analytics: analyticsData,
    isLoading,
    hasError,
    refetchAll,
    forceRefreshAll
  }
}

// Cache management utilities
export const dashboardCache = {
  clear: () => cache.clear(),
  clearProfile: (userId: string) => cache.delete(`profile-${userId}`),
  clearLeaderboard: () => {
    for (const key of cache.keys()) {
      if (key.startsWith('leaderboard-')) {
        cache.delete(key)
      }
    }
  },
  clearAnalytics: () => {
    for (const key of cache.keys()) {
      if (key.startsWith('xp-breakdown-') || key === 'achievements') {
        cache.delete(key)
      }
    }
  }
}
