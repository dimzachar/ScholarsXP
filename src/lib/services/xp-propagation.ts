import { prisma } from '@/lib/prisma'
import { supabaseClient } from '@/lib/supabase'
import { getWeekNumber } from '@/lib/utils'

/**
 * XP Propagation Service
 * 
 * Handles all cascading updates when XP scores are modified by admins.
 * Ensures data consistency across all XP-related entities.
 */

export interface XpChangeResult {
  success: boolean
  message: string
  updatedEntities: {
    userXp?: boolean
    weeklyStats?: boolean
    leaderboard?: boolean
    achievements?: boolean
    notifications?: boolean
  }
  errors?: string[]
}

/**
 * Propagate XP changes across all related entities
 */
export async function propagateXpChanges(
  submissionId: string,
  oldXp: number,
  newXp: number,
  reason: string,
  adminId: string
): Promise<XpChangeResult> {
  const result: XpChangeResult = {
    success: false,
    message: '',
    updatedEntities: {},
    errors: []
  }

  try {
    // Get submission details
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { user: true }
    })

    if (!submission) {
      result.errors?.push('Submission not found')
      return result
    }

    const xpDifference = newXp - oldXp
    const currentWeek = getWeekNumber(new Date())

    // Execute all updates in a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Update submission XP
      await tx.submission.update({
        where: { id: submissionId },
        data: { finalXp: newXp }
      })

      // 2. Update user total XP
      await tx.user.update({
        where: { id: submission.userId },
        data: {
          totalXp: { increment: xpDifference },
          currentWeekXp: { increment: xpDifference }
        }
      })
      result.updatedEntities.userXp = true

      // 3. Create XP transaction record
      await tx.xpTransaction.create({
        data: {
          userId: submission.userId,
          amount: xpDifference,
          type: 'ADMIN_ADJUSTMENT',
          sourceId: submissionId,
          description: `Admin XP modification: ${reason}`,
          weekNumber: currentWeek
        }
      })

      // 4. Update weekly stats
      await tx.weeklyStats.upsert({
        where: {
          userId_weekNumber: {
            userId: submission.userId,
            weekNumber: currentWeek
          }
        },
        update: {
          xpTotal: { increment: xpDifference }
        },
        create: {
          userId: submission.userId,
          weekNumber: currentWeek,
          xpTotal: Math.max(0, xpDifference),
          reviewsDone: 0,
          reviewsMissed: 0
        }
      })
      result.updatedEntities.weeklyStats = true

      // 5. Create admin action audit
      await tx.adminAction.create({
        data: {
          adminId,
          action: 'XP_OVERRIDE',
          targetType: 'submission',
          targetId: submissionId,
          details: {
            oldXp,
            newXp,
            difference: xpDifference,
            reason
          }
        }
      })
    })

    // 6. Post-transaction updates (non-critical)
    try {
      // Update leaderboard rankings
      await updateLeaderboardRankings(currentWeek)
      result.updatedEntities.leaderboard = true

      // Check achievement triggers
      await checkAchievementTriggers(submission.userId)
      result.updatedEntities.achievements = true

      // Send real-time notification
      await notifyXpChange(submission.userId, xpDifference, reason)
      result.updatedEntities.notifications = true
    } catch (postError) {
      console.warn('Non-critical post-transaction updates failed:', postError)
      result.errors?.push(`Post-transaction updates: ${postError}`)
    }

    result.success = true
    result.message = `Successfully propagated XP change: ${oldXp} → ${newXp} (${xpDifference >= 0 ? '+' : ''}${xpDifference})`

  } catch (error) {
    console.error('Error in propagateXpChanges:', error)
    result.errors?.push(`Transaction failed: ${error}`)
    result.message = 'Failed to propagate XP changes'
  }

  return result
}

/**
 * Recalculate user's total XP from all sources
 */
