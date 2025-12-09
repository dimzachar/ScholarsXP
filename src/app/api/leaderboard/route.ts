import { NextRequest, NextResponse } from 'next/server'
import { userService } from '@/lib/database'
import { prisma } from '@/lib/prisma'
import { getWeekNumber, getWeekBoundaries } from '@/lib/utils'
import { withErrorHandling } from '@/lib/api-middleware'
import { multiLayerCache } from '@/lib/cache/enhanced-cache'
import { withPublicOptimization } from '@/middleware/api-optimization'

const CACHE_VERSION = 'v9' // Fixed legacy submissions + cache bust

export const GET = withPublicOptimization(withErrorHandling(async (request: NextRequest) => {
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
  const cacheKey = `leaderboard:${CACHE_VERSION}:${currentWeek}:${limit}:${page}:${type}`

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
        'Cache-Control': 'no-store, max-age=0, s-maxage=0',
        'X-Cache-Layer': 'Multi-Layer',
        'X-Cache-Key': cacheKey,
        'X-Cache-Version': CACHE_VERSION
      }
    })
  } catch (error) {
    console.error('Leaderboard API error:', error)
    throw error // Let withErrorHandling handle the error response
  }
}))

async function fetchLeaderboardFromDatabase(currentWeek: number, limit: number, page: number, offset: number, type: string) {

  // Conditionally fetch data based on type
  let topPerformers: any[] = []
  let weeklyStatsCount = 0
  let weeklyTotalXpAwarded = 0
  let allTimeUsers: any[] = []
  let allTimeUsersCount = 0
  let allTimeTotalXp = 0
  let totalSubmissionsByUser: Record<string, number> = {}
  let totalLegacySubmissionsByUsername: Record<string, number> = {}
  let totalReviewsByUser: Record<string, number> = {}

  if (type === 'weekly' || type === 'both') {
    // Get weekly leaderboard from XpTransaction table (source of truth for all XP)
    // Single optimized query: gets XP totals, submission counts, review counts, and user details
    const weeklyOffset = type === 'weekly' ? offset : 0
    const currentYear = new Date().getFullYear()
    const { startDate, endDate } = getWeekBoundaries(currentWeek, currentYear)

    const [weeklyLeaderboard, weeklyTotals, legacySubmissions] = await Promise.all([
      // Paginated leaderboard with all data in one query
      prisma.$queryRaw<Array<{
        userId: string
        username: string | null
        totalXp: number
        streakWeeks: number
        weeklyXp: bigint
        submissions: bigint
        reviews: bigint
      }>>`
        SELECT 
          t."userId",
          u.username,
          u."totalXp",
          u."streakWeeks",
          SUM(t.amount) as "weeklyXp",
          COUNT(*) FILTER (WHERE t.type = 'SUBMISSION_REWARD') as submissions,
          COUNT(*) FILTER (WHERE t.type = 'REVIEW_REWARD') as reviews
        FROM "XpTransaction" t
        JOIN "User" u ON t."userId" = u.id
        WHERE t."weekNumber" = ${currentWeek}
        GROUP BY t."userId", u.username, u."totalXp", u."streakWeeks"
        ORDER BY SUM(t.amount) DESC
        LIMIT ${limit} OFFSET ${weeklyOffset}
      `,
      // Get totals for stats (count and sum)
      prisma.$queryRaw<Array<{ count: bigint; total: bigint }>>`
        SELECT COUNT(DISTINCT "userId") as count, COALESCE(SUM(amount), 0) as total
        FROM "XpTransaction"
        WHERE "weekNumber" = ${currentWeek}
      `,
      // Legacy submissions for the week
      prisma.$queryRaw`
        SELECT "discordHandle" 
        FROM "LegacySubmission"
        WHERE COALESCE("submittedAt", "importedAt") >= ${startDate}
        AND COALESCE("submittedAt", "importedAt") <= ${endDate}
      ` as Promise<Array<{ discordHandle: string | null }>>
    ])

    weeklyStatsCount = Number(weeklyTotals[0]?.count || 0)
    weeklyTotalXpAwarded = Number(weeklyTotals[0]?.total || 0)

    // Build legacy submission counts by username
    const legacySubmissionsByUsername = (legacySubmissions || []).reduce((acc: Record<string, number>, sub: any) => {
      if (sub.discordHandle) {
        acc[sub.discordHandle] = (acc[sub.discordHandle] || 0) + 1
      }
      return acc
    }, {} as Record<string, number>)

    // Transform to topPerformers format
    topPerformers = weeklyLeaderboard.map((row, index) => ({
      rank: weeklyOffset + index + 1,
      username: row.username || 'Unknown',
      totalXp: row.totalXp || 0,
      weeklyXp: Number(row.weeklyXp) || 0,
      streak: row.streakWeeks || 0,
      submissions: Number(row.submissions) + (legacySubmissionsByUsername[row.username || ''] || 0),
      reviews: Number(row.reviews) || 0
    }))
  }

  if (type === 'alltime' || type === 'both') {
    // Get all-time leaderboard (top users by total XP) with pagination
    const allTimePromises = await Promise.all([
      userService.findTopUsers(limit, type === 'alltime' ? offset : 0),
      userService.countAll(),
      userService.sumTotalXp()
    ])

    allTimeUsers = allTimePromises[0]
    allTimeUsersCount = allTimePromises[1]
    allTimeTotalXp = allTimePromises[2]

    const [submissionGroups, legacySubmissionGroups, reviewGroups] = await Promise.all([
      prisma.submission.groupBy({
        by: ['userId'],
        _count: { _all: true }
      }),
      prisma.legacySubmission.groupBy({
        by: ['discordHandle'],
        _count: { _all: true }
      }),
      prisma.peerReview.groupBy({
        by: ['reviewerId'],
        _count: { _all: true }
      })
    ])

    totalSubmissionsByUser = submissionGroups.reduce((acc, row) => {
      acc[row.userId] = row._count._all
      return acc
    }, {} as Record<string, number>)

    totalLegacySubmissionsByUsername = legacySubmissionGroups.reduce((acc, row) => {
      if (row.discordHandle) {
        acc[row.discordHandle] = row._count._all
      }
      return acc
    }, {} as Record<string, number>)

    totalReviewsByUser = reviewGroups.reduce((acc, row) => {
      acc[row.reviewerId] = row._count._all
      return acc
    }, {} as Record<string, number>)
  }

  // Get total submission counts for all users (both regular and legacy)
  const allTimeLeaders = allTimeUsers.map((user, index) => ({
    rank: (type === 'alltime' ? offset : 0) + index + 1,
    username: user.username,
    totalXp: user.totalXp,
    weeklyXp: 0,
    streak: 0,
    submissions: (totalSubmissionsByUser[user.id] || 0) + (user.username ? totalLegacySubmissionsByUsername[user.username] || 0 : 0),
    reviews: totalReviewsByUser[user.id] || 0
  }))

  // Calculate pagination metadata
  const weeklyTotalPages = Math.ceil(weeklyStatsCount / limit)
  const allTimeTotalPages = Math.ceil(allTimeUsersCount / limit)
  const weeklyAverageXp = weeklyStatsCount > 0 ? weeklyTotalXpAwarded / weeklyStatsCount : 0

  return {
    weeklyStats: {
      activeParticipants: weeklyStatsCount,
      totalXpAwarded: weeklyTotalXpAwarded,
      averageXp: weeklyAverageXp,
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
    allTimeStats: {
      activeParticipants: allTimeUsersCount,
      totalXpAwarded: allTimeTotalXp,
      averageXp: allTimeUsersCount > 0 ? allTimeTotalXp / allTimeUsersCount : 0
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

