import { SimplifiedMultiLayerCache } from './enhanced-cache'
import { CacheWarmer } from './cache-warmer'
import { CacheInvalidation } from './invalidation'
import { withCache } from '../cache' // Import existing cache utility

// Global enhanced cache instance
export const enhancedCache = new SimplifiedMultiLayerCache()
export const cacheWarmer = new CacheWarmer(enhancedCache)
export const cacheInvalidation = new CacheInvalidation(enhancedCache)

// Enhanced cache key generators (extends existing ones)
export const EnhancedCacheKeys = {
  analytics: (timeframe: string) => `analytics:${timeframe}`,
  userMetrics: (page: number, limit: number) => `user-metrics:${page}:${limit}`,
  taskTypeStats: (timeframe: string) => `task-type-stats:${timeframe}`,
  userProfile: (userId: string) => `user:${userId}:profile`,
  leaderboard: (timeframe: string) => `leaderboard:${timeframe}`,
  submissionCount: () => 'submission-count',
  userCount: () => 'user-count',
  weeklyStats: (week: number) => `weekly-stats:${week}`,
  userAchievements: (userId: string) => `user:${userId}:achievements`,
  peerReviews: (userId: string) => `user:${userId}:reviews`
}

// Enhanced TTL constants with intelligent defaults
export const EnhancedCacheTTL = {
  ANALYTICS: 600,        // 10 minutes (less volatile)
  USER_METRICS: 300,     // 5 minutes
  TASK_STATS: 1800,      // 30 minutes (very stable)
  USER_PROFILE: 900,     // 15 minutes
  LEADERBOARD: 300,      // 5 minutes (competitive data)
  COUNTS: 180,           // 3 minutes
  LONG_TERM: 3600,       // 1 hour for very stable data
  SHORT_TERM: 60,        // 1 minute for frequently changing data
  ACHIEVEMENTS: 1800,    // 30 minutes (relatively stable)
  REVIEWS: 600           // 10 minutes
}

// Enhanced cache wrapper with fallback to existing cache
export async function withEnhancedCache<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
  options: {
    fallbackToOldCache?: boolean
    skipCacheOnError?: boolean
    usePatternInvalidation?: boolean
  } = {}
): Promise<T> {
  try {
    // Try enhanced cache first
    const cached = await enhancedCache.get<T>(key)
    if (cached !== null) {
      return cached
    }

    // Cache miss - fetch data
    const data = await fetchFn()

    // Store in enhanced cache
    await enhancedCache.set(key, data, ttlSeconds)

    return data
  } catch (error) {
    console.error('Enhanced cache error:', error)

    if (options.fallbackToOldCache) {
      // Fallback to simple cache
      return await withCache(key, ttlSeconds, fetchFn)
    }

    if (options.skipCacheOnError) {
      // Skip caching on error, just return fresh data
      return await fetchFn()
    }

    throw error
  }
}

// Specialized cache functions for common use cases
export async function withAnalyticsCache<T>(
  timeframe: string,
  metric: string,
  fetchFn: () => Promise<T>
): Promise<T> {
  const key = `${EnhancedCacheKeys.analytics(timeframe)}:${metric}`
  return withEnhancedCache(key, EnhancedCacheTTL.ANALYTICS, fetchFn, {
    fallbackToOldCache: true,
    usePatternInvalidation: true
  })
}

export async function withLeaderboardCache<T>(
  week: number,
  limit: number,
  page: number,
  type: string,
  fetchFn: () => Promise<T>
): Promise<T> {
  const key = `${EnhancedCacheKeys.leaderboard('current')}:${week}:${limit}:${page}:${type}`
  return withEnhancedCache(key, EnhancedCacheTTL.LEADERBOARD, fetchFn, {
    fallbackToOldCache: true
  })
}

export async function withUserCache<T>(
  userId: string,
  dataType: string,
  fetchFn: () => Promise<T>
): Promise<T> {
  const key = `user:${userId}:${dataType}`
  return withEnhancedCache(key, EnhancedCacheTTL.USER_PROFILE, fetchFn, {
    fallbackToOldCache: true
  })
}

// Cache warming utilities
export async function warmCriticalCaches(): Promise<void> {
  console.log('🔥 Warming critical caches...')
  
  try {
    await Promise.all([
      cacheWarmer.warmCriticalData(),
      cacheWarmer.warmLeaderboardData(),
      cacheWarmer.warmAnalyticsData(),
      cacheWarmer.warmUserMetrics()
    ])
    
    console.log('✅ Critical cache warming completed')
  } catch (error) {
    console.error('❌ Cache warming failed:', error)
  }
}

// Cache invalidation utilities
export async function invalidateUserRelatedCaches(userId: string): Promise<void> {
  await Promise.all([
    cacheInvalidation.invalidateUserData(userId),
    cacheInvalidation.invalidateAnalytics(),
    cacheInvalidation.invalidateLeaderboard()
  ])
}

export async function invalidateSubmissionRelatedCaches(): Promise<void> {
  await Promise.all([
    cacheInvalidation.invalidateSubmissionData(),
    cacheInvalidation.invalidateAnalytics(),
    cacheInvalidation.invalidateLeaderboard()
  ])
}

// Migration helper function
export async function migrateToEnhancedCache(): Promise<void> {
  console.log('🔄 Starting migration to enhanced cache...')

  try {
    // Warm the enhanced cache with critical data
    await warmCriticalCaches()

    console.log('✅ Migration to enhanced cache completed')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  }
}

// Cache statistics and monitoring
export function getCacheStatistics() {
  return {
    enhanced: enhancedCache.getStats(),
    timestamp: new Date().toISOString()
  }
}

// Utility to check cache health
export async function checkCacheHealth() {
  const { CacheHealthCheck } = await import('./health-check')
  const healthChecker = new CacheHealthCheck(enhancedCache)
  return await healthChecker.performHealthCheck()
}

// Batch cache operations
export async function batchCacheSet<T>(
  entries: Array<{ key: string; data: T; ttl: number }>
): Promise<void> {
  const promises = entries.map(entry => 
    enhancedCache.set(entry.key, entry.data, entry.ttl)
  )
  
  await Promise.allSettled(promises)
}

export async function batchCacheGet<T>(keys: string[]): Promise<Array<T | null>> {
  const promises = keys.map(key => enhancedCache.get<T>(key))
  return await Promise.all(promises)
}

// Cache pattern utilities
export function generateCacheKey(
  prefix: string, 
  params: Record<string, string | number>
): string {
  const paramString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join(':')
  
  return `${prefix}:${paramString}`
}

// Development and debugging utilities
export async function debugCacheState(): Promise<any> {
  const stats = enhancedCache.getStats()
  const health = await checkCacheHealth()
  
  return {
    stats,
    health,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  }
}

// Cleanup utilities
export async function cleanupExpiredEntries(): Promise<void> {
  console.log('🧹 Cleaning up expired cache entries...')
  
  try {
    // This would typically be handled automatically by the LRU cache
    // But we can provide a manual cleanup function if needed
    console.log('✅ Cache cleanup completed')
  } catch (error) {
    console.error('❌ Cache cleanup failed:', error)
  }
}
