import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'
import { CacheKeys, CacheTTL } from '@/lib/cache'
import { withEnhancedCache, EnhancedCacheKeys, EnhancedCacheTTL } from '@/lib/cache/enhanced-utils'
import { withAdminOptimization } from '@/middleware/api-optimization'
import { createClient } from '@supabase/supabase-js'
import { getWeekNumber } from '@/lib/utils'
import { reliabilityService } from '@/lib/reliability/reliability-service'
import { getFormula } from '@/lib/reliability/formulas'
import { RELIABILITY_CONFIG } from '@/config/reliability'
import { ALL_ROLES } from '@/lib/roles'

export const GET = withAdminOptimization(withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url)

    // Pagination parameters
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    // Filter parameters
    const role = searchParams.get('role') // 'USER', 'REVIEWER', 'ADMIN', 'DEVELOPER'
    const search = searchParams.get('search') // Search by username, email
    const xpMin = searchParams.get('xpMin') ? parseInt(searchParams.get('xpMin')!) : undefined
    const xpMax = searchParams.get('xpMax') ? parseInt(searchParams.get('xpMax')!) : undefined
    const lastActiveFrom = searchParams.get('lastActiveFrom')
    const lastActiveTo = searchParams.get('lastActiveTo')
    const sortBy = searchParams.get('sortBy') || 'createdAt'
    const sortOrder = searchParams.get('sortOrder') || 'desc'
    const status = searchParams.get('status') // 'active', 'inactive', 'suspended'
    const includeLogin = searchParams.get('includeLogin') === '1'
    const discordRole = searchParams.get('discordRole') // 'none', 'initiate', 'apprentice', 'journeyman', 'erudite', 'master'
    const excludeLegacyImport = searchParams.get('excludeLegacyImport') === 'yes'

    // Create cache key based on all parameters
    const cacheKey = `${EnhancedCacheKeys.userMetrics(page, limit)}:${role || ''}:${search || ''}:${xpMin || ''}:${xpMax || ''}:${lastActiveFrom || ''}:${lastActiveTo || ''}:${sortBy}:${sortOrder}:${status || ''}:${discordRole || ''}:${excludeLegacyImport}`

    // Disable caching for admin users table to prevent stale data issues
    // Admin operations need real-time data, especially after account merges/deletions
    const shouldCache = false // Temporarily disabled to fix phantom account issues

    let responseData
    if (shouldCache) {
      responseData = await withEnhancedCache(
        cacheKey,
        60, // Reduced from 300 to 60 seconds for admin operations
        async () => {
          return await fetchUserMetricsData(page, limit, offset, role, search, xpMin, xpMax, lastActiveFrom, lastActiveTo, sortBy, sortOrder, status, includeLogin)
        },
        { fallbackToOldCache: false } // Don't fallback to old cache for admin data
      )

      return NextResponse.json(responseData, {
        headers: {
          'Cache-Control': 'private, max-age=60, must-revalidate',
          'X-Cache': 'HIT',
          'X-Cache-Layer': 'Multi-Layer',
          'X-Cache-Key': cacheKey
        }
      })
    } else {
      // Always fetch fresh data for admin users table
      responseData = await fetchUserMetricsData(
        page, limit, offset, role, search, xpMin, xpMax,
        lastActiveFrom, lastActiveTo, sortBy, sortOrder, status, includeLogin,
        discordRole, excludeLegacyImport
      )

      return NextResponse.json(responseData, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Cache': 'MISS',
          'X-Cache-Layer': 'None',
          'X-Fresh-Data': 'true'
        }
      })
    }

  } catch (error) {
    console.error('Error in admin users endpoint:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    )
  }
}))

