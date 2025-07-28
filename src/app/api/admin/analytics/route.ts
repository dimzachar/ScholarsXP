import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { withAnalyticsOptimization } from '@/middleware/api-optimization'
import { getOptimizedAnalyticsSummary, AnalyticsResponseDTO } from '@/lib/queries/analytics-optimized'
import { supabaseClient } from '@/lib/supabase'
import { CacheKeys, CacheTTL } from '@/lib/cache'
import { multiLayerCache } from '@/lib/cache/enhanced-cache'
import { getConsolidatedAnalytics, getFallbackAnalytics, compareAnalyticsResults } from '@/lib/database-queries'

// Original handler (defined first for fallback)
const originalHandler = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    const timeframe = searchParams.get('timeframe') || 'last_30_days' // 'last_7_days', 'last_30_days', 'last_90_days', 'all_time'
    const metric = searchParams.get('metric') || 'overview' // 'overview', 'users', 'submissions', 'reviews', 'xp'

    // Feature flag for optimized analytics (default: false for safety)
    const useOptimizedAnalytics = process.env.USE_OPTIMIZED_ANALYTICS === 'true'
    const compareResults = process.env.COMPARE_ANALYTICS_RESULTS === 'true'

    // Check multi-layer cache first for complete analytics data
    const cacheKey = CacheKeys.analytics(`${timeframe}:${metric}:${useOptimizedAnalytics ? 'optimized' : 'legacy'}`)
    const cachedData = await multiLayerCache.get(cacheKey)

    if (cachedData) {
      return NextResponse.json({ success: true, data: cachedData }, {
        headers: {
          'Cache-Control': 'public, max-age=600, stale-while-revalidate=1200',
          'X-Cache': 'HIT',
          'X-Cache-Layer': 'Multi-Layer',
          'X-Cache-Key': cacheKey,
          'X-Analytics-Type': useOptimizedAnalytics ? 'optimized' : 'legacy'
        }
      })
    }

    // Calculate date ranges
    const now = new Date()
    let startDate: Date

    switch (timeframe) {
      case 'last_7_days':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'last_30_days':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case 'last_90_days':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = new Date('2020-01-01') // All time
    }

    // Use optimized or legacy analytics based on feature flag
    let analyticsData
    if (useOptimizedAnalytics) {
      console.log('📊 Using optimized analytics implementation')
      analyticsData = await getConsolidatedAnalytics(startDate, timeframe, metric)
    } else {
      console.log('📊 Using legacy analytics implementation')
      analyticsData = await getFallbackAnalytics(startDate, timeframe, metric)
    }

    // Cache the result
    await multiLayerCache.set(cacheKey, analyticsData, CacheTTL.ANALYTICS)

    return NextResponse.json({ success: true, data: analyticsData }, {
      headers: {
        'Cache-Control': 'public, max-age=600, stale-while-revalidate=1200',
        'X-Cache': 'MISS',
        'X-Cache-Layer': 'Multi-Layer',
        'X-Cache-Key': cacheKey,
        'X-Analytics-Type': useOptimizedAnalytics ? 'optimized' : 'legacy'
      }
    })

  } catch (error) {
    console.error('Analytics API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
})

// Optimized analytics handler with new implementation
const optimizedAnalyticsHandler = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    const timeframe = searchParams.get('timeframe') || 'last_30_days'

    // Use new optimized analytics query (enabled by default)
    const useNewOptimization = process.env.USE_NEW_ANALYTICS_OPTIMIZATION !== 'false'

    if (useNewOptimization) {
      console.log('🚀 Using new optimized analytics implementation')
      const startTime = Date.now()

      const analyticsData = await getOptimizedAnalyticsSummary(timeframe)

      const executionTime = Date.now() - startTime
      console.log(`⚡ New optimized analytics completed in ${executionTime}ms`)

      // Return optimized response with compression
      return NextResponse.json({
        success: true,
        data: analyticsData
      }, {
        headers: {
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
          'X-Cache': 'OPTIMIZED',
          'X-Execution-Time': executionTime.toString(),
          'X-Performance-Gain': 'new_optimization'
        }
      })
    }

    // Fall back to existing implementation
    console.log('🔄 Using legacy analytics implementation')
    return await originalHandler(request)
  } catch (error) {
    console.error('Analytics API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    )
  }
})

// Apply comprehensive optimization middleware
export const GET = withAnalyticsOptimization(optimizedAnalyticsHandler)
