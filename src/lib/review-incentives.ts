import { createClient } from '@supabase/supabase-js'
import { xpAnalyticsService } from './xp-analytics'
import { achievementEngine } from './achievement-engine'
import { prisma } from './prisma'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface ReviewReward {
  baseReward: number
  qualityBonus: number
  timelinessBonus: number
  streakBonus: number
  totalReward: number
  penalties: number
  netReward: number
}

export interface ReviewerPerformance {
  reviewerId: string
  weeklyStats: {
    reviewsCompleted: number
    reviewsMissed: number
    averageQuality: number
    onTimePercentage: number
    streakWeeks: number
  }
  rewards: {
    totalXpEarned: number
    bonusesEarned: number
    penaltiesApplied: number
  }
  rank: 'novice' | 'experienced' | 'expert' | 'master'
}

/**
 * Service for managing review incentives and penalties
 */
export class ReviewIncentivesService {
  private readonly BASE_REVIEW_REWARD = 50
  private readonly QUALITY_BONUS_THRESHOLD = 4.0 // Quality rating threshold for bonus
  private readonly QUALITY_BONUS_AMOUNT = 2
  private readonly TIMELINESS_BONUS_HOURS = 24 // Complete within 24 hours for bonus
  private readonly TIMELINESS_BONUS_AMOUNT = 5
  private readonly STREAK_BONUS_AMOUNT = 1 // Per week of streak
  private readonly MISSED_REVIEW_PENALTY = -10
  private readonly LATE_REVIEW_PENALTY = -2
  private readonly POOR_QUALITY_PENALTY = -3 // For consistently poor reviews

  /**
   * Calculate and award XP for a completed review
   */
  async awardReviewXp(
    reviewerId: string,
    submissionId: string,
    qualityRating: number | null,
    timeSpent: number,
    isLate: boolean,
    assignedAt: Date
  ): Promise<ReviewReward> {
    try {
      const reward: ReviewReward = {
        baseReward: this.BASE_REVIEW_REWARD,
        qualityBonus: 0,
        timelinessBonus: 0,
        streakBonus: 0,
        totalReward: 0,
        penalties: 0,
        netReward: 0
      }

      // V2: Remove self-assessed quality bonus (determined automatically post-consensus)
      reward.qualityBonus = 0

      // Calculate timeliness bonus
      const completionTime = Date.now() - assignedAt.getTime()
      const hoursToComplete = completionTime / (1000 * 60 * 60)
      
      if (!isLate && hoursToComplete <= this.TIMELINESS_BONUS_HOURS) {
        reward.timelinessBonus = this.TIMELINESS_BONUS_AMOUNT
      }

      // Calculate late penalty
      if (isLate) {
        reward.penalties += this.LATE_REVIEW_PENALTY
      }

      // Calculate streak bonus
      const streakBonus = await this.calculateStreakBonus(reviewerId)
      reward.streakBonus = streakBonus

      // Calculate totals
      reward.totalReward = reward.baseReward + reward.qualityBonus + reward.timelinessBonus + reward.streakBonus
      reward.netReward = reward.totalReward + reward.penalties // penalties are negative

      // Apply the XP reward
      if (reward.netReward > 0) {
        await this.applyXpReward(reviewerId, reward.netReward, submissionId, reward)
      }

      // Check for achievements
      await achievementEngine.evaluateAchievements(reviewerId, 'review')

      console.log(`💰 Review XP awarded to ${reviewerId}: ${reward.netReward} XP (base: ${reward.baseReward}, quality: ${reward.qualityBonus}, timeliness: ${reward.timelinessBonus}, streak: ${reward.streakBonus}, penalties: ${reward.penalties})`)

      return reward

    } catch (error) {
      console.error('Error awarding review XP:', error)
      throw error
    }
  }

  /**
   * Apply penalty for missed review
   */
  async applyMissedReviewPenalty(reviewerId: string, submissionId: string): Promise<void> {
    try {
      // Apply XP penalty
      await this.applyXpPenalty(
        reviewerId,
        this.MISSED_REVIEW_PENALTY,
        submissionId,
        'Missed review deadline'
      )

      // Update missed reviews count
      await prisma.user.update({
        where: { id: reviewerId },
        data: {
          missedReviews: {
            increment: 1
          }
        }
      })

      // Check if reviewer should be temporarily suspended
      await this.checkReviewerSuspension(reviewerId)

      console.log(`⚠️ Missed review penalty applied to ${reviewerId}: ${this.MISSED_REVIEW_PENALTY} XP`)

    } catch (error) {
      console.error('Error applying missed review penalty:', error)
      throw error
    }
  }