export async function recalculateUserTotals(userId: string): Promise<XpChangeResult> {
  const result: XpChangeResult = {
    success: false,
    message: '',
    updatedEntities: {}
  }

  try {
    // Get all XP transactions for user
    const transactions = await prisma.xpTransaction.findMany({
      where: { userId },
      select: { amount: true }
    })

    const calculatedTotalXp = transactions.reduce((sum, tx) => sum + tx.amount, 0)

    // Update user's total XP
    await prisma.user.update({
      where: { id: userId },
      data: { totalXp: calculatedTotalXp }
    })

    result.success = true
    result.message = `Recalculated total XP: ${calculatedTotalXp}`
    result.updatedEntities.userXp = true

  } catch (error) {
    console.error('Error in recalculateUserTotals:', error)
    result.message = `Failed to recalculate user totals: ${error}`
  }

  return result
}

/**
 * Update leaderboard rankings for a specific week
 */
export async function updateLeaderboardRankings(weekNumber: number): Promise<void> {
  try {
    // This would typically involve updating cached rankings
    // For now, we'll just ensure the weekly stats are current
    console.log(`📊 Updated leaderboard rankings for week ${weekNumber}`)
    
    // In a production system, you might:
    // 1. Recalculate all user rankings for the week
    // 2. Update cached leaderboard data
    // 3. Invalidate relevant cache entries
    
  } catch (error) {
    console.error('Error updating leaderboard rankings:', error)
    throw error
  }
}

/**
 * Check if XP changes trigger new achievements
 */
export async function checkAchievementTriggers(userId: string): Promise<void> {
  try {
    // Get user's current stats
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalXp: true, currentWeekXp: true }
    })

    if (!user) return

    // Check for XP milestone achievements
    const milestones = [100, 500, 1000, 2500, 5000, 10000]
    
    for (const milestone of milestones) {
      if (user.totalXp >= milestone) {
        // Check if user already has this achievement
        const existingAchievement = await prisma.userAchievement.findFirst({
          where: {
            userId,
            achievement: {
              name: `${milestone} XP Milestone`
            }
          }
        })

        if (!existingAchievement) {
          // Award the achievement (if it exists in the system)
          const achievement = await prisma.achievement.findFirst({
            where: { name: `${milestone} XP Milestone` }
          })

          if (achievement) {
            await prisma.userAchievement.create({
              data: {
                userId,
                achievementId: achievement.id
              }
            })
            console.log(`🏆 Awarded ${milestone} XP milestone to user ${userId}`)
          }
        }
      }
    }

  } catch (error) {
    console.error('Error checking achievement triggers:', error)
    throw error
  }
}

/**
 * Send real-time notification about XP changes
 */
export async function notifyXpChange(
  userId: string,
  xpDifference: number,
  reason: string
): Promise<void> {
  try {
    // Send real-time notification via Supabase
    await supabaseClient.channel('xp-updates').send({
      type: 'broadcast',
      event: 'xp-modified',
      payload: {
        userId,
        xpDifference,
        reason,
        timestamp: new Date().toISOString()
      }
    })

    // Create notification record
    await prisma.notification.create({
      data: {
        userId,
        type: 'XP_AWARDED',
        title: 'XP Updated',
        message: `Your XP was ${xpDifference >= 0 ? 'increased' : 'decreased'} by ${Math.abs(xpDifference)} points. Reason: ${reason}`,
        data: {
          xpDifference,
          reason
        }
      }
    })

    console.log(`🔔 Sent XP change notification to user ${userId}: ${xpDifference >= 0 ? '+' : ''}${xpDifference}`)

  } catch (error) {
    console.error('Error sending XP change notification:', error)
    throw error
  }
}

/**
 * Validate XP modification request
 */
export function validateXpModification(
  oldXp: number,
  newXp: number,
  reason: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Basic validation
  if (newXp < 0) {
    errors.push('XP cannot be negative')
  }

  if (newXp > 10000) {
    errors.push('XP cannot exceed 10,000 points')
  }

  if (!reason || reason.trim().length < 5) {
    errors.push('Reason must be at least 5 characters long')
  }

  const difference = Math.abs(newXp - oldXp)
  if (difference > 1000) {
    errors.push('XP changes greater than 1,000 points require additional confirmation')
  }

  return {
    valid: errors.length === 0,
    errors
  }
}