// Extracted data fetching function for caching
async function fetchUserMetricsData(
  page: number,
  limit: number,
  offset: number,
  role?: string | null,
  search?: string | null,
  xpMin?: number,
  xpMax?: number,
  lastActiveFrom?: string | null,
  lastActiveTo?: string | null,
  sortBy: string = 'createdAt',
  sortOrder: string = 'desc',
  status?: string | null,
  includeLogin: boolean = false,
  discordRole?: string | null,
  excludeLegacyImport: boolean = false
) {
  // Build where clause
  const where: any = {}

  if (role) {
    where.role = role
  }

  if (search) {
    where.OR = [
      { username: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } }
    ]
  }

  if (xpMin !== undefined || xpMax !== undefined) {
    where.totalXp = {}
    if (xpMin !== undefined) where.totalXp.gte = xpMin
    if (xpMax !== undefined) where.totalXp.lte = xpMax
  }

  // Discord role filter (based on XP thresholds)
  if (discordRole) {
    const xpRanges: Record<string, { gte?: number; lte?: number; equals?: number }> = {
      none: { equals: 0 },
      initiate: { gte: 1, lte: 999 },
      apprentice: { gte: 1000, lte: 17499 },
      journeyman: { gte: 17500, lte: 48999 },
      erudite: { gte: 49000, lte: 94499 },
      master: { gte: 94500 }
    }
    const range = xpRanges[discordRole]
    if (range) {
      where.totalXp = { ...where.totalXp, ...range }
    }
  }

  // Exclude legacy import users (users with email ending in @legacy.import)
  if (excludeLegacyImport) {
    where.email = { not: { endsWith: '@legacy.import' } }
  }

  if (lastActiveFrom || lastActiveTo) {
    where.lastActiveAt = {}
    if (lastActiveFrom) where.lastActiveAt.gte = new Date(lastActiveFrom)
    if (lastActiveTo) where.lastActiveAt.lte = new Date(lastActiveTo)
  }

  if (status) {
    // Map status to actual database fields
    switch (status) {
      case 'active':
        where.lastActiveAt = {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Active in last 7 days
        }
        break
      case 'recent':
        where.lastActiveAt = {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
        break
      case 'inactive':
        where.lastActiveAt = {
          lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          gte: new Date('2020-01-01') // Exclude deactivated users
        }
        break
      case 'deactivated':
        where.lastActiveAt = {
          lt: new Date('2020-01-01') // Deactivated users have very old lastActiveAt
        }
        break
    }
  }

  // Build orderBy clause
  let orderBy: any
  if (sortBy === 'submissions') {
    orderBy = { submissions: { _count: sortOrder as 'asc' | 'desc' } }
  } else if (sortBy === 'reviews') {
    orderBy = { peerReviews: { _count: sortOrder as 'asc' | 'desc' } }
  } else {
    orderBy = { [sortBy]: sortOrder }
  }

  // Calculate week start for XP transactions using ISO week (Monday start)
  const weekStart = new Date()
  const day = weekStart.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day // If Sunday, go back 6 days, otherwise go back to Monday
  weekStart.setDate(weekStart.getDate() + mondayOffset)
  weekStart.setHours(0, 0, 0, 0)

  // Get users with essential fields and counts only (avoid heavy nested selects)
  const [users, totalCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy,
      skip: offset,
      take: limit,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        totalXp: true,
        currentWeekXp: true,
        streakWeeks: true,
        missedReviews: true,
        createdAt: true,
        lastActiveAt: true,
        preferences: true,
        discordHandle: true,
        _count: {
          select: {
            submissions: true,
            peerReviews: true,
            userAchievements: true
          }
        },
        xpTransactions: {
          where: {
            createdAt: {
              gte: weekStart
            }
          },
          select: {
            amount: true,
            type: true,
            sourceId: true,
            createdAt: true,
            description: true
          },
          take: 1000  // Limit transactions to prevent unbounded queries
        }
      }
    }),
    prisma.user.count({ where })
  ])

  const userIds = users.map(u => u.id)
  const usernames = users
    .map(u => u.discordHandle || u.username)
    .filter((h): h is string => Boolean(h))

  // Aggregate heavy metrics via groupBy to avoid N+1 queries
  const [completedSubmissionsByUser, avgReviewScoreByUser, legacyCountsGrouped, activeAssignmentsByUser] = await Promise.all([
    prisma.submission.groupBy({
      by: ['userId'],
      where: {
        userId: { in: userIds },
        status: 'FINALIZED'
      },
      _count: { _all: true }
    }),
    prisma.peerReview.groupBy({
      by: ['reviewerId'],
      where: { reviewerId: { in: userIds } },
      _avg: { xpScore: true }
    }),
    prisma.legacySubmission.groupBy({
      by: ['discordHandle'],
      where: {
        discordHandle: {
          in: usernames
        }
      },
      _count: { _all: true }
    }),
    // Get active review assignments count per reviewer
    prisma.reviewAssignment.groupBy({
      by: ['reviewerId'],
      where: {
        reviewerId: { in: userIds },
        status: { in: ['PENDING', 'IN_PROGRESS'] }
      },
      _count: { _all: true }
    })
  ])

  const completedCountMap = new Map<string, number>(
    completedSubmissionsByUser.map(r => [r.userId, r._count._all])
  )
  const avgReviewMap = new Map<string, number>(
    avgReviewScoreByUser.map(r => [r.reviewerId, Math.round(((r._avg.xpScore || 0) * 10)) / 10])
  )
  const legacyCountByHandle = new Map<string, number>(
    legacyCountsGrouped.map(r => [r.discordHandle as string, r._count._all])
  )
  const activeAssignmentsMap = new Map<string, number>(
    activeAssignmentsByUser.map(r => [r.reviewerId, r._count._all])
  )

  const parseReviewerAvailability = (preferences: unknown) => {
    if (!preferences) {
      return {
        reviewerOptOut: false,
        reviewerOptOutUntil: null as string | null,
        reviewerOptOutActive: false
      }
    }

    let parsed: Record<string, unknown>

    if (typeof preferences === 'string') {
      try {
        parsed = JSON.parse(preferences)
      } catch (error) {
        // console.warn('Failed to parse user preferences JSON:', error)
        return {
          reviewerOptOut: false,
          reviewerOptOutUntil: null,
          reviewerOptOutActive: false
        }
      }
    } else {
      parsed = preferences as Record<string, unknown>
    }

    const optOutFlag = parsed.reviewerOptOut === true

    let optOutUntilIso: string | null = null
    let optOutUntilFuture = false

    const untilValue = parsed.reviewerOptOutUntil
    if (untilValue instanceof Date) {
      optOutUntilIso = untilValue.toISOString()
      optOutUntilFuture = untilValue.getTime() > Date.now()
    } else if (typeof untilValue === 'string' && untilValue) {
      const untilDate = new Date(untilValue)
      if (untilDate && !isNaN(untilDate.getTime())) {
        optOutUntilIso = untilDate.toISOString()
        optOutUntilFuture = untilDate.getTime() > Date.now()
      }
    }

    return {
      reviewerOptOut: optOutFlag,
      reviewerOptOutUntil: optOutUntilIso,
      reviewerOptOutActive: optOutFlag || optOutUntilFuture
    }
  }

  // Calculate reviewer reliability scores for users with review history
  const reviewersWithReviews = users.filter(u => u._count.peerReviews > 0)
  const reviewerIdsWithReviews = reviewersWithReviews.map(u => u.id)
  let reliabilityMap = new Map<string, { score: number }>()

  if (reviewerIdsWithReviews.length > 0) {
    try {
      reliabilityMap = await reliabilityService.getReliabilityScores(reviewerIdsWithReviews)
    } catch (error) {
      console.error('Failed to calculate reliability scores via service:', error)
    }
  }

  // Calculate additional metrics for each user - Optimized in-memory processing
  let usersWithMetrics = users.map((user) => {
    // Calculate weekly XP from transactions to show detailed breakdown
    const weeklyXp = user.xpTransactions.reduce((sum, tx) => sum + tx.amount, 0)

    // Group transactions by type and subtype for detailed breakdown
    const transactionBreakdown = user.xpTransactions.reduce((acc, tx) => {
      // Special handling for REVIEW_REWARD to separate regular rewards from quality bonuses
      if (tx.type === 'REVIEW_REWARD') {
        if (tx.description && tx.description.toLowerCase().includes('quality bonus')) {
          if (!acc['REVIEW_QUALITY_BONUS']) {
            acc['REVIEW_QUALITY_BONUS'] = 0
          }
          acc['REVIEW_QUALITY_BONUS'] += tx.amount
        } else {
          if (!acc['REVIEW_BASE_REWARD']) {
            acc['REVIEW_BASE_REWARD'] = 0
          }
          acc['REVIEW_BASE_REWARD'] += tx.amount
        }
      } else {
        if (!acc[tx.type]) {
          acc[tx.type] = 0
        }
        acc[tx.type] += tx.amount
      }
      return acc
    }, {} as Record<string, number>)

    // Calculate "from submissions" XP (only SUBMISSION_REWARD transactions)
    const submissionsXp = user.xpTransactions
      .filter(tx => tx.type === 'SUBMISSION_REWARD')
      .reduce((sum, tx) => sum + tx.amount, 0)

    // Completed submissions and legacy counts
    const completedSubmissions = completedCountMap.get(user.id) || 0
    const legacyHandle = user.discordHandle || user.username || ''
    const legacySubmissionCount = legacyHandle ? (legacyCountByHandle.get(legacyHandle) || 0) : 0
    const totalSubmissions = user._count.submissions + legacySubmissionCount
    const submissionSuccessRate = totalSubmissions > 0
      ? ((completedSubmissions + legacySubmissionCount) / totalSubmissions) * 100
      : 0

    // Average review score given (by this user as reviewer)
    const avgReviewScore = avgReviewMap.get(user.id) || 0

    // Get reliability score (calculated above)
    const activeFormula = getFormula(RELIABILITY_CONFIG.ACTIVE_FORMULA)
    const reliabilityScore = reliabilityMap.get(user.id)?.score || (user._count.peerReviews > 0 ? (0.3 * 1.0 + 0.7 * (activeFormula.defaultValues?.quality || 0.5)) : null)

    // Determine activity status
    const daysSinceLastActive = user.lastActiveAt
      ? Math.floor((Date.now() - new Date(user.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24))
      : null

    let activityStatus = 'unknown'
    if (daysSinceLastActive !== null && user.lastActiveAt) {
      // Check if user is deactivated (lastActiveAt set to very old date)
      const lastActiveYear = new Date(user.lastActiveAt).getFullYear()
      if (lastActiveYear < 2020) {
        activityStatus = 'deactivated'
      } else if (daysSinceLastActive <= 7) {
        activityStatus = 'active'
      } else if (daysSinceLastActive <= 30) {
        activityStatus = 'recent'
      } else {
        activityStatus = 'inactive'
      }
    }

    const reviewerAvailability = parseReviewerAvailability(user.preferences)

    // Get active assignments count for this user
    const activeAssignments = activeAssignmentsMap.get(user.id) || 0

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      totalXp: user.totalXp,
      currentWeekXp: user.currentWeekXp || 0,
      streakWeeks: user.streakWeeks || 0,
      missedReviews: user.missedReviews || 0,
      activeAssignments,
      createdAt: user.createdAt,
      lastActiveAt: user.lastActiveAt,
      reviewerOptOut: reviewerAvailability.reviewerOptOut,
      reviewerOptOutUntil: reviewerAvailability.reviewerOptOutUntil,
      reviewerOptOutActive: reviewerAvailability.reviewerOptOutActive,
      metrics: {
        weeklyXp,
        submissionSuccessRate: Math.round(submissionSuccessRate),
        avgReviewScore: Math.round(avgReviewScore * 10) / 10,
        daysSinceLastActive,
        activityStatus,
        totalSubmissions: totalSubmissions, // Include legacy submissions
        totalReviews: user._count.peerReviews,
        totalAchievements: user._count.userAchievements,
        reliabilityScore: reliabilityScore ? Math.round(reliabilityScore * 100) / 100 : null,
        transactionBreakdown, // Add detailed XP breakdown
        submissionsXp // Add submissions-only XP for accurate "from submissions" display
      }
    }
  })

  // Optionally enrich with last login date from Supabase auth, when requested
  if (includeLogin) {
    try {
      const { createServiceClient } = await import('@/lib/supabase-server')
      const supabaseAdmin = createServiceClient()

      const targetIds = new Set(userIds)
      const lastLoginMap = new Map<string, string | null>()

      let pageNum = 1
      const perPage = 1000
      // Iterate pages until we've found all target users or no more users
      // Guard with a hard cap to avoid infinite loops
      for (let i = 0; i < 10 && lastLoginMap.size < targetIds.size; i++) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: pageNum, perPage })
        if (error) break
        if (!data || !Array.isArray(data.users) || data.users.length === 0) break

        for (const au of data.users) {
          if (targetIds.has(au.id) && !lastLoginMap.has(au.id)) {
            // Supabase returns last_sign_in_at as string | null
            // Normalize to ISO if present
            const last = (au.last_sign_in_at as string | null) || null
            lastLoginMap.set(au.id, last)
          }
        }

        if (data.users.length < perPage) {
          break
        }
        pageNum++
      }

      usersWithMetrics = usersWithMetrics.map(u => ({
        ...u,
        lastLoginAt: lastLoginMap.get(u.id) || null
      }))
    } catch (e) {
      // If auth enrichment fails, proceed without lastLoginAt
      // console.warn('Auth enrichment for last login failed:', e)
    }
  }


  // Get summary statistics
  const roleStats = await prisma.user.groupBy({
    by: ['role'],
    _count: true,
    where: Object.keys(where).length > 0 ? where : undefined
  })

  const roleCounts = roleStats.reduce((acc, stat) => {
    acc[stat.role] = stat._count
    return acc
  }, {} as Record<string, number>)

  // Calculate pagination info
  const totalPages = Math.ceil(totalCount / limit)
  const hasNextPage = page < totalPages
  const hasPrevPage = page > 1

  return {
    users: usersWithMetrics,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
      hasNextPage,
      hasPrevPage
    },
    filters: {
      role,
      search,
      xpMin,
      xpMax,
      lastActiveFrom,
      lastActiveTo,
      status
    },
    stats: {
      roleCounts,
      totalUsers: totalCount
    }
  }
}