  /**
   * Get reviewer performance metrics
   */
  async getReviewerPerformance(reviewerId: string): Promise<ReviewerPerformance> {
    try {
      // Get current week number
      const currentWeek = this.getCurrentWeekNumber()
      const startOfWeek = this.getWeekStartDate(currentWeek)

      // Get weekly review statistics
      const { data: weeklyAssignments } = await supabase
        .from('ReviewAssignment')
        .select('status, completedAt, assignedAt, deadline')
        .eq('reviewerId', reviewerId)
        .gte('assignedAt', startOfWeek.toISOString())

      // Get weekly reviews with quality ratings
      const { data: weeklyReviews } = await supabase
        .from('PeerReview')
        .select('qualityRating, isLate, createdAt')
        .eq('reviewerId', reviewerId)
        .gte('createdAt', startOfWeek.toISOString())

      // Get user data
      const { data: user } = await supabase
        .from('User')
        .select('streakWeeks, missedReviews, totalXp')
        .eq('id', reviewerId)
        .single()

      // Calculate weekly stats
      const reviewsCompleted = weeklyAssignments?.filter(a => a.status === 'COMPLETED').length || 0
      const reviewsMissed = weeklyAssignments?.filter(a => a.status === 'MISSED').length || 0
      
      const qualityRatings = weeklyReviews?.filter(r => r.qualityRating).map(r => r.qualityRating) || []
      const averageQuality = qualityRatings.length > 0
        ? qualityRatings.reduce((sum, rating) => sum + rating, 0) / qualityRatings.length
        : 0

      const onTimeReviews = weeklyReviews?.filter(r => !r.isLate).length || 0
      const onTimePercentage = weeklyReviews && weeklyReviews.length > 0
        ? (onTimeReviews / weeklyReviews.length) * 100
        : 100

      // Get XP rewards from reviews
      const { data: xpTransactions } = await supabase
        .from('XpTransaction')
        .select('amount, type')
        .eq('userId', reviewerId)
        .eq('type', 'REVIEW_REWARD')
        .gte('createdAt', startOfWeek.toISOString())

      const totalXpEarned = xpTransactions?.reduce((sum, tx) => sum + tx.amount, 0) || 0

      // Calculate reviewer rank
      const rank = this.calculateReviewerRank(user?.totalXp || 0, reviewsCompleted, averageQuality)

      return {
        reviewerId,
        weeklyStats: {
          reviewsCompleted,
          reviewsMissed,
          averageQuality: Math.round(averageQuality * 10) / 10,
          onTimePercentage: Math.round(onTimePercentage),
          streakWeeks: user?.streakWeeks || 0
        },
        rewards: {
          totalXpEarned,
          bonusesEarned: 0, // TODO: Calculate from transaction details
          penaltiesApplied: 0 // TODO: Calculate from penalty transactions
        },
        rank
      }

    } catch (error) {
      console.error('Error getting reviewer performance:', error)
      throw error
    }
  }

  /**
   * Get top reviewers for leaderboard
   */
  async getTopReviewers(timeframe: 'week' | 'month' | 'all_time' = 'week', limit: number = 10): Promise<any[]> {
    try {
      let startDate: Date | null = null
      
      if (timeframe === 'week') {
        startDate = this.getWeekStartDate(this.getCurrentWeekNumber())
      } else if (timeframe === 'month') {
        startDate = new Date()
        startDate.setMonth(startDate.getMonth() - 1)
      }

      // Get reviewers with their performance metrics
      const query = supabase
        .from('User')
        .select(`
          id,
          username,
          totalXp,
          streakWeeks,
          missedReviews,
          peerReviews:PeerReview(
            id,
            qualityRating,
            isLate,
            createdAt
          )
        `)
        .in('role', ['REVIEWER', 'ADMIN'])
        .order('totalXp', { ascending: false })
        .limit(limit * 2) // Get more to filter and rank properly

      const { data: users, error } = await query

      if (error || !users) {
        return []
      }

      // Calculate performance metrics and rank
      const rankedReviewers = users
        .map(user => {
          const reviews = user.peerReviews || []
          let filteredReviews = reviews

          if (startDate) {
            filteredReviews = reviews.filter(r => new Date(r.createdAt) >= startDate!)
          }

          const reviewCount = filteredReviews.length
          const qualityRatings = filteredReviews.filter(r => r.qualityRating).map(r => r.qualityRating)
          const averageQuality = qualityRatings.length > 0
            ? qualityRatings.reduce((sum, rating) => sum + rating, 0) / qualityRatings.length
            : 0

          const onTimeReviews = filteredReviews.filter(r => !r.isLate).length
          const onTimePercentage = reviewCount > 0 ? (onTimeReviews / reviewCount) * 100 : 100

          // Calculate performance score
          const performanceScore = (reviewCount * 10) + (averageQuality * 20) + (onTimePercentage * 0.5) + (user.streakWeeks * 5) - (user.missedReviews * 10)

          return {
            id: user.id,
            username: user.username,
            totalXp: user.totalXp,
            reviewCount,
            averageQuality: Math.round(averageQuality * 10) / 10,
            onTimePercentage: Math.round(onTimePercentage),
            streakWeeks: user.streakWeeks,
            missedReviews: user.missedReviews,
            performanceScore: Math.round(performanceScore),
            rank: this.calculateReviewerRank(user.totalXp, reviewCount, averageQuality)
          }
        })
        .filter(reviewer => reviewer.reviewCount > 0 || timeframe === 'all_time')
        .sort((a, b) => b.performanceScore - a.performanceScore)
        .slice(0, limit)

      return rankedReviewers

    } catch (error) {
      console.error('Error getting top reviewers:', error)
      return []
    }
  }

