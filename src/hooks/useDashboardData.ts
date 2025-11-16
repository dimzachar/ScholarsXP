"use client"

import { useState, useEffect, useCallback } from 'react'
import { ENABLE_ACHIEVEMENTS } from '@/config/feature-flags'

// Simple cache implementation for dashboard data
const cache = new Map<string, { data: any; timestamp: number; ttl: number }>()

const CACHE_TTL = {
  profile: 5 * 60 * 1000, // 5 minutes
  leaderboard: 2 * 60 * 1000, // 2 minutes
  analytics: 3 * 60 * 1000, // 3 minutes
  achievements: 10 * 60 * 1000, // 10 minutes
} as const

const EMPTY_ACHIEVEMENTS_SUMMARY = {
  achievements: [],
  byCategory: {
    SUBMISSION: [],
    REVIEW: [],
    STREAK: [],
    MILESTONE: [],
    SPECIAL: []
  },
  stats: {
    total: 0,
    earned: 0,
    inProgress: 0,
    notStarted: 0,
    totalXpFromAchievements: 0,
    recentlyEarned: 0
  },
  categoryStats: [],
  nextToEarn: [],
  recentlyEarned: [],
  milestones: {
    firstAchievement: null,
    latestAchievement: null,
    mostValuableAchievement: null
  },
  insights: {
    achievementVelocity: 0,
    completionRate: 0,
    averageXpPerAchievement: 0,
    daysToNextAchievement: null
  },
  filters: {
    category: 'all',
    status: 'all'
  }
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
      
      // Ensure XP consistency across all data sources
      // Use the authoritative User.totalXp as the source of truth
      if (data && typeof data === 'object' && 'profile' in data && 'statistics' in data) {
        const profileData = data as any
        if (profileData?.profile?.totalXp && profileData?.statistics?.xpBreakdown) {
          profileData.statistics.xpBreakdown.total = profileData.profile.totalXp
        }
      }
      
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
    // console.log('🔄 Force refreshing profile data for user:', userId)
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
      
      const achievementsPromise = ENABLE_ACHIEVEMENTS
        ? fetchWithCache(
            '/api/user/achievements',
            'achievements',
            CACHE_TTL.achievements
          )
        : Promise.resolve(EMPTY_ACHIEVEMENTS_SUMMARY)

      const [xpBreakdownResponse, achievementsResponse] = await Promise.all([
        fetchWithCache(
          `/api/user/xp-breakdown?timeframe=${timeframe}`,
          `xp-breakdown-${timeframe}`,
          CACHE_TTL.analytics
        ),
        achievementsPromise
      ])

      // Use insights directly from API (no transformation needed)
      const combinedData = {
        breakdown: (xpBreakdownResponse as any)?.breakdown || {},
        weeklyTrends: (xpBreakdownResponse as any)?.weeklyTrends || [],
        goalProgress: (xpBreakdownResponse as any)?.goalProgress || [],
        insights: (xpBreakdownResponse as any)?.insights || [],
        achievements: achievementsResponse,
        timeframe: (xpBreakdownResponse as any)?.timeframe || timeframe
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
    // console.log('🔄 Force refreshing all dashboard data')
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
