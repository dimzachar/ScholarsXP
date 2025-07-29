/**
 * Admin Merge Statistics API
 * 
 * Provides real-time merge statistics for the admin dashboard
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const timeframe = searchParams.get('timeframe') || 'day'
    
    const supabase = createServiceClient()
    
    // Calculate timeframe duration
    let intervalString = '1 day'
    switch (timeframe) {
      case 'hour':
        intervalString = '1 hour'
        break
      case 'week':
        intervalString = '7 days'
        break
      case 'month':
        intervalString = '30 days'
        break
      default:
        intervalString = '1 day'
    }
    
    // Get merge statistics
    const { data: merges, error } = await supabase
      .from('UserMergeHistory')
      .select('status, processingTimeMs, transactionsTransferred, xpTransferred, startedAt')
      .gte('startedAt', new Date(Date.now() - getTimeframeMs(timeframe)).toISOString())
    
    if (error) {
      console.error('Error fetching merge statistics:', error)
      return NextResponse.json({
        error: 'Failed to fetch merge statistics'
      }, { status: 500 })
    }
    
    // Calculate statistics
    const totalMerges = merges?.length || 0
    const completedMerges = merges?.filter(m => m.status === 'COMPLETED').length || 0
    const failedMerges = merges?.filter(m => m.status === 'FAILED').length || 0
    const inProgressMerges = merges?.filter(m => m.status === 'IN_PROGRESS').length || 0
    
    const successRate = totalMerges > 0 ? completedMerges / totalMerges : 1
    const errorRate = totalMerges > 0 ? failedMerges / totalMerges : 0
    
    const processingTimes = merges?.filter(m => m.processingTimeMs).map(m => m.processingTimeMs) || []
    const averageProcessingTime = processingTimes.length > 0 
      ? processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length 
      : 0
    
    const totalTransactionsTransferred = merges?.reduce((sum, m) => sum + (m.transactionsTransferred || 0), 0) || 0
    const totalXpTransferred = merges?.reduce((sum, m) => sum + (m.xpTransferred || 0), 0) || 0
    
    // Calculate recent failures (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: recentFailures } = await supabase
      .from('UserMergeHistory')
      .select('id')
      .eq('status', 'FAILED')
      .gte('startedAt', oneHourAgo)
    
    const recentFailureCount = recentFailures?.length || 0
    
    // Calculate performance score (0-100)
    let performanceScore = 100
    performanceScore -= (1 - successRate) * 40 // Success rate impact (40%)
    performanceScore -= errorRate * 30 // Error rate impact (30%)
    if (averageProcessingTime > 10000) { // 10 seconds
      const timeScore = Math.min((averageProcessingTime - 10000) / 20000, 1) * 20
      performanceScore -= timeScore // Processing time impact (20%)
    }
    if (recentFailureCount > 0) {
      const failureScore = Math.min(recentFailureCount / 10, 1) * 10
      performanceScore -= failureScore // Recent failures impact (10%)
    }
    performanceScore = Math.max(0, Math.round(performanceScore))
    
    const statistics = {
      totalMerges,
      completed: completedMerges,
      failed: failedMerges,
      inProgress: inProgressMerges,
      successRate,
      errorRate,
      averageProcessingTime,
      totalTransactionsTransferred,
      totalXpTransferred,
      recentFailures: recentFailureCount,
      performanceScore
    }
    
    return NextResponse.json({
      success: true,
      timeframe,
      statistics
    })
    
  } catch (error) {
    console.error('Merge statistics API error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

function getTimeframeMs(timeframe: string): number {
  switch (timeframe) {
    case 'hour': return 60 * 60 * 1000
    case 'day': return 24 * 60 * 60 * 1000
    case 'week': return 7 * 24 * 60 * 60 * 1000
    case 'month': return 30 * 24 * 60 * 60 * 1000
    default: return 24 * 60 * 60 * 1000
  }
}
