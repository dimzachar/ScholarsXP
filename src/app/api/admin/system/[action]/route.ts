import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { withErrorHandling, createSuccessResponse } from '@/lib/api-middleware'
import { ValidationError } from '@/lib/api-error-handler'
import { processWeeklyReset, checkMissedReviews } from '@/lib/weekly-manager'
import { processReadySubmissions } from '@/lib/xp-aggregator'
import { prisma } from '@/lib/prisma'

/**
 * Admin System Actions Router
 *
 * Routes admin button actions and cron automation to appropriate backend implementations:
 * - weekly: Triggers weekly reset operations
 * - aggregate: Processes XP aggregation for ready submissions
 * - refresh: Refreshes system statistics and cache
 *
 * Supports both admin user authentication and cron job authentication
 */

// Helper function to check if request is from cron
function isCronRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  return cronSecret && authHeader === `Bearer ${cronSecret}`
}

// Helper function to log automation runs
async function logAutomationRun(
  jobName: string,
  jobType: string,
  triggeredBy: string,
  success: boolean,
  result?: any,
  error?: string
) {
  try {
    await prisma.automationLog.create({
      data: {
        jobName,
        jobType,
        triggeredBy,
        startedAt: new Date(),
        completedAt: new Date(),
        status: success ? 'SUCCESS' : 'FAILED',
        result: result ? JSON.stringify(result) : null,
        errorMessage: error || null,
        duration: 0 // Will be calculated in database
      }
    })
  } catch (logError) {
    console.error('Failed to log automation run:', logError)
  }
}

export const POST = async (request: NextRequest, { params }: { params: Promise<{ action: string }> }) => {
  const resolvedParams = await params
  const action = resolvedParams.action

  // Check if this is a cron request
  if (isCronRequest(request)) {
    // Handle cron authentication
    return withErrorHandling(async () => {
      console.log(`🤖 [CRON] System action triggered: ${action}`)

      switch (action) {
        case 'weekly':
          return await handleWeeklyOperations(null, 'cron')

        case 'aggregate':
          return await handleXpAggregation(null, 'cron')

        case 'refresh':
          return await handleDataRefresh(null, 'cron')

        default:
          throw new ValidationError(`Invalid system action: ${action}`, {
            validActions: ['weekly', 'aggregate', 'refresh'],
            receivedAction: action
          })
      }
    })(request)
  } else {
    // Handle admin user authentication
    return withPermission('admin_access')(
      withErrorHandling(async (request: AuthenticatedRequest) => {
        console.log(`🔧 [ADMIN] System action triggered: ${action} by user ${request.user.id}`)

        switch (action) {
          case 'weekly':
            return await handleWeeklyOperations(request, request.user.id)

          case 'aggregate':
            return await handleXpAggregation(request, request.user.id)

          case 'refresh':
            return await handleDataRefresh(request, request.user.id)

          default:
            throw new ValidationError(`Invalid system action: ${action}`, {
              validActions: ['weekly', 'aggregate', 'refresh'],
              receivedAction: action
            })
        }
      })
    )(request, { params })
  }
}

/**
 * Handle weekly operations (streaks, penalties, leaderboard generation)
 */
