import { NextRequest, NextResponse } from 'next/server'
import { weeklyStatsService, userService } from '@/lib/database'
import { supabaseClient } from '@/lib/supabase'
import { getWeekNumber } from '@/lib/utils'
import { withErrorHandling, createSuccessResponse } from '@/lib/api-middleware'
import { multiLayerCache } from '@/lib/cache/enhanced-cache'

export const GET = withErrorHandling(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const weekParam = searchParams.get('week')
  const limitParam = searchParams.get('limit')
  const pageParam = searchParams.get('page')
  const typeParam = searchParams.get('type') // 'weekly' or 'alltime'

  const currentWeek = weekParam ? parseInt(weekParam) : getWeekNumber(new Date())
  const limit = limitParam ? parseInt(limitParam) : 20 // Default to 20 users for better UX
  const page = pageParam ? parseInt(pageParam) : 1
  const offset = (page - 1) * limit
  const type = typeParam || 'both' // 'weekly', 'alltime', or 'both'

  // Create cache key based on parameters
  const cacheKey = `leaderboard:${currentWeek}:${limit}:${page}:${type}`

  try {
    // Check multi-layer cache first
    let data = await multiLayerCache.get(cacheKey)

    if (!data) {
      // Cache miss - fetch from database
      data = await fetchLeaderboardFromDatabase(currentWeek, limit, page, offset, type)

      // Store in multi-layer cache for future requests (5 minutes TTL)
      await multiLayerCache.set(cacheKey, data, 300)
    }

    // Return response with CDN cache headers
    // Vercel will automatically cache this at the edge
    return NextResponse.json({ success: true, data }, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
        'X-Cache-Layer': 'Multi-Layer',
        'X-Cache-Key': cacheKey
      }
    })
  } catch (error) {
    console.error('Leaderboard API error:', error)
    throw error // Let withErrorHandling handle the error response
  }
})

async function fetchLeaderboardFromDatabase(currentWeek: number, limit: number, page: number, offset: number, type: string) {

  // Conditionally fetch data based on type
  let weeklyStats: any[] = []
  let weeklyStatsCount = 0
  let allTimeUsers: any[] = []
  let allTimeUsersCount = 0
  let weeklySubmissionCounts: any = { data: [] }
  let weeklyLegacySubmissionCounts: any = { data: [] }

  if (type === 'weekly' || type === 'both') {
    // Get weekly leaderboard with pagination and counts
    const weeklyPromises = await Promise.all([
      weeklyStatsService.findLeaderboard(currentWeek, limit, type === 'weekly' ? offset : 0),
      weeklyStatsService.countByWeek(currentWeek),
      supabaseClient
        .from('Submission')
        .select('userId')
        .eq('weekNumber', currentWeek),
      supabaseClient
        .from('LegacySubmission')
        .select('discordHandle')
    ])

    weeklyStats = weeklyPromises[0]
    weeklyStatsCount = weeklyPromises[1]
    weeklySubmissionCounts = weeklyPromises[2]
    weeklyLegacySubmissionCounts = weeklyPromises[3]
  }

  if (type === 'alltime' || type === 'both') {
    // Get all-time leaderboard (top users by total XP) with pagination
    const allTimePromises = await Promise.all([
      userService.findTopUsers(limit, type === 'alltime' ? offset : 0),
      userService.countAll()
    ])

    allTimeUsers = allTimePromises[0]
    allTimeUsersCount = allTimePromises[1]
  }

  const submissionCountsByUser = weeklySubmissionCounts.data?.reduce((acc, sub) => {
    acc[sub.userId] = (acc[sub.userId] || 0) + 1
    return acc
  }, {} as Record<string, number>) || {}

  // Add legacy submissions by discord handle (since legacy data doesn't have userId)
  const legacySubmissionsByUsername = weeklyLegacySubmissionCounts.data?.reduce((acc, sub) => {
    acc[sub.discordHandle] = (acc[sub.discordHandle] || 0) + 1
    return acc
  }, {} as Record<string, number>) || {}

  // Transform weekly data for frontend
  const topPerformers = weeklyStats.map((stat, index) => ({
    rank: (type === 'weekly' ? offset : 0) + index + 1, // Account for pagination offset
    username: stat.user.username,
    totalXp: stat.user.totalXp,
    weeklyXp: stat.xpTotal,
    streak: stat.earnedStreak ? 1 : 0, // TODO: Calculate actual streak
    submissions: (submissionCountsByUser[stat.userId] || 0) + (legacySubmissionsByUsername[stat.user.username] || 0),
    reviews: stat.reviewsDone
  }))

  // Calculate weekly stats
  const activeParticipants = weeklyStats.length
  const totalXpAwarded = weeklyStats.reduce((sum, stat) => sum + stat.xpTotal, 0)
  const averageXp = activeParticipants > 0 ? totalXpAwarded / activeParticipants : 0

  // Get total submission counts for all users (both regular and legacy)
  const [allSubmissions, allLegacySubmissions] = await Promise.all([
    supabaseClient
      .from('Submission')
      .select('userId'),
    supabaseClient
      .from('LegacySubmission')
      .select('discordHandle')
  ])

  const totalSubmissionsByUser = allSubmissions.data?.reduce((acc, sub) => {
    acc[sub.userId] = (acc[sub.userId] || 0) + 1
    return acc
  }, {} as Record<string, number>) || {}

  const totalLegacySubmissionsByUsername = allLegacySubmissions.data?.reduce((acc, sub) => {
    acc[sub.discordHandle] = (acc[sub.discordHandle] || 0) + 1
    return acc
  }, {} as Record<string, number>) || {}

  // Get total review counts for all users
  const allReviews = await supabaseClient
    .from('PeerReview')
    .select('reviewerId')

  const totalReviewsByUser = allReviews.data?.reduce((acc, review) => {
    acc[review.reviewerId] = (acc[review.reviewerId] || 0) + 1
    return acc
  }, {} as Record<string, number>) || {}

  const allTimeLeaders = allTimeUsers.map((user, index) => ({
    rank: (type === 'alltime' ? offset : 0) + index + 1, // Account for pagination offset
    username: user.username,
    totalXp: user.totalXp,
    weeklyXp: 0, // Not applicable for all-time
    streak: 0, // TODO: Calculate actual streak
    submissions: (totalSubmissionsByUser[user.id] || 0) + (user.username ? totalLegacySubmissionsByUsername[user.username] || 0 : 0),
    reviews: totalReviewsByUser[user.id] || 0
  }))

  // Calculate pagination metadata
  const weeklyTotalPages = Math.ceil(weeklyStatsCount / limit)
  const allTimeTotalPages = Math.ceil(allTimeUsersCount / limit)

  return {
    weeklyStats: {
      activeParticipants,
      totalXpAwarded,
      averageXp,
      topPerformers,
      pagination: {
        page,
        limit,
        totalCount: weeklyStatsCount,
        totalPages: weeklyTotalPages,
        hasNextPage: page < weeklyTotalPages,
        hasPrevPage: page > 1
      }
    },
    allTimeLeaders,
    allTimePagination: {
      page,
      limit,
      totalCount: allTimeUsersCount,
      totalPages: allTimeTotalPages,
      hasNextPage: page < allTimeTotalPages,
      hasPrevPage: page > 1
    }
  }
}