  // Private helper methods

  private async calculateStreakBonus(reviewerId: string): Promise<number> {
    try {
      const { data: user } = await supabase
        .from('User')
        .select('streakWeeks')
        .eq('id', reviewerId)
        .single()

      const streakWeeks = user?.streakWeeks || 0
      return Math.min(streakWeeks * this.STREAK_BONUS_AMOUNT, 10) // Cap at 10 XP bonus

    } catch (error) {
      console.error('Error calculating streak bonus:', error)
      return 0
    }
  }

  private async applyXpReward(
    reviewerId: string,
    amount: number,
    submissionId: string,
    rewardDetails: ReviewReward
  ): Promise<void> {
    // Update user XP
    await prisma.user.update({
      where: { id: reviewerId },
      data: {
        totalXp: {
          increment: amount
        },
        currentWeekXp: {
          increment: amount
        }
      }
    })

    // Record XP transaction after successful update
    await xpAnalyticsService.recordXpTransaction(
      reviewerId,
      amount,
      'REVIEW_REWARD',
      `Review reward for submission ${submissionId}`,
      submissionId
    )
  }

  private async applyXpPenalty(
    reviewerId: string,
    penalty: number,
    submissionId: string,
    reason: string
  ): Promise<void> {
    // Record XP transaction (penalty is negative)
    await xpAnalyticsService.recordXpTransaction(
      reviewerId,
      penalty,
      'PENALTY',
      reason,
      submissionId
    )

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: reviewerId },
        select: {
          totalXp: true,
          currentWeekXp: true
        }
      })

      if (!user) {
        return
      }

      const nextTotal = Math.max(0, (user.totalXp ?? 0) + penalty)
      const nextWeek = Math.max(0, (user.currentWeekXp ?? 0) + penalty)

      await tx.user.update({
        where: { id: reviewerId },
        data: {
          totalXp: nextTotal,
          currentWeekXp: nextWeek
        }
      })
    })
  }

  private async checkReviewerSuspension(reviewerId: string): Promise<void> {
    try {
      const { data: user } = await supabase
        .from('User')
        .select('missedReviews, role')
        .eq('id', reviewerId)
        .single()

      if (!user) return

      // Temporarily suspend reviewer if they have missed too many reviews
      if (user.missedReviews >= 5 && user.role === 'REVIEWER') {
        // TODO: Implement temporary suspension logic
        console.log(`⚠️ Reviewer ${reviewerId} should be temporarily suspended (${user.missedReviews} missed reviews)`)
      }

    } catch (error) {
      console.error('Error checking reviewer suspension:', error)
    }
  }

  private calculateReviewerRank(totalXp: number, reviewCount: number, averageQuality: number): 'novice' | 'experienced' | 'expert' | 'master' {
    if (totalXp >= 2000 && reviewCount >= 100 && averageQuality >= 4.5) {
      return 'master'
    } else if (totalXp >= 1000 && reviewCount >= 50 && averageQuality >= 4.0) {
      return 'expert'
    } else if (totalXp >= 500 && reviewCount >= 20 && averageQuality >= 3.5) {
      return 'experienced'
    } else {
      return 'novice'
    }
  }

  private getCurrentWeekNumber(): number {
    const now = new Date()
    const startOfYear = new Date(now.getFullYear(), 0, 1)
    const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
    return Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7)
  }

  private getWeekStartDate(weekNumber: number): Date {
    const year = new Date().getFullYear()
    const startOfYear = new Date(year, 0, 1)
    const daysToAdd = (weekNumber - 1) * 7 - startOfYear.getDay()
    
    const weekStart = new Date(startOfYear)
    weekStart.setDate(startOfYear.getDate() + daysToAdd)
    weekStart.setHours(0, 0, 0, 0)
    
    return weekStart
  }
}

// Export singleton instance
export const reviewIncentivesService = new ReviewIncentivesService()