async function handleWeeklyOperations(request: AuthenticatedRequest | null, triggeredBy: string) {
  const isCron = triggeredBy === 'cron'
  const logPrefix = isCron ? '🤖 [CRON]' : '🗓️ [ADMIN]'

  try {
    console.log(`${logPrefix} Starting weekly reset operations...`)

    const resetResult = await processWeeklyReset()

    // Also check for missed reviews as part of weekly operations
    const missedReviewsCount = await checkMissedReviews()

    const result = {
      usersProcessed: resetResult.usersProcessed,
      streaksAwarded: resetResult.streaksAwarded,
      penaltiesApplied: resetResult.penaltiesApplied,
      leaderboardGenerated: resetResult.leaderboardGenerated,
      rateLimitRecordsCleaned: resetResult.rateLimitRecordsCleaned,
      notificationsCleaned: resetResult.notificationsCleaned,
      missedReviewsFound: missedReviewsCount
    }

    const summary = `Processed ${resetResult.usersProcessed} users, awarded ${resetResult.streaksAwarded} streaks, applied ${resetResult.penaltiesApplied} penalties`

    console.log(`✅ ${logPrefix} Weekly operations completed: ${summary}`)

    // Log automation run if triggered by cron
    if (isCron) {
      await logAutomationRun('weekly-operations-cron', 'weekly_operations', 'cron', true, result)
    }

    return createSuccessResponse({
      message: 'Weekly operations completed successfully',
      details: result,
      summary
    })

  } catch (error) {
    console.error(`❌ ${logPrefix} Weekly operations failed:`, error)

    // Log automation failure if triggered by cron
    if (isCron) {
      await logAutomationRun('weekly-operations-cron', 'weekly_operations', 'cron', false, null,
        error instanceof Error ? error.message : 'Unknown error')
    }

    throw new Error(`Weekly operations failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Handle XP aggregation for submissions with 3+ peer reviews
 */
async function handleXpAggregation(request: AuthenticatedRequest | null, triggeredBy: string) {
  const isCron = triggeredBy === 'cron'
  const logPrefix = isCron ? '🤖 [CRON]' : '⚡ [ADMIN]'

  try {
    console.log(`${logPrefix} Starting XP aggregation for ready submissions...`)

    const processedCount = await processReadySubmissions()

    const result = {
      submissionsProcessed: processedCount,
      timestamp: new Date().toISOString()
    }

    const summary = `Processed ${processedCount} ready submissions`

    // Only log success if submissions were actually processed (to avoid spam in cron logs)
    if (processedCount > 0 || !isCron) {
      console.log(`✅ ${logPrefix} XP aggregation completed: ${summary}`)
    }

    // Log automation run if triggered by cron
    if (isCron) {
      await logAutomationRun('xp-aggregation-cron', 'xp_aggregation', 'cron', true, result)
    }

    return createSuccessResponse({
      message: 'XP aggregation completed successfully',
      details: result,
      summary
    })

  } catch (error) {
    console.error(`❌ ${logPrefix} XP aggregation failed:`, error)

    // Log automation failure if triggered by cron
    if (isCron) {
      await logAutomationRun('xp-aggregation-cron', 'xp_aggregation', 'cron', false, null,
        error instanceof Error ? error.message : 'Unknown error')
    }

    throw new Error(`XP aggregation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Handle data refresh operations (cache invalidation and stats refresh)
 */
async function handleDataRefresh(request: AuthenticatedRequest | null, triggeredBy: string) {
  const isCron = triggeredBy === 'cron'
  const logPrefix = isCron ? '🤖 [CRON]' : '🔄 [ADMIN]'

  try {
    console.log(`${logPrefix} Starting data refresh operations...`)

    // Import cache invalidation service
    const { multiLayerCache } = await import('@/lib/cache/enhanced-cache')
    const { CacheInvalidation } = await import('@/lib/cache/invalidation')

    const invalidation = new CacheInvalidation(multiLayerCache)

    // Invalidate key cache areas
    await Promise.all([
      invalidation.invalidateAnalytics(),
      invalidation.invalidateLeaderboard(),
      invalidation.invalidateByPattern('admin:*'),
      invalidation.invalidateByPattern('stats:*')
    ])

    const result = {
      cacheAreasCleared: ['analytics', 'leaderboard', 'admin', 'stats'],
      timestamp: new Date().toISOString()
    }

    console.log(`✅ ${logPrefix} Data refresh completed: cache invalidated`)

    // Log automation run if triggered by cron
    if (isCron) {
      await logAutomationRun('data-refresh-cron', 'data_refresh', 'cron', true, result)
    }

    return createSuccessResponse({
      message: 'Data refresh completed successfully',
      details: result,
      summary: 'System cache refreshed, statistics updated'
    })

  } catch (error) {
    console.error(`❌ ${logPrefix} Data refresh failed:`, error)

    // Fallback: just return success since this is a non-critical operation
    console.log(`⚠️ ${logPrefix} Cache invalidation failed, but continuing with basic refresh`)

    const result = {
      warning: 'Cache invalidation failed, but basic refresh completed',
      timestamp: new Date().toISOString()
    }

    // Log automation run if triggered by cron (as success with warning)
    if (isCron) {
      await logAutomationRun('data-refresh-cron', 'data_refresh', 'cron', true, result)
    }

    return createSuccessResponse({
      message: 'Data refresh completed with warnings',
      details: result,
      summary: 'Basic data refresh completed (cache invalidation failed)'
    })
  }
}

/**
 * GET endpoint for system action status and information
 */
export const GET = withPermission('admin_access')(
  withErrorHandling(async (request: AuthenticatedRequest, { params }: { params: Promise<{ action: string }> }) => {
    const resolvedParams = await params
    const action = resolvedParams.action

    switch (action) {
      case 'weekly':
        return createSuccessResponse({
          action: 'weekly',
          description: 'Process weekly streaks, penalties, and leaderboard generation',
          lastRun: null, // TODO: Track last run times
          status: 'available'
        })
      
      case 'aggregate':
        return createSuccessResponse({
          action: 'aggregate',
          description: 'Process XP aggregation for submissions with 3+ peer reviews',
          lastRun: null, // TODO: Track last run times
          status: 'available'
        })
      
      case 'refresh':
        return createSuccessResponse({
          action: 'refresh',
          description: 'Refresh system statistics and clear cache',
          lastRun: null, // TODO: Track last run times
          status: 'available'
        })
      
      default:
        throw new ValidationError(`Invalid system action: ${action}`, {
          validActions: ['weekly', 'aggregate', 'refresh']
        })
    }
  })
)
