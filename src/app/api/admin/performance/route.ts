import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { withAdminOptimization } from '@/middleware/api-optimization'
import { ServerPerformanceMonitor } from '@/lib/server-performance-monitor'
import { QueryCache } from '@/lib/cache/query-cache'
import { CompressionMonitor } from '@/middleware/compression'
import { RateLimitMonitor } from '@/middleware/rate-limit'
import { CachePerformanceMonitor } from '@/middleware/cdn-headers'

/**
 * Performance dashboard endpoint for monitoring API optimizations
 * Provides comprehensive metrics on all optimization efforts
 */
const performanceDashboardHandler = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    const timeWindow = searchParams.get('timeWindow') 
      ? parseInt(searchParams.get('timeWindow')!) * 1000 
      : 5 * 60 * 1000 // Default: 5 minutes

    console.log('📊 Performance dashboard requested by:', request.userProfile?.email)

    // Gather all performance metrics
    const [
      serverStats,
      systemHealth,
      cacheStats,
      compressionStats,
      rateLimitStats,
      cdnCacheStats
    ] = await Promise.all([
      getServerPerformanceStats(timeWindow),
      getSystemHealthStats(),
      getCachePerformanceStats(),
      getCompressionStats(),
      getRateLimitStats(),
      getCDNCacheStats()
    ])

    // Calculate optimization impact
    const optimizationImpact = calculateOptimizationImpact(serverStats)

    const dashboardData = {
      timestamp: new Date().toISOString(),
      timeWindow: timeWindow / 1000, // Convert back to seconds
      overview: {
        status: getOverallStatus(serverStats, systemHealth),
        totalRequests: serverStats.totalRequests,
        averageResponseTime: Math.round(serverStats.averageResponseTime),
        errorRate: Math.round(serverStats.errorRate * 100) / 100,
        optimizationScore: calculateOptimizationScore(serverStats, cacheStats, compressionStats)
      },
      performance: {
        server: serverStats,
        system: systemHealth,
        optimization: optimizationImpact
      },
      optimizations: {
        compression: compressionStats,
        caching: {
          query: cacheStats,
          cdn: cdnCacheStats
        },
        rateLimit: rateLimitStats
      },
      endpoints: {
        slowest: serverStats.slowestEndpoints,
        fastest: serverStats.fastestEndpoints
      },
      recommendations: generateRecommendations(serverStats, cacheStats, compressionStats)
    }

    return NextResponse.json({
      success: true,
      data: dashboardData
    }, {
      headers: {
        'Cache-Control': 'private, max-age=30, must-revalidate',
        'X-Dashboard-Generated': new Date().toISOString()
      }
    })

  } catch (error) {
    console.error('Performance dashboard error:', error)
    return NextResponse.json(
      { error: 'Failed to generate performance dashboard' },
      { status: 500 }
    )
  }
})

/**
 * Get server performance statistics
 */
async function getServerPerformanceStats(timeWindow: number) {
  try {
    return ServerPerformanceMonitor.getStats(timeWindow)
  } catch (error) {
    console.error('Failed to get server performance stats:', error)
    return {
      totalRequests: 0,
      averageResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      errorRate: 0,
      cacheHitRate: 0,
      compressionRate: 0,
      slowestEndpoints: [],
      fastestEndpoints: []
    }
  }
}

/**
 * Get system health statistics
 */
async function getSystemHealthStats() {
  try {
    return ServerPerformanceMonitor.getSystemHealth()
  } catch (error) {
    console.error('Failed to get system health stats:', error)
    return {
      memory: { heapUsed: 0, heapTotal: 0, external: 0, rss: 0 },
      uptime: 0,
      nodeVersion: process.version
    }
  }
}

/**
 * Get cache performance statistics
 */
async function getCachePerformanceStats() {
  try {
    return QueryCache.getStats()
  } catch (error) {
    console.error('Failed to get cache performance stats:', error)
    return {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalKeys: 0
    }
  }
}

/**
 * Get compression statistics
 */
async function getCompressionStats() {
  try {
    return CompressionMonitor.getStats()
  } catch (error) {
    console.error('Failed to get compression stats:', error)
    return {
      totalRequests: 0,
      compressedRequests: 0,
      compressionRate: 0,
      averageCompressionRatio: 0,
      totalBytesSaved: 0
    }
  }
}

