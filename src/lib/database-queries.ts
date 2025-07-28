// Load environment variables if not already loaded
if (!process.env.NEXT_PUBLIC_SUPABASE_URL && typeof window === 'undefined') {
  require('dotenv').config()
}

import { createClient } from '@supabase/supabase-js'

// Use service role key for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface AnalyticsMetrics {
  total_users: number
  active_users: number
  total_submissions: number
  completed_submissions: number
  total_reviews: number
  total_xp_awarded: number
  total_achievements: number
  pending_flags: number
}

export interface ConsolidatedAnalyticsResult {
  metrics: AnalyticsMetrics
  executionTime: number
  queryType: 'consolidated' | 'fallback'
}

/**
 * Get consolidated analytics using a single optimized CTE query
 * This replaces 8 separate database queries with one efficient query
 */
export async function getConsolidatedAnalytics(
  startDate: Date,
  weekAgo: Date,
  timeframe: string = 'last_30_days'
): Promise<ConsolidatedAnalyticsResult> {
  const startTime = Date.now()
  
  try {
    // Build the consolidated CTE query
    const query = buildConsolidatedQuery(timeframe)
    
    // Execute the query with parameters
    const { data, error } = await supabaseAdmin.rpc('get_consolidated_analytics', {
      start_date: timeframe === 'all_time' ? null : startDate.toISOString(),
      week_ago: weekAgo.toISOString()
    })

    if (error) {
      console.error('Consolidated analytics query failed:', error)
      throw new Error(`Analytics query failed: ${error.message}`)
    }

    if (!data || data.length === 0) {
      throw new Error('No data returned from consolidated analytics query')
    }

    const metrics = data[0] as AnalyticsMetrics
    const executionTime = Date.now() - startTime

    console.log(`📊 Consolidated analytics query completed in ${executionTime}ms`)

    return {
      metrics,
      executionTime,
      queryType: 'consolidated'
    }
  } catch (error) {
    console.error('Error in getConsolidatedAnalytics:', error)
    throw error
  }
}

/**
 * Fallback function using original separate queries for comparison/rollback
 */
export async function getFallbackAnalytics(
  startDate: Date,
  weekAgo: Date,
  timeframe: string = 'last_30_days'
): Promise<ConsolidatedAnalyticsResult> {
  const startTime = Date.now()
  
  try {
    console.log('🔄 Using fallback analytics queries')
    
    // Execute the original 8 separate queries
    const [
      totalUsersResult,
      activeUsersResult,
      totalSubmissionsResult,
      completedSubmissionsResult,
      totalReviewsResult,
      totalXpResult,
      totalAchievementsResult,
      pendingFlagsResult
    ] = await Promise.all([
      // Total users
      supabaseAdmin.from('User').select('*', { count: 'exact', head: true }),

      // Active users (last 7 days)
      supabaseAdmin.from('User').select('*', { count: 'exact', head: true })
        .gte('lastActiveAt', weekAgo.toISOString()),

      // Total submissions
      timeframe === 'all_time'
        ? supabaseAdmin.from('Submission').select('*', { count: 'exact', head: true })
        : supabaseAdmin.from('Submission').select('*', { count: 'exact', head: true })
            .gte('createdAt', startDate.toISOString()),

      // Completed submissions
      timeframe === 'all_time'
        ? supabaseAdmin.from('Submission').select('*', { count: 'exact', head: true })
            .eq('status', 'FINALIZED')
        : supabaseAdmin.from('Submission').select('*', { count: 'exact', head: true })
            .eq('status', 'FINALIZED').gte('createdAt', startDate.toISOString()),

      // Total reviews
      timeframe === 'all_time'
        ? supabaseAdmin.from('PeerReview').select('*', { count: 'exact', head: true })
        : supabaseAdmin.from('PeerReview').select('*', { count: 'exact', head: true })
            .gte('createdAt', startDate.toISOString()),

      // Total XP awarded
      timeframe === 'all_time'
        ? supabaseAdmin.from('XpTransaction').select('amount').gt('amount', 0)
        : supabaseAdmin.from('XpTransaction').select('amount').gt('amount', 0)
            .gte('createdAt', startDate.toISOString()),

      // Total achievements
      timeframe === 'all_time'
        ? supabaseAdmin.from('UserAchievement').select('*', { count: 'exact', head: true })
        : supabaseAdmin.from('UserAchievement').select('*', { count: 'exact', head: true })
            .gte('earnedAt', startDate.toISOString()),

      // Pending flags
      supabaseAdmin.from('ContentFlag').select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING')
    ])

    // Calculate total XP awarded
    const totalXpAwarded = totalXpResult.data?.reduce((sum, transaction) => 
      sum + (transaction.amount || 0), 0) || 0

    const metrics: AnalyticsMetrics = {
      total_users: totalUsersResult.count || 0,
      active_users: activeUsersResult.count || 0,
      total_submissions: totalSubmissionsResult.count || 0,
      completed_submissions: completedSubmissionsResult.count || 0,
      total_reviews: totalReviewsResult.count || 0,
      total_xp_awarded: totalXpAwarded,
      total_achievements: totalAchievementsResult.count || 0,
      pending_flags: pendingFlagsResult.count || 0
    }

    const executionTime = Date.now() - startTime
    console.log(`📊 Fallback analytics queries completed in ${executionTime}ms`)

    return {
      metrics,
      executionTime,
      queryType: 'fallback'
    }
  } catch (error) {
    console.error('Error in getFallbackAnalytics:', error)
    throw error
  }
}

