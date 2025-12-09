import { prisma } from '@/lib/prisma'
import { QueryCache, CacheTTL, withQueryCache } from '../cache/query-cache'
import { PaginationParams, createPaginationResponse } from '../pagination'
import { DetailedLeaderboardDTO, DetailedSubmissionDTO, ResponseTransformer } from '@/types/api-responses'
import { getWeekNumber } from '@/lib/utils'

/**
 * Retry mechanism for database operations that might fail due to connection issues
 */
async function withRetry<T>(operation: () => Promise<T>, maxRetries: number = 3, delay: number = 1000): Promise<T> {
  let lastError: Error

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error

      // Only retry on connection-related errors
      if (error instanceof Error &&
          (error.message.includes('Max client connections reached') ||
           error.message.includes('connection') ||
           error.message.includes('timeout'))) {

        console.warn(`Database operation failed (attempt ${attempt}/${maxRetries}):`, error.message)

        if (attempt < maxRetries) {
          // Wait before retrying, with exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay * attempt))
          continue
        }
      }

      // If it's not a connection error or we've exhausted retries, throw immediately
      throw error
    }
  }

  throw lastError!
}

/**
 * Optimized leaderboard detailed query
 * Target: 10.5s → 2s (81% improvement), 45KB → 10KB (78% reduction)
 * Replaces multiple separate queries + N+1 problem with single optimized query
 */
export async function getOptimizedLeaderboardDetailed(
  filters: {
    week?: string
    user?: string
    taskType?: string
    platform?: string
    minXp?: string
    maxXp?: string
    status?: string
  },
  pagination: PaginationParams,
  options: {
    skipCache?: boolean
    refreshCache?: boolean
  } = {}
): Promise<DetailedLeaderboardDTO> {
  const cacheKey = QueryCache.createKey('leaderboard_detailed', { ...filters, ...pagination })
  const { skipCache = false, refreshCache = false } = options
  
  return await withQueryCache(
    cacheKey,
    CacheTTL.USER_LEADERBOARD,
    async () => {
      const startTime = Date.now()
      
      // Build optimized where clause
      const whereClause = buildOptimizedWhereClause(filters)
      
      // Single optimized query with proper joins and indexing
      const [submissions, totalCount] = await Promise.all([
        getOptimizedSubmissions(whereClause, pagination, filters),
        getSubmissionCount(whereClause, filters)
      ])

      // Get weekly stats efficiently (filtered if filters are applied)
      const weeklyStats = await getWeeklyStats(filters.week, filters)
      
      const executionTime = Date.now() - startTime
      console.log(`⚡ Optimized leaderboard detailed completed in ${executionTime}ms`)
      
      return {
        submissions: submissions.map(ResponseTransformer.toDetailedSubmissionDTO),
        totalCount,
        pagination: ResponseTransformer.toPaginationDTO(pagination.page, pagination.limit, totalCount),
        weeklyStats,
        filters: {
          applied: Object.values(filters).filter(v => v !== null && v !== '').length,
          ...filters
        }
      }
    },
    {
      logPerformance: true,
      skipCache,
      refreshCache
    }
  )
}

/**
 * Build optimized where clause with proper indexing for regular submissions
 */
function buildOptimizedWhereClause(filters: any): any {
  const where: any = {}

  if (filters.week) {
    where.weekNumber = parseInt(filters.week)
  }

  if (filters.user) {
    where.user = {
      username: {
        contains: filters.user,
        mode: 'insensitive'
      }
    }
  }

  if (filters.taskType && filters.taskType !== 'LEGACY') {
    where.taskTypes = {
      has: filters.taskType
    }
  }

  if (filters.platform && filters.platform !== 'LEGACY') {
    where.platform = filters.platform
  }

  if (filters.status) {
    where.status = filters.status
  }

  // XP filtering (using finalXp if available, otherwise aiXp)
  if (filters.minXp || filters.maxXp) {
    const xpFilter: any = {}
    if (filters.minXp) {
      xpFilter.gte = parseInt(filters.minXp)
    }
    if (filters.maxXp) {
      xpFilter.lte = parseInt(filters.maxXp)
    }

    where.OR = [
      { finalXp: xpFilter },
      {
        AND: [
          { finalXp: null },
          { aiXp: xpFilter }
        ]
      }
    ]
  }

  return where
}

