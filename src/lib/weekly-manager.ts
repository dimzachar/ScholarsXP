import { prisma } from '@/lib/prisma'
import { getWeekNumber } from '@/lib/utils'
import { notifyWeeklySummary } from '@/lib/notifications'

export interface WeeklyProcessingResult {
  usersProcessed: number
  streaksAwarded: number
  penaltiesApplied: number
  leaderboardGenerated: boolean
  rateLimitRecordsCleaned: number
  notificationsCleaned: number
}

const LOCK_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Acquire a distributed lock using AutomationLog to prevent concurrent weekly resets
 */
async function acquireWeeklyResetLock(weekNumber: number): Promise<string | null> {
  const jobName = `weekly_reset_week_${weekNumber}`
  const now = new Date()
  const lockExpiry = new Date(now.getTime() - LOCK_TIMEOUT_MS)

  try {
    // Check for existing running job (not expired)
    const existingJob = await prisma.automationLog.findFirst({
      where: {
        jobName,
        status: 'RUNNING',
        startedAt: { gt: lockExpiry }
      }
    })

    if (existingJob) {
      console.log(`Weekly reset for week ${weekNumber} already in progress (job ${existingJob.id})`)
      return null
    }

    // Create new lock entry
    const lock = await prisma.automationLog.create({
      data: {
        jobName,
        jobType: 'weekly_reset',
        triggeredBy: 'system',
        status: 'RUNNING'
      }
    })

    return lock.id
  } catch (error) {
    console.error('Failed to acquire weekly reset lock:', error)
    return null
  }
}

/**
 * Release the distributed lock after weekly reset completes
 */
async function releaseWeeklyResetLock(lockId: string, success: boolean, result?: string): Promise<void> {
  try {
    const completedAt = new Date()
    const log = await prisma.automationLog.findUnique({ where: { id: lockId } })
    const duration = log ? completedAt.getTime() - log.startedAt.getTime() : 0

    await prisma.automationLog.update({
      where: { id: lockId },
      data: {
        status: success ? 'SUCCESS' : 'FAILED',
        completedAt,
        duration,
        result
      }
    })
  } catch (error) {
    console.error('Failed to release weekly reset lock:', error)
  }
}

const BATCH_SIZE = 50 // Process users in batches to avoid timeouts

