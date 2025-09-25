import { LRUCache } from 'lru-cache'
import { DatabaseCache } from './database-cache'
import { CacheMonitoring } from './monitoring'

interface CacheLayer {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, data: T, ttl: number): Promise<void>
  delete(key: string): Promise<boolean>
  clear(): Promise<void>
}

export class SimplifiedMultiLayerCache {
  private memoryCache: LRUCache<string, any>
  private dbCache: DatabaseCache
  private monitoring: CacheMonitoring

  constructor() {
    // Use battle-tested LRU cache library
    this.memoryCache = new LRUCache({
      max: 1000,              // Max 1000 items
      maxSize: 50 * 1024 * 1024, // 50MB max size
      sizeCalculation: (value) => JSON.stringify(value).length,
      ttl: 5 * 60 * 1000,     // 5 minutes default TTL
      allowStale: false,      // Respect TTL expiration and force refresh
      updateAgeOnGet: true,   // LRU behavior
      updateAgeOnHas: true
    })

    this.dbCache = new DatabaseCache()
    this.monitoring = new CacheMonitoring()
  }

  async get<T>(key: string): Promise<T | null> {
    const startTime = performance.now()

    // L1: Memory cache (fastest - <1ms)
    let data = this.memoryCache.get(key) as T | undefined
    if (data !== undefined) {
      this.monitoring.recordHit('L1', key, performance.now() - startTime)
      return data
    }

    // L2: Database cache (persistent - 50-200ms)
    data = await this.dbCache.get<T>(key)
    if (data !== null) {
      // Store in memory cache for future requests
      this.memoryCache.set(key, data)
      this.monitoring.recordHit('L2', key, performance.now() - startTime)
      return data
    }

    this.monitoring.recordMiss('TOTAL', key)
    return null
  }

  async set<T>(key: string, data: T, ttl: number): Promise<void> {
    // Store in both layers
    this.memoryCache.set(key, data, { ttl: ttl * 1000 })
    await this.dbCache.set(key, data, ttl)
  }

  async delete(key: string): Promise<boolean> {
    const memoryDeleted = this.memoryCache.delete(key)
    const dbDeleted = await this.dbCache.delete(key)
    return memoryDeleted || dbDeleted
  }

  async clear(): Promise<void> {
    this.memoryCache.clear()
    await this.dbCache.clear()
  }

  /**
   * Invalidate cache entries by simple substring pattern.
   * Supports patterns like "admin_submissions:*" by matching the substring
   * (the '*' wildcard is treated as any substring).
   * Returns number of entries removed across layers.
   */
  async invalidateByPattern(pattern: string): Promise<number> {
    const needle = pattern.replace(/\*/g, '')
    let removed = 0

    // Invalidate L1: memory cache
    for (const key of this.memoryCache.keys()) {
      if (key.includes(needle)) {
        const ok = this.memoryCache.delete(key)
        if (ok) removed += 1
      }
    }

    // Invalidate L2: database cache (best-effort)
    // DatabaseCache implements deleteByPattern; call it if available
    const dbAny = this.dbCache as unknown as { deleteByPattern?: (needle: string) => Promise<number> }
    if (dbAny.deleteByPattern) {
      try {
        removed += await dbAny.deleteByPattern(needle)
      } catch (err) {
        console.error('Database cache pattern invalidation error:', err)
      }
    }

    return removed
  }

  getStats() {
    return {
      memory: {
        size: this.memoryCache.size,
        calculatedSize: this.memoryCache.calculatedSize,
        maxSize: this.memoryCache.maxSize
      },
      monitoring: this.monitoring.getAllMetrics()
    }
  }
}

// Global cache instance
export const multiLayerCache = new SimplifiedMultiLayerCache()