/**
 * Build where clause for legacy submissions
 */
function buildLegacyWhereClause(filters: any): any {
  const where: any = {}

  // User filtering based on discordHandle
  if (filters.user) {
    where.discordHandle = {
      contains: filters.user,
      mode: 'insensitive'
    }
  }

  // Platform filtering - only include legacy if specifically requested or no platform filter
  if (filters.platform && filters.platform !== 'LEGACY') {
    // If a specific non-legacy platform is requested, exclude legacy submissions
    return { id: 'never-match' } // This will return no results
  }

  // Task type filtering - similar logic
  if (filters.taskType && filters.taskType !== 'LEGACY') {
    // If a specific non-legacy task type is requested, exclude legacy submissions
    return { id: 'never-match' } // This will return no results
  }

  // XP filtering for legacy submissions
  if (filters.minXp || filters.maxXp) {
    const xpFilter: any = {}
    if (filters.minXp) {
      xpFilter.gte = parseInt(filters.minXp)
    }
    if (filters.maxXp) {
      xpFilter.lte = parseInt(filters.maxXp)
    }

    where.OR = [
      { finalXp: xpFilter },
      {
        AND: [
          { finalXp: null },
          { aiXp: xpFilter }
        ]
      }
    ]
  }

  return where
}

/**
 * Get optimized submissions with single query and proper includes (including legacy submissions)
 */
