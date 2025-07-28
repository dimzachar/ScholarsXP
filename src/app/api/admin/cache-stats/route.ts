import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { multiLayerCache } from '@/lib/cache/enhanced-cache'
import { CacheHealthCheck } from '@/lib/cache/health-check'
import { CacheInvalidation } from '@/lib/cache/invalidation'

export const GET = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    const detailed = searchParams.get('detailed') === 'true'
    const includeHealth = searchParams.get('health') !== 'false'

    // Get basic cache statistics
    const stats = multiLayerCache.getStats()

    let healthCheck = null
    if (includeHealth) {
      const healthChecker = new CacheHealthCheck(multiLayerCache)
      healthCheck = detailed 
        ? await healthChecker.getDetailedMetrics()
        : await healthChecker.performHealthCheck()
    }

    // Get invalidation statistics
    const invalidation = new CacheInvalidation(multiLayerCache)
    const invalidationStats = await invalidation.getInvalidationStats()

    // Generate performance recommendations
    const recommendations = generateRecommendations(stats, healthCheck)

    const response = {
      timestamp: new Date().toISOString(),
      cache: {
        memory: {
          size: stats.memory.size,
          calculatedSize: stats.memory.calculatedSize,
          maxSize: stats.memory.maxSize,
          utilizationPercent: ((stats.memory.calculatedSize / stats.memory.maxSize) * 100).toFixed(2),
          utilizationStatus: getUtilizationStatus(stats.memory.calculatedSize / stats.memory.maxSize)
        },
        monitoring: stats.monitoring || {},
        invalidation: invalidationStats
      },
      health: healthCheck,
      recommendations,
      system: {
        uptime: process.uptime(),
        nodeVersion: process.version,
        platform: process.platform,
        memoryUsage: process.memoryUsage()
      }
    }

    return NextResponse.json({
      success: true,
      data: response
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Cache-Stats-Version': '1.0'
      }
    })
  } catch (error) {
    console.error('Cache stats API error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: {
          message: 'Failed to fetch cache statistics',
          code: 'CACHE_STATS_ERROR',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    )
  }
})

export const POST = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const { action, pattern, userId } = await request.json()

    const invalidation = new CacheInvalidation(multiLayerCache)

    switch (action) {
      case 'invalidate_pattern':
        if (!pattern) {
          return NextResponse.json(
            { success: false, error: 'Pattern is required for invalidate_pattern action' },
            { status: 400 }
          )
        }
        await invalidation.invalidateByPattern(pattern)
        return NextResponse.json({
          success: true,
          message: `Cache invalidated for pattern: ${pattern}`
        })

      case 'invalidate_user':
        await invalidation.invalidateUserData(userId)
        return NextResponse.json({
          success: true,
          message: `User cache invalidated${userId ? ` for user: ${userId}` : ''}`
        })

      case 'invalidate_analytics':
        await invalidation.invalidateAnalytics()
        return NextResponse.json({
          success: true,
          message: 'Analytics cache invalidated'
        })

      case 'invalidate_leaderboard':
        await invalidation.invalidateLeaderboard()
        return NextResponse.json({
          success: true,
          message: 'Leaderboard cache invalidated'
        })

      case 'invalidate_all':
        await invalidation.invalidateAll()
        return NextResponse.json({
          success: true,
          message: 'All cache data cleared'
        })

      case 'health_check':
        const healthChecker = new CacheHealthCheck(multiLayerCache)
        const healthResult = await healthChecker.performHealthCheck()
        return NextResponse.json({
          success: true,
          data: healthResult
        })

      default:
        return NextResponse.json(
          { 
            success: false, 
            error: 'Invalid action. Supported actions: invalidate_pattern, invalidate_user, invalidate_analytics, invalidate_leaderboard, invalidate_all, health_check' 
          },
          { status: 400 }
        )
    }
  } catch (error) {
    console.error('Cache stats POST API error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: {
          message: 'Failed to perform cache operation',
          code: 'CACHE_OPERATION_ERROR',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    )
  }
})

function generateRecommendations(stats: any, healthCheck: any): string[] {
  const recommendations: string[] = []

  // Memory utilization recommendations
  const utilizationPercent = (stats.memory.calculatedSize / stats.memory.maxSize) * 100
  
  if (utilizationPercent > 90) {
    recommendations.push('CRITICAL: Memory cache is near capacity - increase max size or reduce TTL values immediately')
  } else if (utilizationPercent > 75) {
    recommendations.push('WARNING: Memory cache utilization is high - monitor closely and consider optimization')
  } else if (utilizationPercent < 20) {
    recommendations.push('INFO: Memory cache utilization is low - consider reducing max size to save memory')
  }

  // Hit rate recommendations
  if (stats.monitoring) {
    Object.entries(stats.monitoring).forEach(([layer, metrics]: [string, any]) => {
      if (metrics.hitRate < 0.8) {
        recommendations.push(`WARNING: ${layer} cache hit rate is low (${(metrics.hitRate * 100).toFixed(1)}%) - review caching strategy`)
      }
      
      if (metrics.avgResponseTime > 10) {
        recommendations.push(`WARNING: ${layer} cache response time is high (${metrics.avgResponseTime.toFixed(2)}ms) - investigate performance issues`)
      }
    })
  }

  // Health-based recommendations
  if (healthCheck?.recommendations) {
    recommendations.push(...healthCheck.recommendations)
  }

  // Performance recommendations
  if (healthCheck?.details?.performance?.details?.avgResponseTime > 50) {
    recommendations.push('CRITICAL: Cache performance is degraded - investigate database connectivity and optimize queries')
  }

  // Default recommendation if all is well
  if (recommendations.length === 0) {
    recommendations.push('✅ Cache system is operating optimally')
  }

  return recommendations
}

function getUtilizationStatus(utilization: number): string {
  if (utilization > 0.9) return 'critical'
  if (utilization > 0.75) return 'high'
  if (utilization > 0.5) return 'moderate'
  if (utilization > 0.2) return 'low'
  return 'minimal'
}
