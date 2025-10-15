import { prisma } from '@/lib/prisma'
import { getWeekNumber } from '@/lib/utils'

export interface WeeklyProcessingResult {
  usersProcessed: number
  streaksAwarded: number
  penaltiesApplied: number
  leaderboardGenerated: boolean
  rateLimitRecordsCleaned: number
  notificationsCleaned: number
}

export async function processWeeklyReset(): Promise<WeeklyProcessingResult> {
  try {
    const currentWeek = getWeekNumber(new Date())
    const previousWeek = currentWeek - 1

    console.log(`Processing weekly reset for week ${previousWeek} -> ${currentWeek}`)

    // Get all users
    const users = await prisma.user.findMany()
    
    let usersProcessed = 0
    let streaksAwarded = 0
    let penaltiesApplied = 0

    for (const user of users) {
      try {
        // Get or create weekly stats for previous week
        let weeklyStats = await prisma.weeklyStats.findFirst({
          where: {
            userId: user.id,
            weekNumber: previousWeek
          }
        })

        if (!weeklyStats) {
          weeklyStats = await prisma.weeklyStats.create({
            data: {
              userId: user.id,
              weekNumber: previousWeek,
              xpTotal: user.currentWeekXp,
              reviewsDone: 0,
              reviewsMissed: user.missedReviews
            }
          })
        }

        // Check for streak eligibility (100+ XP for the week)
        let newStreakWeeks = user.streakWeeks
        let earnedStreak = false

        if (weeklyStats.xpTotal >= 100) {
          newStreakWeeks += 1
          earnedStreak = true
          
          // Award Parthenon XP bonus for 4-week streak
          if (newStreakWeeks % 4 === 0) {
            const bonusXp = 50 // Parthenon bonus
            await prisma.user.update({
              where: { id: user.id },
              data: {
                totalXp: { increment: bonusXp }
              }
            })
            console.log(`Awarded ${bonusXp} Parthenon XP to user ${user.username} for ${newStreakWeeks}-week streak`)
          }
          
          streaksAwarded++
        } else {
          // Reset streak if didn't meet minimum XP
          newStreakWeeks = 0
        }

        // Apply review penalties
        const reviewPenalty = user.missedReviews * 50 // 50 XP penalty per missed review
        if (reviewPenalty > 0) {
          penaltiesApplied++
        }

        // Update user for new week
        await prisma.user.update({
          where: { id: user.id },
          data: {
            currentWeekXp: 0, // Reset weekly XP
            streakWeeks: newStreakWeeks,
            missedReviews: 0, // Reset missed reviews counter
            totalXp: { decrement: reviewPenalty } // Apply penalties
          }
        })

        // Update weekly stats
        await prisma.weeklyStats.update({
          where: { id: weeklyStats.id },
          data: {
            earnedStreak
          }
        })

        usersProcessed++

      } catch (userError) {
        console.error(`Error processing user ${user.id}:`, userError)
      }
    }

    // Generate leaderboard for the completed week
    const leaderboardGenerated = await generateWeeklyLeaderboard(previousWeek)

    // Clean up expired rate limit records
    const rateLimitRecordsCleaned = await cleanupExpiredRateLimits()

    // Clean up old read notifications (90+ days old)
    const notificationsCleaned = await cleanupOldNotifications()

    console.log(`Weekly reset completed: ${usersProcessed} users processed, ${streaksAwarded} streaks awarded, ${penaltiesApplied} penalties applied, ${rateLimitRecordsCleaned} rate limit records cleaned, ${notificationsCleaned} old notifications cleaned`)

    return {
      usersProcessed,
      streaksAwarded,
      penaltiesApplied,
      leaderboardGenerated,
      rateLimitRecordsCleaned,
      notificationsCleaned
    }

  } catch (error) {
    console.error('Error in weekly reset:', error)
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

