import { SimplifiedMultiLayerCache } from './enhanced-cache'
import { createServiceClient } from '@/lib/supabase-server'

export class CacheInvalidation {
  private cache: SimplifiedMultiLayerCache
  private supabase: ReturnType<typeof createServiceClient> | null = null

  constructor(cache: SimplifiedMultiLayerCache) {
    this.cache = cache
  }

  private getSupabaseClient() {
    if (!this.supabase) {
      // Lazy initialization to avoid environment variable issues during import
      this.supabase = createServiceClient()
    }
    return this.supabase
  }

  async invalidateByPattern(pattern: string): Promise<void> {
    console.log(`🗑️ Invalidating cache pattern: ${pattern}`)

    try {
      // Get keys matching pattern from database
      const keysToInvalidate = await this.getKeysByPattern(pattern)

      // Invalidate from both memory and database cache
      const invalidationPromises = keysToInvalidate.map(async (key) => {
        await this.cache.delete(key)
      })

      await Promise.allSettled(invalidationPromises)
      console.log(`🗑️ Invalidated ${keysToInvalidate.length} cache entries`)
    } catch (error) {
      console.error('Cache invalidation failed:', error)
    }
  }

  async invalidateOnUserAction(action: string, userId?: string): Promise<void> {
    const invalidationMap = {
      'submission_created': ['analytics:*', 'leaderboard:*', 'user-metrics:*', 'submission-count'],
      'submission_reviewed': ['analytics:*', 'leaderboard:*'],
      'user_updated': userId ? [`user:${userId}:*`] : ['user-count'],
      'xp_awarded': ['analytics:*', 'leaderboard:*', 'user-metrics:*'],
      'weekly_reset': ['leaderboard:*', 'analytics:*', 'user-metrics:*'],
      'achievement_earned': userId ? [`user:${userId}:*`, 'analytics:*'] : ['analytics:*']
    }

    const patterns = invalidationMap[action as keyof typeof invalidationMap] || []

    for (const pattern of patterns) {
      await this.invalidateByPattern(pattern)
    }
  }

  async invalidateAnalytics(timeframes?: string[]): Promise<void> {
    console.log('📊 Invalidating analytics cache...')
    
    const targetTimeframes = timeframes || ['last_7_days', 'last_30_days', 'last_90_days', 'all_time']
    
    for (const timeframe of targetTimeframes) {
      await this.invalidateByPattern(`analytics:${timeframe}:*`)
    }
  }

  async invalidateLeaderboard(weeks?: number[]): Promise<void> {
    console.log('🏆 Invalidating leaderboard cache...')
    
    if (weeks && weeks.length > 0) {
      for (const week of weeks) {
        await this.invalidateByPattern(`leaderboard:${week}:*`)
      }
    } else {
      // Invalidate all leaderboard data
      await this.invalidateByPattern('leaderboard:*')
    }
  }

  async invalidateUserData(userId?: string): Promise<void> {
    console.log(`👤 Invalidating user data cache${userId ? ` for user ${userId}` : ''}...`)
    
    if (userId) {
      await this.invalidateByPattern(`user:${userId}:*`)
    } else {
      await this.invalidateByPattern('user:*')
      await this.invalidateByPattern('user-metrics:*')
      await this.cache.delete('user-count')
    }
  }

  async invalidateSubmissionData(): Promise<void> {
    console.log('📝 Invalidating submission-related cache...')

    await Promise.all([
      this.invalidateByPattern('analytics:*'),
      this.invalidateByPattern('leaderboard:*'),
      this.cache.delete('submission-count')
    ])
  }

  async invalidateLegacyData(): Promise<void> {
    console.log('🗑️ Invalidating legacy submission cache...')

    await Promise.all([
      this.invalidateByPattern('api:admin_submissions:*'), // Correct pattern format
      this.invalidateByPattern('leaderboard:*'),
      this.cache.delete('legacy-submission-count'),
      this.cache.delete('user-count')
    ])
  }

  async invalidateAll(): Promise<void> {
    console.log('🧹 Clearing all cache data...')
    
    try {
      await this.cache.clear()
      console.log('✅ All cache data cleared')
    } catch (error) {
      console.error('❌ Failed to clear all cache data:', error)
    }
  }

  async scheduleInvalidation(pattern: string, delayMs: number): Promise<void> {
    console.log(`⏰ Scheduling cache invalidation for pattern "${pattern}" in ${delayMs}ms`)
    
    setTimeout(async () => {
      try {
        await this.invalidateByPattern(pattern)
        console.log(`⏰ Scheduled invalidation completed for pattern: ${pattern}`)
      } catch (error) {
        console.error(`❌ Scheduled invalidation failed for pattern ${pattern}:`, error)
      }
    }, delayMs)
  }

  async invalidateOnDataChange(tableName: string, operation: 'INSERT' | 'UPDATE' | 'DELETE', recordId?: string): Promise<void> {
    console.log(`🔄 Invalidating cache due to ${operation} on ${tableName}${recordId ? ` (ID: ${recordId})` : ''}`)

    const tableInvalidationMap = {
      'User': async () => {
        await this.invalidateUserData(recordId)
        await this.invalidateAnalytics()
        await this.invalidateLeaderboard()
      },
      'Submission': async () => {
        await this.invalidateSubmissionData()
        await this.invalidateAnalytics()
        await this.invalidateLeaderboard()
      },
      'PeerReview': async () => {
        await this.invalidateAnalytics()
        await this.invalidateLeaderboard()
      },
      'WeeklyStats': async () => {
        await this.invalidateLeaderboard()
        await this.invalidateAnalytics()
      },
      'Achievement': async () => {
        await this.invalidateAnalytics()
        if (recordId) {
          await this.invalidateUserData(recordId)
        }
      }
    }

    const invalidationFunction = tableInvalidationMap[tableName as keyof typeof tableInvalidationMap]
    if (invalidationFunction) {
      try {
        await invalidationFunction()
      } catch (error) {
        console.error(`❌ Table-based invalidation failed for ${tableName}:`, error)
      }
    } else {
      console.log(`⚠️ No invalidation rules defined for table: ${tableName}`)
    }
  }

  private async getKeysByPattern(pattern: string): Promise<string[]> {
    try {
      // Convert wildcard pattern to SQL LIKE pattern
      const likePattern = pattern.replace('*', '%')

      const supabase = this.getSupabaseClient()
      const { data, error } = await supabase
        .from('cache_entries')
        .select('key')
        .like('key', likePattern)

      if (error) {
        console.error('Error fetching keys by pattern:', error)
        return []
      }

      return data?.map(entry => entry.key) || []
    } catch (error) {
      console.error('Database query failed:', error)
      return []
    }
  }

  async getInvalidationStats(): Promise<{
    totalKeys: number
    patternMatches: Record<string, number>
    lastInvalidation: string | null
  }> {
    try {
      const supabase = this.getSupabaseClient()
      const { count } = await supabase
        .from('cache_entries')
        .select('*', { count: 'exact', head: true })

      // Get pattern distribution
      const { data: keys } = await supabase
        .from('cache_entries')
        .select('key')

      const patternMatches: Record<string, number> = {}
      
      keys?.forEach(entry => {
        const key = entry.key
        const pattern = key.split(':')[0] + ':*'
        patternMatches[pattern] = (patternMatches[pattern] || 0) + 1
      })

      return {
        totalKeys: count || 0,
        patternMatches,
        lastInvalidation: new Date().toISOString()
      }
    } catch (error) {
      console.error('Error getting invalidation stats:', error)
      return {
        totalKeys: 0,
        patternMatches: {},
        lastInvalidation: null
      }
    }
  }
}