export async function processWeeklyReset(): Promise<WeeklyProcessingResult> {
  const currentWeek = getWeekNumber(new Date())
  const previousWeek = currentWeek - 1

  // Acquire distributed lock to prevent concurrent execution
  const lockId = await acquireWeeklyResetLock(previousWeek)
  if (!lockId) {
    console.log(`Weekly reset for week ${previousWeek} already in progress, skipping`)
    return {
      usersProcessed: 0,
      streaksAwarded: 0,
      penaltiesApplied: 0,
      leaderboardGenerated: false,
      rateLimitRecordsCleaned: 0,
      notificationsCleaned: 0
    }
  }

  try {
    console.log(`Processing weekly reset for week ${previousWeek} -> ${currentWeek}`)

    // Get users who haven't been processed yet (no WeeklyStats for previousWeek)
    const usersToProcess = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT u.id
      FROM "User" u
      LEFT JOIN "WeeklyStats" ws ON ws."userId" = u.id AND ws."weekNumber" = ${previousWeek}
      WHERE ws.id IS NULL
      ORDER BY u.id
    `

    const totalUsers = usersToProcess.length
    console.log(`Total users to process: ${totalUsers} (${await prisma.user.count()} total users)`)

    if (totalUsers === 0) {
      console.log('All users already processed for this week!')
      const result: WeeklyProcessingResult = {
        usersProcessed: 0,
        streaksAwarded: 0,
        penaltiesApplied: 0,
        leaderboardGenerated: false,
        rateLimitRecordsCleaned: 0,
        notificationsCleaned: 0
      }
      await releaseWeeklyResetLock(lockId, true, JSON.stringify(result))
      return result
    }

    let usersProcessed = 0
    let streaksAwarded = 0
    let penaltiesApplied = 0
    let offset = 0

    // Process users in batches
    while (offset < totalUsers) {
      const userIds = usersToProcess.slice(offset, offset + BATCH_SIZE).map(u => u.id)
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        orderBy: { id: 'asc' }
      })

      console.log(`Processing batch: ${offset + 1}-${offset + users.length} of ${totalUsers}`)

      for (const user of users) {
        try {
          let weeklyStatsXpTotal = 0

          // Process each user in a transaction to ensure atomicity
          await prisma.$transaction(async (tx) => {
            // Get or create weekly stats for previous week
            let weeklyStats = await tx.weeklyStats.findFirst({
              where: {
                userId: user.id,
                weekNumber: previousWeek
              }
            })

            if (!weeklyStats) {
              // Calculate correct weekly XP from transactions instead of using stored value
              const transactions = await tx.xpTransaction.findMany({
                where: {
                  userId: user.id,
                  weekNumber: previousWeek
                }
              })

              const calculatedXpTotal = transactions.reduce((sum, t) => sum + t.amount, 0)

              weeklyStats = await tx.weeklyStats.create({
                data: {
                  userId: user.id,
                  weekNumber: previousWeek,
                  xpTotal: calculatedXpTotal,
                  reviewsDone: 0,
                  reviewsMissed: user.missedReviews
                }
              })
            }

            weeklyStatsXpTotal = weeklyStats.xpTotal

            // Check for streak eligibility (100+ XP for the week)
            // DISABLED: Streaks are not currently active
            let newStreakWeeks = 0 // Always reset to 0
            let earnedStreak = false

            /*
            // Original streak logic (disabled)
            let newStreakWeeks = user.streakWeeks
            let earnedStreak = false
  
            if (weeklyStats.xpTotal >= 100) {
              newStreakWeeks += 1
              earnedStreak = true
              
              // Award Parthenon XP bonus for 4-week streak
              if (newStreakWeeks % 4 === 0) {
                const bonusXp = 50 // Parthenon bonus
                // Use recordXpTransaction to update User.totalXp AND create transaction record
                const { xpAnalyticsService } = await import('@/lib/xp-analytics')
                await xpAnalyticsService.recordXpTransaction(
                  user.id,
                  bonusXp,
                  'STREAK_BONUS',
                  `Parthenon bonus for ${newStreakWeeks}-week streak`
                )
                console.log(`Awarded ${bonusXp} Parthenon XP to user ${user.username} for ${newStreakWeeks}-week streak`)
  
                // Invalidate user profile cache after streak bonus
                const { CacheInvalidation } = await import('@/lib/cache/invalidation')
                const { multiLayerCache } = await import('@/lib/cache/enhanced-cache')
                const cacheInvalidation = new CacheInvalidation(multiLayerCache)
                await cacheInvalidation.invalidateOnUserAction('xp_awarded', user.id)
              }
              
              streaksAwarded++
            } else {
              // Reset streak if didn't meet minimum XP
              newStreakWeeks = 0
            }
            */
            // NOTE: missedReviews penalties are now handled immediately when a review is missed
            // (see deadline-monitor.ts applyThresholdPenalties). missedReviews is a lifetime counter
            // that NEVER resets. No weekly penalty processing needed.

            // Update user for new week (only reset currentWeekXp and streakWeeks)
            await tx.user.update({
              where: { id: user.id },
              data: {
                currentWeekXp: 0,
                streakWeeks: newStreakWeeks
                // NOTE: missedReviews is NOT reset - it's a lifetime counter
              }
            })

            // Update weekly stats
            await tx.weeklyStats.update({
              where: { id: weeklyStats.id },
              data: {
                earnedStreak
              }
            })
          })

          // Send weekly summary notification (fire and forget)
          const userWithTotal = await prisma.user.findUnique({
            where: { id: user.id },
            select: { totalXp: true }
          })
          if (userWithTotal && weeklyStatsXpTotal > 0) {
            notifyWeeklySummary(user.id, weeklyStatsXpTotal, userWithTotal.totalXp).catch(err => {
              console.warn(`Failed to send weekly summary to user ${user.id}:`, err)
            })
          }

          usersProcessed++

        } catch (userError) {
          console.error(`Error processing user ${user.id}:`, userError)
          // Continue processing other users even if one fails
        }
      }

      offset += BATCH_SIZE

      // Update lock with progress after each batch
      try {
        await prisma.automationLog.update({
          where: { id: lockId },
          data: {
            result: JSON.stringify({
              progress: `${usersProcessed}/${totalUsers} users processed`,
              streaksAwarded,
              penaltiesApplied,
              lastProcessedOffset: offset
            })
          }
        })
      } catch (progressError) {
        console.warn('Failed to update progress:', progressError)
        // Continue even if progress update fails
      }
    }

    // Generate leaderboard for the completed week
    const leaderboardGenerated = await generateWeeklyLeaderboard(previousWeek)

    // Clean up expired rate limit records
    const rateLimitRecordsCleaned = await cleanupExpiredRateLimits()

    // Clean up old read notifications (90+ days old)
    const notificationsCleaned = await cleanupOldNotifications()

    console.log(`Weekly reset completed: ${usersProcessed} users processed, ${streaksAwarded} streaks awarded, ${penaltiesApplied} penalties applied, ${rateLimitRecordsCleaned} rate limit records cleaned, ${notificationsCleaned} old notifications cleaned`)

    const result: WeeklyProcessingResult = {
      usersProcessed,
      streaksAwarded,
      penaltiesApplied,
      leaderboardGenerated,
      rateLimitRecordsCleaned,
      notificationsCleaned
    }

    await releaseWeeklyResetLock(lockId, true, JSON.stringify(result))
    return result

  } catch (error) {
    console.error('Error in weekly reset:', error)
    await releaseWeeklyResetLock(lockId, false, error instanceof Error ? error.message : 'Unknown error')
    throw new Error('Failed to process weekly reset')
  }
}

export async function generateWeeklyLeaderboard(weekNumber: number): Promise<boolean> {
  try {
    // Get top performers for the week
    const topPerformers = await prisma.weeklyStats.findMany({
      where: {
        weekNumber
      },
      include: {
        user: {
          select: {
            username: true,
            totalXp: true
          }
        }
      },
      orderBy: {
        xpTotal: 'desc'
      },
      take: 10
    })

    // Find best content of the week (highest XP submission)
    const bestContent = await prisma.submission.findFirst({
      where: {
        weekNumber,
        status: 'FINALIZED',
        finalXp: { not: null }
      },
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
    })

    // Log leaderboard (in a real app, this would be posted to social media or internal feed)
    console.log(`\n=== WEEK ${weekNumber} LEADERBOARD ===`)
    topPerformers.forEach((performer, index) => {
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`
      console.log(`${medal} @${performer.user.username} — ${performer.xpTotal} XP`)
    })

    if (bestContent) {
      console.log(`\n🏆 Best Content: "${bestContent.url}" by @${bestContent.user.username} (${bestContent.finalXp} XP)`)
    }

    console.log(`\n=== END LEADERBOARD ===\n`)

    return true

  } catch (error) {
    console.error('Error generating weekly leaderboard:', error)
    return false
  }
}