/**
 * Get rate limiting statistics
 */
async function getRateLimitStats() {
  try {
    return RateLimitMonitor.getStats()
  } catch (error) {
    console.error('Failed to get rate limit stats:', error)
    return {
      totalRequests: 0,
      blockedRequests: 0,
      blockRate: 0,
      uniqueIPs: 0,
      topBlockedIPs: []
    }
  }
}

/**
 * Get CDN cache statistics
 */
async function getCDNCacheStats() {
  try {
    return CachePerformanceMonitor.getMetrics()
  } catch (error) {
    console.error('Failed to get CDN cache stats:', error)
    return {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheBypass: 0,
      cacheHitRate: 0,
      avgResponseTime: 0
    }
  }
}

/**
 * Calculate optimization impact
 */
function calculateOptimizationImpact(serverStats: any) {
  const baseline = {
    averageResponseTime: 4200, // Pre-optimization baseline (analytics endpoint)
    errorRate: 5,
    cacheHitRate: 0
  }

  return {
    responseTimeImprovement: baseline.averageResponseTime > 0 
      ? ((baseline.averageResponseTime - serverStats.averageResponseTime) / baseline.averageResponseTime) * 100
      : 0,
    errorRateImprovement: baseline.errorRate > 0
      ? ((baseline.errorRate - serverStats.errorRate) / baseline.errorRate) * 100
      : 0,
    cacheEfficiency: serverStats.cacheHitRate,
    compressionEfficiency: serverStats.compressionRate
  }
}

/**
 * Calculate overall optimization score
 */
function calculateOptimizationScore(serverStats: any, cacheStats: any, compressionStats: any): number {
  const weights = {
    responseTime: 0.3,
    cacheHit: 0.25,
    compression: 0.2,
    errorRate: 0.25
  }

  // Normalize metrics to 0-100 scale
  const responseTimeScore = Math.max(0, 100 - (serverStats.averageResponseTime / 50)) // 5s = 0 points
  const cacheHitScore = serverStats.cacheHitRate
  const compressionScore = compressionStats.compressionRate || 0
  const errorRateScore = Math.max(0, 100 - (serverStats.errorRate * 10)) // 10% error = 0 points

  return Math.round(
    responseTimeScore * weights.responseTime +
    cacheHitScore * weights.cacheHit +
    compressionScore * weights.compression +
    errorRateScore * weights.errorRate
  )
}

/**
 * Get overall system status
 */
function getOverallStatus(serverStats: any, systemHealth: any): 'healthy' | 'degraded' | 'unhealthy' {
  if (serverStats.averageResponseTime > 5000 || serverStats.errorRate > 10 || systemHealth.memory.heapUsed > 1000) {
    return 'unhealthy'
  }
  if (serverStats.averageResponseTime > 2000 || serverStats.errorRate > 5 || systemHealth.memory.heapUsed > 500) {
    return 'degraded'
  }
  return 'healthy'
}

/**
 * Generate optimization recommendations
 */
function generateRecommendations(serverStats: any, cacheStats: any, compressionStats: any): string[] {
  const recommendations: string[] = []

  if (serverStats.averageResponseTime > 2000) {
    recommendations.push('Consider optimizing slow endpoints or adding more aggressive caching')
  }

  if (serverStats.cacheHitRate < 50) {
    recommendations.push('Cache hit rate is low - review cache TTL settings and cache key strategies')
  }

  if (compressionStats.compressionRate < 70) {
    recommendations.push('Compression rate is low - ensure compression is enabled for all JSON responses')
  }

  if (serverStats.errorRate > 2) {
    recommendations.push('Error rate is elevated - investigate error patterns and add better error handling')
  }

  if (serverStats.slowestEndpoints.length > 0) {
    const slowest = serverStats.slowestEndpoints[0]
    if (slowest.averageTime > 3000) {
      recommendations.push(`Optimize ${slowest.endpoint} - currently averaging ${Math.round(slowest.averageTime)}ms`)
    }
  }

  if (recommendations.length === 0) {
    recommendations.push('All optimizations are performing well! 🎉')
  }

  return recommendations
}

// Apply comprehensive optimization
export const GET = withAdminOptimization(performanceDashboardHandler)