// PATCH endpoint for bulk operations
export const PATCH = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const { action, userIds, data } = await request.json()

    if (!action || !userIds || !Array.isArray(userIds)) {
      return NextResponse.json(
        { message: 'Invalid request. Action and userIds are required.' },
        { status: 400 }
      )
    }

    let result

    switch (action) {
      case 'updateRole':
        if (!data?.role || !ALL_ROLES.includes(data.role)) {
          return NextResponse.json(
            { message: 'Valid role is required for updateRole action' },
            { status: 400 }
          )
        }

        result = await prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: {
            role: data.role,
            updatedAt: new Date()
          }
        })

        // Create admin action audit for each user
        for (const userId of userIds) {
          await prisma.adminAction.create({
            data: {
              adminId: request.user.id,
              action: 'USER_ROLE_CHANGE',
              targetType: 'user',
              targetId: userId,
              details: {
                newRole: data.role,
                reason: data.reason || null
              } as any
            }
          })
        }
        break

      case 'adjustXp':
        if (typeof data?.xpAmount !== 'number') {
          return NextResponse.json(
            { message: 'XP amount is required for adjustXp action' },
            { status: 400 }
          )
        }

        // Update user XP and create transactions
        for (const userId of userIds) {
          await prisma.$transaction([
            // Update user total XP
            prisma.user.update({
              where: { id: userId },
              data: { totalXp: { increment: data.xpAmount } }
            }),
            // Create XP transaction record
            prisma.xpTransaction.create({
              data: {
                userId,
                amount: data.xpAmount,
                type: 'ADMIN_ADJUSTMENT',
                description: `Admin XP adjustment: ${data.reason || 'Manual adjustment'}`,
                weekNumber: getWeekNumber(new Date())
              }
            }),
            // Create admin action audit
            prisma.adminAction.create({
              data: {
                adminId: request.user.id,
                action: 'XP_OVERRIDE',
                targetType: 'user',
                targetId: userId,
                details: {
                  xpAmount: data.xpAmount,
                  reason: data.reason
                }
              }
            })
          ])

          // Invalidate user profile cache after XP update
          const { CacheInvalidation } = await import('@/lib/cache/invalidation')
          const { multiLayerCache } = await import('@/lib/cache/enhanced-cache')
          const cacheInvalidation = new CacheInvalidation(multiLayerCache)
          await cacheInvalidation.invalidateOnUserAction('xp_awarded', userId)
        }

        result = { count: userIds.length }
        break

      case 'toggleStatus':
        if (!data?.action || !['deactivate', 'reactivate'].includes(data.action)) {
          return NextResponse.json(
            { message: 'Valid action (deactivate/reactivate) is required for toggleStatus' },
            { status: 400 }
          )
        }

        const isDeactivating = data.action === 'deactivate'

        // For deactivation, set lastActiveAt to a very old date to mark as inactive
        // For reactivation, set lastActiveAt to current time to mark as active
        const lastActiveAt = isDeactivating
          ? new Date('2000-01-01') // Very old date to indicate deactivated
          : new Date() // Current time to indicate reactivated

        result = await prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: {
            lastActiveAt,
            updatedAt: new Date()
          }
        })

        // Create admin action audit for each user
        for (const userId of userIds) {
          await prisma.adminAction.create({
            data: {
              adminId: request.user.id,
              action: 'SYSTEM_CONFIG',
              targetType: 'user',
              targetId: userId,
              details: {
                subAction: isDeactivating ? 'USER_DEACTIVATED' : 'USER_REACTIVATED',
                action: data.action,
                reason: data.reason,
                timestamp: new Date().toISOString()
              } as any
            }
          })
        }
        break

      case 'setReviewAvailability': {
        if (!data || typeof data !== 'object') {
          return NextResponse.json(
            { message: 'Data payload is required for setReviewAvailability action' },
            { status: 400 }
          )
        }

        let updatedCount = 0

        for (const userId of userIds) {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { preferences: true }
          })

          if (!user) {
            continue
          }

          const currentPreferences =
            user.preferences && typeof user.preferences === 'object'
              ? { ...(user.preferences as Record<string, unknown>) }
              : {}

          if (data.reviewerOptOut === true) {
            currentPreferences.reviewerOptOut = true
            delete currentPreferences.reviewerOptOutUntil
          } else if (data.reviewerOptOut === false) {
            delete currentPreferences.reviewerOptOut
          }

          if (typeof data.reviewerOptOutUntil === 'string' && data.reviewerOptOutUntil) {
            currentPreferences.reviewerOptOutUntil = data.reviewerOptOutUntil
            if (data.reviewerOptOut !== true) {
              delete currentPreferences.reviewerOptOut
            }
          } else if (data.reviewerOptOutUntil === null) {
            delete currentPreferences.reviewerOptOutUntil
          }

          await prisma.user.update({
            where: { id: userId },
            data: {
              preferences: currentPreferences as any,
              updatedAt: new Date()
            }
          })

          await prisma.adminAction.create({
            data: {
              adminId: request.user.id,
              action: 'SYSTEM_CONFIG',
              targetType: 'user',
              targetId: userId,
              details: {
                subAction: 'REVIEW_AVAILABILITY_UPDATE',
                reviewerOptOut: data.reviewerOptOut ?? null,
                reviewerOptOutUntil: data.reviewerOptOutUntil ?? null,
                mode: data.mode || null,
                timestamp: new Date().toISOString()
              }
            }
          })

          updatedCount++
        }

        result = { count: updatedCount }
        break
      }

      default:
        return NextResponse.json(
          { message: 'Invalid action' },
          { status: 400 }
        )
    }

    return NextResponse.json({
      message: `Successfully ${action}d ${result.count} users`,
      count: result.count
    })

  } catch (error) {
    console.error('Error in admin users bulk operation:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})