export async function checkMissedReviews(): Promise<number> {
  try {
    // Find submissions that have been waiting for peer review for more than 48 hours
    const cutoffDate = new Date()
    cutoffDate.setHours(cutoffDate.getHours() - 48)

    const overdueSubmissions = await prisma.submission.findMany({
      where: {
        status: 'AI_REVIEWED',
        createdAt: { lt: cutoffDate }
      },
      include: {
        peerReviews: true
      }
    })

    let missedReviewsCount = 0

    for (const submission of overdueSubmissions) {
      const reviewsNeeded = 3 - submission.peerReviews.length
      if (reviewsNeeded > 0) {
        // In a real system, you would identify which specific users were assigned to review
        // and increment their missedReviews count
        // For now, we'll just log the missed reviews
        console.log(`Submission ${submission.id} has ${reviewsNeeded} missed reviews`)
        missedReviewsCount += reviewsNeeded
      }
    }

    return missedReviewsCount

  } catch (error) {
    console.error('Error checking missed reviews:', error)
    return 0
  }
}

export async function getWeeklyInsights(weekNumber?: number): Promise<unknown> {
  try {
    const targetWeek = weekNumber || getWeekNumber(new Date()) - 1 // Previous week by default

    const weeklyStats = await prisma.weeklyStats.findMany({
      where: {
        weekNumber: targetWeek
      },
      include: {
        user: {
          select: {
            username: true,
            totalXp: true,
            streakWeeks: true
          }
        }
      }
    })

    const submissions = await prisma.submission.findMany({
      where: {
        weekNumber: targetWeek,
        status: 'FINALIZED'
      }
    })

    const totalXpAwarded = weeklyStats.reduce((sum, stat) => sum + stat.xpTotal, 0)
    const totalSubmissions = submissions.length
    const averageXpPerSubmission = totalSubmissions > 0 ? totalXpAwarded / totalSubmissions : 0

    const taskTypeDistribution = submissions.reduce((acc, sub) => {
      sub.taskTypes.forEach(taskType => {
        acc[taskType] = (acc[taskType] || 0) + 1
      })
      return acc
    }, {} as Record<string, number>)

    return {
      weekNumber: targetWeek,
      totalParticipants: weeklyStats.length,
      totalXpAwarded,
      totalSubmissions,
      averageXpPerSubmission: Math.round(averageXpPerSubmission),
      taskTypeDistribution,
      topPerformers: weeklyStats
        .sort((a, b) => b.xpTotal - a.xpTotal)
        .slice(0, 5)
        .map(stat => ({
          username: stat.user.username,
          weeklyXp: stat.xpTotal,
          totalXp: stat.user.totalXp,
          streakWeeks: stat.user.streakWeeks
        }))
    }

  } catch (error) {
    console.error('Error getting weekly insights:', error)
    throw new Error('Failed to get weekly insights')
  }
}

/**
 * Clean up expired rate limit records to prevent table bloat
 * This function is called during weekly reset operations
 */
export async function cleanupExpiredRateLimits(): Promise<number> {
  try {
    const result = await prisma.rateLimit.deleteMany({
      where: {
        expiresAt: { lt: new Date() }
      }
    })

    console.log(`Cleaned up ${result.count} expired rate limit records`)
    return result.count
  } catch (error) {
    console.error('Error cleaning up rate limits:', error)
    return 0
  }
}

/**
 * Clean up old read notifications to prevent table bloat
 * Only deletes notifications that are both read AND older than 90 days
 * This preserves recent history while preventing infinite growth
 */
export async function cleanupOldNotifications(): Promise<number> {
  try {
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const result = await prisma.notification.deleteMany({
      where: {
        read: true,
        createdAt: { lt: ninetyDaysAgo }
      }
    })

    console.log(`Cleaned up ${result.count} old read notifications (90+ days old)`)
    return result.count
  } catch (error) {
    console.error('Error cleaning up old notifications:', error)
    return 0
  }
}
