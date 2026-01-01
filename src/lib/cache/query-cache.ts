import { multiLayerCache } from './enhanced-cache'

/**
 * Enhanced query cache that builds on the existing multi-layer cache infrastructure
 * Provides optimized caching for expensive database queries with performance monitoring
 */
export class QueryCache {
  /**
   * Get cached data with automatic type inference
   */
  static async get<T>(key: string): Promise<T | null> {
    try {
      return await multiLayerCache.get<T>(key)
    } catch (error) {
      console.error('Query cache get error:', error)
      return null
    }
  }

  /**
   * Set cached data with TTL
   */
  static async set(key: string, data: any, ttlSeconds: number = 300): Promise<void> {
    try {
      await multiLayerCache.set(key, data, ttlSeconds)
    } catch (error) {
      console.error('Query cache set error:', error)
    }
  }

  /**
   * Create standardized cache key for API endpoints
   */
  static createKey(endpoint: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|')
    return `api:${endpoint}:${sortedParams}`
  }

  /**
   * Enhanced cache with performance monitoring and metrics
   */
  static async getWithMetrics<T>(key: string): Promise<{
    data: T | null
    hit: boolean
    duration: number
  }> {
    const startTime = Date.now()
    const data = await this.get<T>(key)
    const duration = Date.now() - startTime
    const hit = data !== null

    // Log cache performance for monitoring (commented out to reduce noise)
    // console.log(`Cache ${hit ? 'HIT' : 'MISS'}: ${key} (${duration}ms)`)

    return { data, hit, duration }
  }

  /**
   * Cache with automatic refresh for stale data
   */
  static async getOrRefresh<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = 300,
    staleThreshold: number = 0.8
  ): Promise<T> {
    const cached = await this.get<T>(key)

    if (cached) {
      // TODO: Implement stale-while-revalidate logic
      // For now, return cached data
      return cached
    }

    // Cache miss - fetch fresh data
    const freshData = await fetchFn()
    await this.set(key, freshData, ttlSeconds)
    return freshData
  }

  /**
   * Batch cache operations for multiple keys
   */
  static async getMultiple<T>(keys: string[]): Promise<Map<string, T | null>> {
    const results = new Map<string, T | null>()

    await Promise.all(
      keys.map(async (key) => {
        const data = await this.get<T>(key)
        results.set(key, data)
      })
    )

    return results
  }

  /**
   * Cache invalidation by pattern
   */
  static async invalidatePattern(pattern: string): Promise<number> {
    try {
      // Use the existing multi-layer cache invalidation
      return await multiLayerCache.invalidateByPattern(pattern)
    } catch (error) {
      console.error('Cache invalidation error:', error)
      return 0
    }
  }

  /**
   * Warm cache with pre-computed data
   */
  static async warm(key: string, data: any, ttlSeconds: number = 300): Promise<void> {
    await this.set(key, data, ttlSeconds)
    // console.log(`🔥 Cache warmed: ${key}`)
  }

  /**
   * Cache statistics and monitoring
   */
  static getStats() {
    return multiLayerCache.getStats()
  }
}

/**
 * Cache TTL constants optimized for different data types
 */
export const CacheTTL = {
  // Analytics data (changes frequently)
  ANALYTICS: 300,           // 5 minutes
  ANALYTICS_OVERVIEW: 600,  // 10 minutes for overview data

  // User data
  USER_PROFILE: 120,        // 2 minutes
  USER_METRICS: 180,        // 3 minutes
  USER_LEADERBOARD: 300,    // 5 minutes

  // Submission data
  SUBMISSIONS_LIST: 60,    // 5 minutes for admin lists (improved caching)
  ADMIN_SUBMISSIONS: 180,   // 3 minutes specifically for admin submissions
  SUBMISSION_DETAILS: 300,  // 5 minutes for individual submissions

  // Static-ish data
  TASK_STATS: 1800,        // 30 minutes
  PLATFORM_STATS: 3600,   // 1 hour
  ROLE_COUNTS: 900,        // 15 minutes

  // Long-term cache
  SYSTEM_CONFIG: 7200,     // 2 hours
  ACHIEVEMENT_DEFINITIONS: 3600, // 1 hour
}

