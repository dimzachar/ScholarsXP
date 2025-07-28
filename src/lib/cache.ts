/**
 * Simple In-Memory Cache with TTL
 * 
 * This cache implementation provides:
 * - Time-to-live (TTL) expiration
 * - Automatic cleanup of expired entries
 * - Memory-efficient storage
 * - Type-safe operations
 */

interface CacheItem<T> {
  data: T
  expires: number
  created: number
}

class SimpleCache {
  private cache = new Map<string, CacheItem<any>>()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 5 * 60 * 1000)
  }

  /**
   * Store data in cache with TTL
   */
  set<T>(key: string, data: T, ttlSeconds: number = 300): void {
    const now = Date.now()
    this.cache.set(key, {
      data,
      expires: now + (ttlSeconds * 1000),
      created: now
    })
  }

  /**
   * Retrieve data from cache
   */
  get<T>(key: string): T | null {
    const item = this.cache.get(key)
    
    if (!item) {
      return null
    }

    if (Date.now() > item.expires) {
      this.cache.delete(key)
      return null
    }

    return item.data as T
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null
  }

  /**
   * Delete specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now()
    let expired = 0
    let active = 0

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expires) {
        expired++
      } else {
        active++
      }
    }

    return {
      total: this.cache.size,
      active,
      expired,
      memoryUsage: this.getMemoryUsage()
    }
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    const keysToDelete: string[] = []

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expires) {
        keysToDelete.push(key)
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key))

    if (keysToDelete.length > 0) {
      console.log(`Cache cleanup: removed ${keysToDelete.length} expired entries`)
    }
  }

  /**
   * Estimate memory usage (rough calculation)
   */
  private getMemoryUsage(): string {
    const entries = Array.from(this.cache.entries())
    const jsonSize = JSON.stringify(entries).length
    const sizeInMB = (jsonSize / (1024 * 1024)).toFixed(2)
    return `${sizeInMB} MB`
  }

  /**
   * Destroy cache and cleanup intervals
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.clear()
  }
}

// Global cache instance
export const cache = new SimpleCache()

/**
 * Cache key generators for consistent naming
 */
export const CacheKeys = {
  analytics: (timeframe: string) => `analytics:${timeframe}`,
  userMetrics: (page: number, limit: number) => `user-metrics:${page}:${limit}`,
  taskTypeStats: (timeframe: string) => `task-type-stats:${timeframe}`,
  userCount: () => 'user-count',
  submissionCount: () => 'submission-count'
}

/**
 * Cache TTL constants (in seconds)
 */
export const CacheTTL = {
  ANALYTICS: 300,      // 5 minutes
  USER_METRICS: 120,   // 2 minutes  
  TASK_STATS: 600,     // 10 minutes
  COUNTS: 180          // 3 minutes
}

/**
 * Utility function to wrap async functions with caching
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetchFn: () => Promise<T>
): Promise<T> {
  // Try to get from cache first
  const cached = cache.get<T>(key)
  if (cached !== null) {
    return cached
  }

  // Cache miss - fetch data
  try {
    const data = await fetchFn()
    cache.set(key, data, ttlSeconds)
    return data
  } catch (error) {
    // Don't cache errors
    throw error
  }
}

/**
 * Cache warming function for critical data
 */
export async function warmCache() {
  console.log('🔥 Warming cache with critical data...')
  
  try {
    // Pre-load common analytics timeframes
    const timeframes = ['last_7_days', 'last_30_days', 'last_90_days']
    
    for (const timeframe of timeframes) {
      // This would call your actual analytics functions
      // For now, just set placeholder data
      cache.set(CacheKeys.analytics(timeframe), { placeholder: true }, CacheTTL.ANALYTICS)
    }
    
    console.log('✅ Cache warming completed')
  } catch (error) {
    console.error('❌ Cache warming failed:', error)
  }
}

// Warm cache on module load in production
if (process.env.NODE_ENV === 'production') {
  warmCache()
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Destroying cache on shutdown...')
  cache.destroy()
})

process.on('SIGINT', () => {
  console.log('Destroying cache on shutdown...')
  cache.destroy()
})