async function getOptimizedSubmissions(whereClause: any, pagination: PaginationParams, filters: any) {
  const { page, limit } = pagination
  const offset = (page - 1) * limit

  try {
    // Get regular submissions and their total count with retry mechanism
    const regularSubmissionsPromise = withRetry(() => prisma.submission.findMany({
    where: whereClause,
    include: {
      user: {
        select: {
          username: true,
          email: true,
          role: true
        }
      },
      peerReviews: {
        select: {
          reviewerId: true,
          xpScore: true,
          reviewer: {
            select: {
              username: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      }
      // Removed: reviewAssignments, detailed metrics to reduce response size
    },
    orderBy: [
      { finalXp: 'desc' },
      { aiXp: 'desc' },
      { createdAt: 'desc' }
    ],
    take: limit,
    skip: offset
    }))
    const regularTotalCountPromise = withRetry(() => prisma.submission.count({ where: whereClause }))

    const [regularSubmissions, regularTotalCount] = await Promise.all([
      regularSubmissionsPromise,
      regularTotalCountPromise
    ])

    // Calculate how many legacy submissions we need
    const regularCount = regularSubmissions.length
    const remainingSlots = Math.max(0, limit - regularCount)

    // For legacy offset: account for regular submissions already skipped
    const legacyOffset = Math.max(0, offset - regularTotalCount)

    // Build where clause for legacy submissions
    const legacyWhereClause = buildLegacyWhereClause(filters)

    // Check if legacy submissions should be excluded based on filters
    const shouldExcludeLegacy = legacyWhereClause.id === 'never-match'

    // Fetch legacy submissions if we have remaining slots and they're not excluded by filters
    const shouldFetchLegacy = (remainingSlots > 0 || regularCount === 0) && !shouldExcludeLegacy
    const legacyLimit = shouldFetchLegacy ? (remainingSlots > 0 ? remainingSlots : limit) : 0

    const legacySubmissions = shouldFetchLegacy ? await withRetry(() => prisma.legacySubmission.findMany({
      where: legacyWhereClause,
      take: legacyLimit,
      skip: legacyOffset,
      select: {
        id: true,
        url: true,
        discordHandle: true,
        submittedAt: true,
        role: true,
        notes: true,
        importedAt: true,
        aiXp: true,
        peerXp: true,
        finalXp: true
      },
      orderBy: {
        submittedAt: 'desc'
      }
    })) : []



  // Convert legacy submissions to submission format
  const convertedLegacy = legacySubmissions.map(legacy => {
    // Calculate correct week number from submission timestamp
    const submissionDate = legacy.submittedAt || legacy.importedAt
    const weekNumber = submissionDate ? getWeekNumber(new Date(submissionDate)) : 1

    return {
      id: legacy.id,
      title: 'Legacy Submission',
      content: `Legacy submission from ${legacy.url}`,
      url: legacy.url,
      platform: 'LEGACY',
      taskTypes: ['LEGACY'],
      status: 'LEGACY_IMPORTED',
      aiXp: legacy.aiXp || 0,
      peerXp: legacy.peerXp || 0,
      finalXp: legacy.finalXp || 0,
      originalityScore: null,
      consensusScore: null,
      reviewCount: 0,
      flagCount: 0,
      createdAt: submissionDate,
      updatedAt: legacy.importedAt,
      weekNumber: weekNumber,
      reviewDeadline: null,
      user: {
        username: legacy.discordHandle || 'Legacy User',
        email: 'legacy@import.data',
        role: legacy.role || 'USER'
      },
      peerReviews: [] // Legacy submissions don't have peer reviews
    }
  })

  // Add reviewCount to regular submissions
  const regularWithReviewCount = regularSubmissions.map(submission => ({
    ...submission,
    reviewCount: submission.peerReviews?.length || 0
  }))

  // Combine regular and legacy submissions
  return [...regularWithReviewCount, ...convertedLegacy]

  } catch (error) {
    console.error('Error in getOptimizedSubmissions:', error)

    // If it's a connection error, throw a more specific error
    if (error instanceof Error && error.message.includes('Max client connections reached')) {
      throw new Error('Database connection pool exhausted. Please try again in a moment.')
    }

    // Re-throw the original error
    throw error
  }
}

/**
 * Get submission count efficiently with filtering
 */
async function getSubmissionCount(whereClause: any, filters: any): Promise<number> {
  // Properly serialize objects for cache key to avoid [object Object] issue - FIXED
  const cacheKey = QueryCache.createKey('submission_count', {
    whereClause: JSON.stringify(whereClause),
    filters: JSON.stringify(filters)
  })

  return await withQueryCache(
    cacheKey,
    CacheTTL.SUBMISSIONS_LIST,
    async () => {
      try {
        // Build legacy where clause
        const legacyWhereClause = buildLegacyWhereClause(filters)
        const shouldExcludeLegacy = legacyWhereClause.id === 'never-match'

        const [regularCount, legacyCount] = await Promise.all([
          withRetry(() => prisma.submission.count({ where: whereClause })),
          shouldExcludeLegacy ? Promise.resolve(0) : withRetry(() => prisma.legacySubmission.count({ where: legacyWhereClause }))
        ])

        return regularCount + legacyCount

      } catch (error) {
        console.error('Error in getSubmissionCount:', error)

        // If it's a connection error, return 0 to prevent complete failure
        if (error instanceof Error && error.message.includes('Max client connections reached')) {
          console.warn('Database connection pool exhausted in count query, returning 0')
          return 0
        }

        // Re-throw the original error
        throw error
      }
    }
  )
}

/**
 * Get weekly stats efficiently with caching (including legacy submissions)
 * Can be filtered or global based on filters parameter
 */
async function getWeeklyStats(week?: string, filters?: any) {
  const weekNumber = week ? parseInt(week) : getCurrentWeekNumber()

  // Create cache key that includes filters to ensure filtered stats are cached separately
  // Properly serialize filters to avoid [object Object] in cache key
  const filterString = filters ? JSON.stringify(filters) : 'null'
  const cacheKey = QueryCache.createKey('weekly_stats', { weekNumber, filters: filterString })

  return await withQueryCache(
    cacheKey,
    CacheTTL.ANALYTICS,
    async () => {
      // Build where clauses for filtering
      const regularWhereClause = buildOptimizedWhereClause(filters || {})
      const legacyWhereClause = buildLegacyWhereClause(filters || {})

      // Determine if we should filter by week or show stats across all filtered data
      const hasFilters = !!(filters && Object.values(filters).some(v => v !== null && v !== ''))

      if (!hasFilters) {
        // No filters applied - use current week stats
        regularWhereClause.weekNumber = weekNumber
        // Note: Legacy submissions don't have weekNumber field - we'll filter in memory
      } else if (week) {
        // Specific week requested with filters - use week-based stats
        regularWhereClause.weekNumber = weekNumber
        // Note: Legacy submissions don't have weekNumber field - we'll filter in memory
      }
      // If filters are applied but no specific week, calculate stats across all filtered data (don't add weekNumber)

      // Don't filter out submissions with finalXp = 0, only filter out null values
      // This ensures we count all submissions including those with 0 XP

      // Skip legacy submissions if they should be excluded by filters
      const shouldExcludeLegacy = legacyWhereClause.id === 'never-match'

      // Get stats from regular submissions
      const [regularStats, regularTopPerformer] = await Promise.all([
        withRetry(() => prisma.submission.aggregate({
          where: regularWhereClause,
          _count: {
            id: true
          },
          _avg: {
            finalXp: true
          },
          _sum: {
            finalXp: true
          }
        })),
        withRetry(() => prisma.submission.findFirst({
          where: regularWhereClause,
          include: {
            user: {
              select: {
                username: true
              }
            }
          },
          orderBy: {
            finalXp: 'desc'
          }
        }))
      ])

      // Get stats from legacy submissions (if not excluded)
      // Note: Legacy submissions don't have weekNumber field, so we need to filter in memory
      let legacyStats = { _count: { id: 0 }, _avg: { finalXp: 0 }, _sum: { finalXp: 0 } }
      let legacyTopPerformer = null

      if (!shouldExcludeLegacy) {
        // Create a safe where clause without weekNumber
        const safeLegacyWhereClause = { ...legacyWhereClause }
        delete safeLegacyWhereClause.weekNumber

        // Fetch legacy submissions and filter by week in memory if needed
        const legacySubmissions = await withRetry(() => prisma.legacySubmission.findMany({
          where: safeLegacyWhereClause,
          select: {
            id: true,
            finalXp: true,
            discordHandle: true,
            submittedAt: true,
            importedAt: true
          }
        }))

        // Filter by week in memory if week filtering is needed
        const filteredLegacySubmissions = legacySubmissions.filter(submission => {
          if (!hasFilters && !week) return true // No week filtering needed
          if (!week) return true // No specific week requested

          const submissionDate = submission.submittedAt || submission.importedAt
          if (!submissionDate) return false

          const submissionWeekNumber = getWeekNumber(new Date(submissionDate))
          return submissionWeekNumber === weekNumber
        })

        // Calculate stats manually
        const validSubmissions = filteredLegacySubmissions.filter(s => s.finalXp !== null)
        const totalXp = validSubmissions.reduce((sum, s) => sum + (s.finalXp || 0), 0)

        legacyStats = {
          _count: { id: filteredLegacySubmissions.length },
          _avg: { finalXp: validSubmissions.length > 0 ? totalXp / validSubmissions.length : 0 },
          _sum: { finalXp: totalXp }
        }

        // Find top performer
        if (filteredLegacySubmissions.length > 0) {
          const topSubmission = filteredLegacySubmissions.reduce((max, current) =>
            (current.finalXp || 0) > (max.finalXp || 0) ? current : max
          )
          if (topSubmission.finalXp && topSubmission.finalXp > 0) {
            legacyTopPerformer = topSubmission
          }
        }
      }

      // Combine stats
      const totalSubmissions = regularStats._count.id + legacyStats._count.id
      const totalXpSum = (regularStats._sum.finalXp || 0) + (legacyStats._sum.finalXp || 0)
      const averageXp = totalSubmissions > 0 ? totalXpSum / totalSubmissions : 0

      // Determine top performer
      let topPerformer = 'N/A'
      const regularTopXp = regularTopPerformer?.finalXp || 0
      const legacyTopXp = legacyTopPerformer?.finalXp || 0

      if (regularTopXp >= legacyTopXp && regularTopPerformer) {
        topPerformer = regularTopPerformer.user.username
      } else if (legacyTopXp > 0 && legacyTopPerformer) {
        topPerformer = legacyTopPerformer.discordHandle || 'Legacy User'
      }

      return {
        totalSubmissions,
        averageXp: Math.round(averageXp * 10) / 10,
        topPerformer,
        weekNumber,
        isFiltered: !!(filters && Object.values(filters).some(v => v !== null && v !== ''))
      }
    }
  )
}

/**
 * Get current week number (uses ISO 8601 from utils)
 */
function getCurrentWeekNumber(): number {
  return getWeekNumber(new Date())
}

/**
 * Optimized leaderboard for regular (non-detailed) view
 * Target: Much faster response for simple leaderboard
 */
export async function getOptimizedLeaderboard(pagination: PaginationParams) {
  const cacheKey = QueryCache.createKey('leaderboard_simple', pagination)
  
  return await withQueryCache(
    cacheKey,
    CacheTTL.USER_LEADERBOARD,
    async () => {
      const startTime = Date.now()
      const { page, limit } = pagination
      const offset = (page - 1) * limit
      
      // Single optimized query using the new indexes
      const [users, totalCount] = await Promise.all([
        prisma.$queryRaw<Array<{
          id: string
          username: string
          totalXp: number
          submission_count: bigint
        }>>`
          SELECT 
            u.id,
            u.username,
            u."totalXp",
            COUNT(s.id) as submission_count
          FROM "User" u
          LEFT JOIN "Submission" s ON u.id = s."userId" 
            AND s.status IN ('FINALIZED', 'UNDER_PEER_REVIEW')
          WHERE u.role != 'ADMIN'
          GROUP BY u.id, u.username, u."totalXp"
          ORDER BY u."totalXp" DESC
          LIMIT ${limit} OFFSET ${offset}
        `,
        prisma.user.count({ where: { role: { not: 'ADMIN' } } })
      ])
      
      const executionTime = Date.now() - startTime
      console.log(`⚡ Optimized leaderboard completed in ${executionTime}ms`)
      
      const leaderboardUsers = users.map((user, index) => ({
        id: user.id,
        username: user.username,
        totalXp: user.totalXp,
        rank: offset + index + 1,
        submissionCount: Number(user.submission_count)
      }))
      
      return createPaginationResponse(leaderboardUsers, totalCount, pagination)
    },
    { logPerformance: true }
  )
}

/**
 * Cache warming for leaderboard data
 */
export async function warmLeaderboardCache(): Promise<void> {
  console.log('🔥 Warming leaderboard cache...')
  
  // Warm common pagination combinations
  const commonPaginations = [
    { page: 1, limit: 20 },
    { page: 1, limit: 50 },
    { page: 2, limit: 20 }
  ]
  
  // Warm simple leaderboard
  for (const pagination of commonPaginations) {
    try {
      await getOptimizedLeaderboard(pagination)
      console.log(`🔥 Warmed leaderboard cache: page ${pagination.page}, limit ${pagination.limit}`)
    } catch (error) {
      console.error(`❌ Failed to warm leaderboard cache:`, error)
    }
  }
  
  // Warm weekly stats for current week
  try {
    await getWeeklyStats()
    console.log('🔥 Warmed weekly stats cache')
  } catch (error) {
    console.error('❌ Failed to warm weekly stats cache:', error)
  }
}

/**
 * Performance monitoring for leaderboard queries
 */
export class LeaderboardPerformanceMonitor {
  private static metrics = {
    totalQueries: 0,
    totalExecutionTime: 0,
    cacheHits: 0,
    cacheMisses: 0
  }
  
  static recordQuery(executionTime: number, cacheHit: boolean) {
    this.metrics.totalQueries++
    this.metrics.totalExecutionTime += executionTime
    
    if (cacheHit) {
      this.metrics.cacheHits++
    } else {
      this.metrics.cacheMisses++
    }
  }
  
  static getMetrics() {
    return {
      ...this.metrics,
      averageExecutionTime: this.metrics.totalQueries > 0 
        ? this.metrics.totalExecutionTime / this.metrics.totalQueries 
        : 0,
      cacheHitRate: this.metrics.totalQueries > 0 
        ? (this.metrics.cacheHits / this.metrics.totalQueries) * 100 
        : 0
    }
  }
  
  static reset() {
    this.metrics = {
      totalQueries: 0,
      totalExecutionTime: 0,
      cacheHits: 0,
      cacheMisses: 0
    }
  }
}