/**
 * Build the consolidated CTE query based on timeframe
 */
function buildConsolidatedQuery(timeframe: string): string {
  const isAllTime = timeframe === 'all_time'
  
  return `
    WITH analytics_data AS (
      SELECT 
        COUNT(DISTINCT u.id) as total_users,
        COUNT(DISTINCT CASE WHEN u."lastActiveAt" >= $2 THEN u.id END) as active_users,
        COUNT(DISTINCT CASE WHEN ${isAllTime ? 'TRUE' : 's."createdAt" >= $1'} THEN s.id END) as total_submissions,
        COUNT(DISTINCT CASE WHEN s.status = 'FINALIZED' AND ${isAllTime ? 'TRUE' : 's."createdAt" >= $1'} THEN s.id END) as completed_submissions,
        COUNT(DISTINCT CASE WHEN ${isAllTime ? 'TRUE' : 'pr."createdAt" >= $1'} THEN pr.id END) as total_reviews,
        COALESCE(SUM(CASE WHEN xt.amount > 0 AND ${isAllTime ? 'TRUE' : 'xt."createdAt" >= $1'} THEN xt.amount END), 0) as total_xp_awarded,
        COUNT(DISTINCT CASE WHEN ${isAllTime ? 'TRUE' : 'ua."earnedAt" >= $1'} THEN ua.id END) as total_achievements,
        COUNT(DISTINCT CASE WHEN cf.status = 'PENDING' THEN cf.id END) as pending_flags
      FROM "User" u
      LEFT JOIN "Submission" s ON u.id = s."userId"
      LEFT JOIN "PeerReview" pr ON u.id = pr."reviewerId"
      LEFT JOIN "XpTransaction" xt ON u.id = xt."userId"
      LEFT JOIN "UserAchievement" ua ON u.id = ua."userId"
      LEFT JOIN "ContentFlag" cf ON s.id = cf."submissionId"
    )
    SELECT * FROM analytics_data;
  `
}

/**
 * Compare results between consolidated and fallback queries for testing
 */
export async function compareAnalyticsResults(
  startDate: Date,
  weekAgo: Date,
  timeframe: string = 'last_30_days'
): Promise<{
  consolidated: ConsolidatedAnalyticsResult
  fallback: ConsolidatedAnalyticsResult
  matches: boolean
  differences: string[]
}> {
  try {
    const [consolidated, fallback] = await Promise.all([
      getConsolidatedAnalytics(startDate, weekAgo, timeframe),
      getFallbackAnalytics(startDate, weekAgo, timeframe)
    ])

    const differences: string[] = []
    const consolidatedMetrics = consolidated.metrics
    const fallbackMetrics = fallback.metrics

    // Compare each metric
    Object.keys(consolidatedMetrics).forEach(key => {
      const consolidatedValue = consolidatedMetrics[key as keyof AnalyticsMetrics]
      const fallbackValue = fallbackMetrics[key as keyof AnalyticsMetrics]
      
      if (consolidatedValue !== fallbackValue) {
        differences.push(`${key}: consolidated=${consolidatedValue}, fallback=${fallbackValue}`)
      }
    })

    const matches = differences.length === 0

    console.log(`📊 Analytics comparison: ${matches ? 'MATCH' : 'DIFFERENCES FOUND'}`)
    if (!matches) {
      console.log('Differences:', differences)
    }
    console.log(`Performance: consolidated=${consolidated.executionTime}ms, fallback=${fallback.executionTime}ms`)

    return {
      consolidated,
      fallback,
      matches,
      differences
    }
  } catch (error) {
    console.error('Error comparing analytics results:', error)
    throw error
  }
}
