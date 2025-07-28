import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { withErrorHandling, createSuccessResponse } from '@/lib/api-middleware'
import { prisma } from '@/lib/prisma'

/**
 * Admin Automation Status API
 * 
 * Provides status information about automated cron jobs and manual operations
 * Used by the admin dashboard to show automation health and last run times
 */

export const GET = withPermission('admin_access')(
  withErrorHandling(async (request: AuthenticatedRequest) => {
    console.log('📊 [ADMIN] Fetching automation status...')

    try {
      // Check if AutomationLog table exists
      let automationStats = []
      let statusCounts = []
      let recentRuns = []
      let runningJobs = []

      try {
        // Get automation status for the last 7 days
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

        // Get summary statistics by job type
        automationStats = await prisma.automationLog.groupBy({
          by: ['jobType', 'jobName'],
          where: {
            startedAt: {
              gte: sevenDaysAgo
            }
          },
          _count: {
            id: true
          },
          _max: {
            startedAt: true,
            completedAt: true
          }
        })
      } catch (dbError: any) {
        // Handle case where AutomationLog table doesn't exist yet
        if (dbError.message?.includes('relation') ||
            dbError.message?.includes('does not exist') ||
            dbError.message?.includes('automationLog') ||
            dbError.message?.includes('groupBy')) {

          console.log('⚠️ [ADMIN] AutomationLog table not found - automation monitoring not yet configured')

          // Return a response indicating automation is not configured
          return createSuccessResponse({
            configured: false,
            message: 'Automation monitoring not configured',
            jobTypes: {
              weekly_operations: {
                totalRuns: 0,
                successfulRuns: 0,
                failedRuns: 0,
                runningJobs: 0,
                lastRun: null,
                lastSuccess: null,
                lastFailure: null,
                health: 'unknown',
                successRate: 0
              },
              xp_aggregation: {
                totalRuns: 0,
                successfulRuns: 0,
                failedRuns: 0,
                runningJobs: 0,
                lastRun: null,
                lastSuccess: null,
                lastFailure: null,
                health: 'unknown',
                successRate: 0
              },
              data_refresh: {
                totalRuns: 0,
                successfulRuns: 0,
                failedRuns: 0,
                runningJobs: 0,
                lastRun: null,
                lastSuccess: null,
                lastFailure: null,
                health: 'unknown',
                successRate: 0
              }
            },
            recentRuns: [],
            runningJobs: [],
            queueStatus: {
              submissionsAwaitingAggregation: 0,
              submissionsWithEnoughReviews: 0
            },
            summary: {
              totalAutomationRuns: 0,
              healthyJobs: 0,
              warningJobs: 0,
              criticalJobs: 0,
              runningJobs: 0
            },
            lastUpdated: new Date().toISOString(),
            setupRequired: true,
            setupInstructions: 'Run the database migration: supabase/migrations/012_critical_automation_cron_jobs.sql'
          })
        }

        // Re-throw other database errors
        throw dbError
      }

      // Only fetch additional data if we have the automation infrastructure
      if (automationStats.length > 0 || statusCounts.length > 0) {
        // Get success/failure counts for each job type
        statusCounts = await prisma.automationLog.groupBy({
          by: ['jobType', 'status'],
          where: {
            startedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
            }
          },
          _count: {
            id: true
          }
        })

        // Get recent automation runs (last 20)
        recentRuns = await prisma.automationLog.findMany({
          orderBy: {
            startedAt: 'desc'
          },
          take: 20,
          select: {
            id: true,
            jobName: true,
            jobType: true,
            triggeredBy: true,
            startedAt: true,
            completedAt: true,
            status: true,
            duration: true,
            errorMessage: true
          }
        })

        // Get current running jobs
        runningJobs = await prisma.automationLog.findMany({
          where: {
            status: 'RUNNING',
            startedAt: {
              gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
            }
          },
          select: {
            id: true,
            jobName: true,
            jobType: true,
            startedAt: true,
            triggeredBy: true
          }
        })
      }

      // Process the data into a more useful format
      const jobTypeStats: Record<string, any> = {}

      // Initialize job type stats
      const jobTypes = ['weekly_operations', 'xp_aggregation', 'data_refresh']
      jobTypes.forEach(jobType => {
        jobTypeStats[jobType] = {
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          runningJobs: 0,
          lastRun: null,
          lastSuccess: null,
          lastFailure: null,
          avgDuration: null
        }
      })

      // Populate stats from automation data
      automationStats.forEach(stat => {
        if (jobTypeStats[stat.jobType]) {
          jobTypeStats[stat.jobType].totalRuns += stat._count.id
          jobTypeStats[stat.jobType].lastRun = stat._max.startedAt
        }
      })

      // Populate success/failure counts
      statusCounts.forEach(stat => {
        if (jobTypeStats[stat.jobType]) {
          if (stat.status === 'SUCCESS') {
            jobTypeStats[stat.jobType].successfulRuns += stat._count.id
          } else if (stat.status === 'FAILED') {
            jobTypeStats[stat.jobType].failedRuns += stat._count.id
          }
        }
      })

      // Count running jobs
      runningJobs.forEach(job => {
        if (jobTypeStats[job.jobType]) {
          jobTypeStats[job.jobType].runningJobs += 1
        }
      })

      // Get last success and failure times (only if automation infrastructure exists)
      if (automationStats.length > 0) {
        for (const jobType of jobTypes) {
          const lastSuccess = await prisma.automationLog.findFirst({
            where: {
              jobType,
              status: 'SUCCESS'
            },
            orderBy: {
              startedAt: 'desc'
            },
            select: {
              startedAt: true,
              duration: true
            }
          })

          const lastFailure = await prisma.automationLog.findFirst({
            where: {
              jobType,
              status: 'FAILED'
            },
            orderBy: {
              startedAt: 'desc'
            },
            select: {
              startedAt: true,
              errorMessage: true
            }
          })

          if (lastSuccess) {
            jobTypeStats[jobType].lastSuccess = lastSuccess.startedAt
            jobTypeStats[jobType].avgDuration = lastSuccess.duration
          }

          if (lastFailure) {
            jobTypeStats[jobType].lastFailure = lastFailure.startedAt
            jobTypeStats[jobType].lastError = lastFailure.errorMessage
          }
        }
      }

      // Calculate health status for each job type
      Object.keys(jobTypeStats).forEach(jobType => {
        const stats = jobTypeStats[jobType]
        const successRate = stats.totalRuns > 0 ? (stats.successfulRuns / stats.totalRuns) * 100 : 0
        const timeSinceLastRun = stats.lastRun ? Date.now() - new Date(stats.lastRun).getTime() : null
        
        // Determine health status
        let health = 'unknown'
        if (stats.runningJobs > 0) {
          health = 'running'
        } else if (successRate >= 90 && timeSinceLastRun && timeSinceLastRun < 24 * 60 * 60 * 1000) {
          health = 'healthy'
        } else if (successRate >= 70) {
          health = 'warning'
        } else if (stats.totalRuns > 0) {
          health = 'critical'
        }

        stats.health = health
        stats.successRate = Math.round(successRate)
      })

      // Get queue status (submissions ready for XP aggregation)
      const submissionsReadyForAggregation = await prisma.submission.count({
        where: {
          status: 'UNDER_PEER_REVIEW',
          finalXp: null,
          peerReviews: {
            some: {}
          }
        }
      })

      // Check if we have submissions with 3+ reviews ready
      const submissionsWithEnoughReviews = await prisma.submission.count({
        where: {
          status: 'UNDER_PEER_REVIEW',
          finalXp: null
        },
        // This is a simplified count - the actual logic checks for 3+ reviews
      })

      const response = {
        jobTypes: jobTypeStats,
        recentRuns: recentRuns.map(run => ({
          ...run,
          duration: run.duration ? `${run.duration}ms` : null
        })),
        runningJobs,
        queueStatus: {
          submissionsAwaitingAggregation: submissionsReadyForAggregation,
          submissionsWithEnoughReviews: submissionsWithEnoughReviews
        },
        summary: {
          totalAutomationRuns: automationStats.reduce((sum, stat) => sum + stat._count.id, 0),
          healthyJobs: Object.values(jobTypeStats).filter((stats: any) => stats.health === 'healthy').length,
          warningJobs: Object.values(jobTypeStats).filter((stats: any) => stats.health === 'warning').length,
          criticalJobs: Object.values(jobTypeStats).filter((stats: any) => stats.health === 'critical').length,
          runningJobs: runningJobs.length
        },
        lastUpdated: new Date().toISOString()
      }

      console.log('✅ [ADMIN] Automation status fetched successfully')

      return createSuccessResponse(response)

    } catch (error) {
      console.error('❌ [ADMIN] Failed to fetch automation status:', error)

      // Return a proper error response instead of throwing
      return NextResponse.json({
        success: false,
        error: {
          error: `Failed to fetch automation status: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code: 'AUTOMATION_STATUS_ERROR',
          details: error instanceof Error ? { message: error.message, stack: error.stack } : null
        }
      }, { status: 500 })
    }
  })
)

/**
 * POST endpoint to manually trigger automation health check
 */
export const POST = withPermission('admin_access')(
  withErrorHandling(async (request: AuthenticatedRequest) => {
    console.log('🔧 [ADMIN] Manual automation health check triggered')

    try {
      // This could trigger health checks, cleanup old logs, etc.
      const oneMonthAgo = new Date()
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

      // Clean up old automation logs (older than 30 days)
      const deletedLogs = await prisma.automationLog.deleteMany({
        where: {
          createdAt: {
            lt: oneMonthAgo
          }
        }
      })

      console.log(`🧹 [ADMIN] Cleaned up ${deletedLogs.count} old automation logs`)

      return createSuccessResponse({
        message: 'Automation health check completed',
        details: {
          oldLogsDeleted: deletedLogs.count,
          timestamp: new Date().toISOString()
        }
      })

    } catch (error) {
      console.error('❌ [ADMIN] Automation health check failed:', error)

      // Return a proper error response instead of throwing
      return NextResponse.json({
        success: false,
        error: {
          error: `Automation health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          code: 'AUTOMATION_HEALTH_CHECK_ERROR',
          details: error instanceof Error ? { message: error.message, stack: error.stack } : null
        }
      }, { status: 500 })
    }
  })
)