/**
 * Utility function to wrap async functions with caching
 * Enhanced version of the existing withCache utility
 */
export async function withQueryCache<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
  options: {
    skipCache?: boolean
    refreshCache?: boolean
    logPerformance?: boolean
  } = {}
): Promise<T> {
  const { skipCache = false, refreshCache = false, logPerformance = true } = options

  const startTime = Date.now()

  // Skip cache if requested
  if (skipCache || refreshCache) {
    const data = await fetchFn()
    if (!skipCache) {
      await QueryCache.set(key, data, ttlSeconds)
    }

    // if (logPerformance) {
    //   const duration = Date.now() - startTime
    //   console.log(`🔄 Cache ${refreshCache ? 'REFRESH' : 'SKIP'}: ${key} (${duration}ms)`)
    // }

    return data
  }

  // Try to get from cache first
  const { data: cached, hit, duration: cacheDuration } = await QueryCache.getWithMetrics<T>(key)

  if (cached !== null) {
    // if (logPerformance) {
    //   console.log(`⚡ Cache HIT: ${key} (${cacheDuration}ms)`)
    // }
    return cached
  }

  // Cache miss - fetch data
  try {
    const data = await fetchFn()
    await QueryCache.set(key, data, ttlSeconds)

    // if (logPerformance) {
    //   const totalDuration = Date.now() - startTime
    //   console.log(`💾 Cache MISS: ${key} (${totalDuration}ms total, ${totalDuration - cacheDuration}ms fetch)`)
    // }

    return data
  } catch (error) {
    // Don't cache errors
    throw error
  }
}

/**
 * Cache warming utilities for common queries
 */
export class CacheWarmer {
  /**
   * Warm analytics cache with current data
   */
  static async warmAnalytics(): Promise<void> {
    console.log('🔥 Warming analytics cache...')

    // Warm common analytics queries
    const timeframes = ['last_7_days', 'last_30_days', 'last_90_days']

    for (const timeframe of timeframes) {
      const key = QueryCache.createKey('analytics', { timeframe })
      // Note: This would need to import and call the actual analytics function
      console.log(`🔥 Would warm: ${key}`)
    }
  }

  /**
   * Warm leaderboard cache
   */
  static async warmLeaderboard(): Promise<void> {
    console.log('🔥 Warming leaderboard cache...')

    // Warm common leaderboard queries
    const pages = [1, 2, 3]
    const limits = [20, 50]

    for (const page of pages) {
      for (const limit of limits) {
        const key = QueryCache.createKey('leaderboard', { page, limit })
        console.log(`🔥 Would warm: ${key}`)
      }
    }
  }
}

/**
 * Cache performance monitoring
 */
export class CachePerformanceMonitor {
  private static metrics = {
    hits: 0,
    misses: 0,
    errors: 0,
    totalFetchTime: 0,
    totalCacheTime: 0
  }

  static recordHit(duration: number) {
    this.metrics.hits++
    this.metrics.totalCacheTime += duration
  }

  static recordMiss(fetchDuration: number, cacheDuration: number) {
    this.metrics.misses++
    this.metrics.totalFetchTime += fetchDuration
    this.metrics.totalCacheTime += cacheDuration
  }

  static recordError() {
    this.metrics.errors++
  }

  static getMetrics() {
    const total = this.metrics.hits + this.metrics.misses
    return {
      ...this.metrics,
      hitRate: total > 0 ? (this.metrics.hits / total) * 100 : 0,
      averageFetchTime: this.metrics.misses > 0 ? this.metrics.totalFetchTime / this.metrics.misses : 0,
      averageCacheTime: total > 0 ? this.metrics.totalCacheTime / total : 0
    }
  }

  static reset() {
    this.metrics = {
      hits: 0,
      misses: 0,
      errors: 0,
      totalFetchTime: 0,
      totalCacheTime: 0
    }
  }
}
