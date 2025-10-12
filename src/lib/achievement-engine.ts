import { createClient } from '@supabase/supabase-js'
import { ENABLE_ACHIEVEMENTS } from '@/config/feature-flags'
import { xpAnalyticsService } from './xp-analytics'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface Achievement {
  id: string
  name: string
  description: string
  category: 'SUBMISSION' | 'REVIEW' | 'STREAK' | 'MILESTONE' | 'SPECIAL'
  iconUrl?: string
  xpReward: number
  criteria: AchievementCriteria
  isActive: boolean
  createdAt: Date
}

export interface AchievementCriteria {
  type: 'count' | 'streak' | 'xp_threshold' | 'quality' | 'speed' | 'composite'
  target: number
  timeframe?: 'week' | 'month' | 'all_time'
  conditions?: Record<string, any>
}

export interface UserAchievement {
  id: string
  userId: string
  achievementId: string
  earnedAt: Date
  achievement?: Achievement
}

export interface AchievementProgress {
  achievement: Achievement
  progress: number
  target: number
  percentage: number
  isCompleted: boolean
  earnedAt?: Date
}

/**
 * Service for managing achievements and evaluating user progress
 */
export class AchievementEngine {
  /**
   * Initialize default achievements
   */
  async initializeDefaultAchievements(): Promise<void> {
    const defaultAchievements = [
      // Submission achievements
      {
        name: 'First Steps',
        description: 'Submit your first piece of content',
        category: 'SUBMISSION',
        xpReward: 10,
        criteria: { type: 'count', target: 1, timeframe: 'all_time' }
      },
      {
        name: 'Content Creator',
        description: 'Submit 10 pieces of content',
        category: 'SUBMISSION',
        xpReward: 25,
        criteria: { type: 'count', target: 10, timeframe: 'all_time' }
      },
      {
        name: 'Prolific Writer',
        description: 'Submit 50 pieces of content',
        category: 'SUBMISSION',
        xpReward: 100,
        criteria: { type: 'count', target: 50, timeframe: 'all_time' }
      },
      {
        name: 'Weekly Warrior',
        description: 'Submit content every day for a week',
        category: 'SUBMISSION',
        xpReward: 50,
        criteria: { type: 'streak', target: 7, timeframe: 'week' }
      },

      // Review achievements
      {
        name: 'Helpful Reviewer',
        description: 'Complete your first peer review',
        category: 'REVIEW',
        xpReward: 10,
        criteria: { type: 'count', target: 1, timeframe: 'all_time' }
      },
      {
        name: 'Review Expert',
        description: 'Complete 25 peer reviews',
        category: 'REVIEW',
        xpReward: 50,
        criteria: { type: 'count', target: 25, timeframe: 'all_time' }
      },
      {
        name: 'Quality Reviewer',
        description: 'Maintain an average review quality of 4.5/5',
        category: 'REVIEW',
        xpReward: 75,
        criteria: { type: 'quality', target: 4.5, timeframe: 'all_time' }
      },
      {
        name: 'Speed Reviewer',
        description: 'Complete 10 reviews within 24 hours of assignment',
        category: 'REVIEW',
        xpReward: 40,
        criteria: { type: 'speed', target: 10, timeframe: 'all_time' }
      },

      // Streak achievements
      {
        name: 'Consistent Contributor',
        description: 'Maintain a 4-week streak',
        category: 'STREAK',
        xpReward: 50,
        criteria: { type: 'streak', target: 4, timeframe: 'all_time' }
      },
      {
        name: 'Dedication Master',
        description: 'Maintain a 12-week streak',
        category: 'STREAK',
        xpReward: 200,
        criteria: { type: 'streak', target: 12, timeframe: 'all_time' }
      },

      // XP milestone achievements
      {
        name: 'Rising Scholar',
        description: 'Reach 100 total XP',
        category: 'MILESTONE',
        xpReward: 25,
        criteria: { type: 'xp_threshold', target: 100, timeframe: 'all_time' }
      },
      {
        name: 'Experienced Scholar',
        description: 'Reach 500 total XP',
        category: 'MILESTONE',
        xpReward: 50,
        criteria: { type: 'xp_threshold', target: 500, timeframe: 'all_time' }
      },
      {
        name: 'Master Scholar',
        description: 'Reach 1000 total XP',
        category: 'MILESTONE',
        xpReward: 100,
        criteria: { type: 'xp_threshold', target: 1000, timeframe: 'all_time' }
      },
      {
        name: 'Elite Scholar',
        description: 'Reach 2500 total XP',
        category: 'MILESTONE',
        xpReward: 250,
        criteria: { type: 'xp_threshold', target: 2500, timeframe: 'all_time' }
      },

      // Special achievements
      {
        name: 'Perfect Week',
        description: 'Complete all weekly task type caps in a single week',
        category: 'SPECIAL',
        xpReward: 100,
        criteria: { type: 'composite', target: 1, timeframe: 'week' }
      },
      {
        name: 'Community Helper',
        description: 'Help resolve 5 content flags through quality reviews',
        category: 'SPECIAL',
        xpReward: 75,
        criteria: { type: 'count', target: 5, timeframe: 'all_time' }
      }
    ]

    for (const achievement of defaultAchievements) {
      await this.createAchievement(achievement)
    }
  }

  /**
   * Create a new achievement
   */
  async createAchievement(achievementData: Omit<Achievement, 'id' | 'createdAt'>): Promise<Achievement | null> {
    try {
      const { data, error } = await supabase
        .from('Achievement')
        .insert({
          name: achievementData.name,
          description: achievementData.description,
          category: achievementData.category,
          iconUrl: achievementData.iconUrl,
          xpReward: achievementData.xpReward,
          criteria: achievementData.criteria,
          isActive: achievementData.isActive ?? true
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating achievement:', error)
        return null
      }

      return {
        ...data,
        createdAt: new Date(data.createdAt)
      }
    } catch (error) {
      console.error('Error in createAchievement:', error)
      return null
    }
  }

  /**
   * Get all active achievements
   */
  async getActiveAchievements(): Promise<Achievement[]> {
    if (!ENABLE_ACHIEVEMENTS) {
      return []
    }

    try {
      const { data, error } = await supabase
        .from('Achievement')
        .select('*')
        .eq('isActive', true)
        .order('category', { ascending: true })

      if (error) {
        console.error('Error fetching achievements:', error)
        return []
      }

      return data?.map(achievement => ({
        ...achievement,
        createdAt: new Date(achievement.createdAt)
      })) || []
    } catch (error) {
      console.error('Error in getActiveAchievements:', error)
      return []
    }
  }

  /**
   * Get user's earned achievements
   */
  async getUserAchievements(userId: string): Promise<UserAchievement[]> {
    if (!ENABLE_ACHIEVEMENTS) {
      return []
    }

    try {
      const { data, error } = await supabase
        .from('UserAchievement')
        .select(`
          *,
          achievement:Achievement(*)
        `)
        .eq('userId', userId)
        .order('earnedAt', { ascending: false })

      if (error) {
        console.error('Error fetching user achievements:', error)
        return []
      }

      return data?.map(userAchievement => ({
        ...userAchievement,
        earnedAt: new Date(userAchievement.earnedAt),
        achievement: userAchievement.achievement ? {
          ...userAchievement.achievement,
          createdAt: new Date(userAchievement.achievement.createdAt)
        } : undefined
      })) || []
    } catch (error) {
      console.error('Error in getUserAchievements:', error)
      return []
    }
  }

  /**
   * Get user's achievement progress
   */
  async getUserAchievementProgress(userId: string): Promise<AchievementProgress[]> {
    if (!ENABLE_ACHIEVEMENTS) {
      return []
    }

    try {
      const [achievements, userAchievements] = await Promise.all([
        this.getActiveAchievements(),
        this.getUserAchievements(userId)
      ])

      const earnedAchievementIds = new Set(userAchievements.map(ua => ua.achievementId))
      const progressList: AchievementProgress[] = []

      for (const achievement of achievements) {
        const isCompleted = earnedAchievementIds.has(achievement.id)
        const earnedAchievement = userAchievements.find(ua => ua.achievementId === achievement.id)
        
        let progress = 0
        if (!isCompleted) {
          progress = await this.calculateAchievementProgress(userId, achievement)
        } else {
          progress = achievement.criteria.target
        }

        progressList.push({
          achievement,
          progress,
          target: achievement.criteria.target,
          percentage: Math.min(100, Math.round((progress / achievement.criteria.target) * 100)),
          isCompleted,
          earnedAt: earnedAchievement?.earnedAt
        })
      }

      return progressList
    } catch (error) {
      console.error('Error in getUserAchievementProgress:', error)
      return []
    }
  }

  /**
   * Evaluate achievements for a user after an action
   */
  async evaluateAchievements(userId: string, triggerType: 'submission' | 'review' | 'xp_change'): Promise<Achievement[]> {
    if (!ENABLE_ACHIEVEMENTS) {
      return []
    }

    try {
      const newlyEarnedAchievements: Achievement[] = []
      const achievements = await this.getActiveAchievements()
      const userAchievements = await this.getUserAchievements(userId)
      const earnedAchievementIds = new Set(userAchievements.map(ua => ua.achievementId))

      // Filter achievements that haven't been earned yet
      const unearnedAchievements = achievements.filter(a => !earnedAchievementIds.has(a.id))

      for (const achievement of unearnedAchievements) {
        // Check if achievement is relevant to the trigger type
        if (!this.isAchievementRelevantToTrigger(achievement, triggerType)) {
          continue
        }

        const progress = await this.calculateAchievementProgress(userId, achievement)
        
        if (progress >= achievement.criteria.target) {
          // Achievement earned!
          const success = await this.awardAchievement(userId, achievement.id)
          if (success) {
            newlyEarnedAchievements.push(achievement)
          }
        }
      }

      return newlyEarnedAchievements
    } catch (error) {
      console.error('Error in evaluateAchievements:', error)
      return []
    }
  }

  /**
   * Award an achievement to a user
   */
  async awardAchievement(userId: string, achievementId: string): Promise<boolean> {
    if (!ENABLE_ACHIEVEMENTS) {
      return false
    }

    try {
      // Check if user already has this achievement
      const { data: existing } = await supabase
        .from('UserAchievement')
        .select('id')
        .eq('userId', userId)
        .eq('achievementId', achievementId)
        .single()

      if (existing) {
        return false // Already earned
      }

      // Award the achievement
      const { error: awardError } = await supabase
        .from('UserAchievement')
        .insert({
          userId,
          achievementId
        })

      if (awardError) {
        console.error('Error awarding achievement:', awardError)
        return false
      }

      // Get achievement details for XP reward
      const { data: achievement } = await supabase
        .from('Achievement')
        .select('name, xpReward')
        .eq('id', achievementId)
        .single()

      if (achievement && achievement.xpReward > 0) {
        await xpAnalyticsService.recordXpTransaction(
          userId,
          achievement.xpReward,
          'ACHIEVEMENT_BONUS',
          `Achievement earned: ${achievement.name}`,
          achievementId
        )

        await this.applyAchievementXpReward(userId, achievementId, achievement.xpReward)
      }

      console.log(`🏆 Achievement awarded: ${achievement?.name} to user ${userId}`)
      return true

    } catch (error) {
      console.error('Error in awardAchievement:', error)
      return false
    }
  }

  private async applyAchievementXpReward(userId: string, achievementId: string, xpReward: number): Promise<void> {
    try {
      const weekNumber = this.getCurrentWeekNumber()

      const { data: user, error: fetchError } = await supabase
        .from('User')
        .select('totalXp, currentWeekXp')
        .eq('id', userId)
        .single()

      if (fetchError || !user) {
        throw new Error(fetchError?.message || 'User not found while applying achievement XP')
      }

      const updatedTotals = {
        totalXp: (user.totalXp || 0) + xpReward,
        currentWeekXp: (user.currentWeekXp || 0) + xpReward
      }

      const { error: updateError } = await supabase
        .from('User')
        .update({
          totalXp: updatedTotals.totalXp,
          currentWeekXp: updatedTotals.currentWeekXp,
          updatedAt: new Date().toISOString()
        })
        .eq('id', userId)

      if (updateError) {
        throw new Error(updateError.message)
      }

      const { data: weeklyStats, error: weeklyFetchError } = await supabase
        .from('WeeklyStats')
        .select('xpTotal, reviewsDone, reviewsMissed, earnedStreak')
        .eq('userId', userId)
        .eq('weekNumber', weekNumber)
        .maybeSingle()

      if (weeklyFetchError && weeklyFetchError.code !== 'PGRST116') {
        console.error('Error fetching weekly stats for achievement XP:', weeklyFetchError)
      }

      const existingWeeklyXp = weeklyStats?.xpTotal || 0

      const { error: weeklyUpsertError } = await supabase
        .from('WeeklyStats')
        .upsert({
          userId,
          weekNumber,
          xpTotal: existingWeeklyXp + xpReward,
          reviewsDone: weeklyStats?.reviewsDone ?? 0,
          reviewsMissed: weeklyStats?.reviewsMissed ?? 0,
          earnedStreak: weeklyStats?.earnedStreak ?? (existingWeeklyXp + xpReward >= 100)
        }, { onConflict: 'userId,weekNumber' })

      if (weeklyUpsertError) {
        console.error('Error updating weekly stats for achievement XP:', weeklyUpsertError)
      }

      console.log('🏆 Achievement XP applied', {
        userId,
        achievementId,
        xpReward,
        totalXp: updatedTotals.totalXp,
        currentWeekXp: updatedTotals.currentWeekXp,
        weekNumber
      })
    } catch (error) {
      console.error('Failed to apply achievement XP:', {
        userId,
        achievementId,
        xpReward,
        error
      })
      throw error
    }
  }

  private getCurrentWeekNumber(): number {
    const now = new Date()
    const startOfYear = new Date(now.getFullYear(), 0, 1)
    const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
    return Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7)
  }

  /**
   * Calculate progress towards an achievement
   */
  private async calculateAchievementProgress(userId: string, achievement: Achievement): Promise<number> {
    const { criteria } = achievement

    try {
      switch (criteria.type) {
        case 'count':
          return await this.calculateCountProgress(userId, achievement)
        
        case 'streak':
          return await this.calculateStreakProgress(userId, achievement)
        
        case 'xp_threshold':
          return await this.calculateXpThresholdProgress(userId, achievement)
        
        case 'quality':
          return await this.calculateQualityProgress(userId, achievement)
        
        case 'speed':
          return await this.calculateSpeedProgress(userId, achievement)
        
        case 'composite':
          return await this.calculateCompositeProgress(userId, achievement)
        
        default:
          return 0
      }
    } catch (error) {
      console.error('Error calculating achievement progress:', error)
      return 0
    }
  }

  private async calculateCountProgress(userId: string, achievement: Achievement): Promise<number> {
    const { criteria, category } = achievement

    if (category === 'SUBMISSION') {
      const { count } = await supabase
        .from('Submission')
        .select('*', { count: 'exact', head: true })
        .eq('userId', userId)
        .eq('status', 'FINALIZED')

      return count || 0
    }

    if (category === 'REVIEW') {
      const { count } = await supabase
        .from('PeerReview')
        .select('*', { count: 'exact', head: true })
        .eq('reviewerId', userId)

      return count || 0
    }

    return 0
  }

  private async calculateStreakProgress(userId: string, achievement: Achievement): Promise<number> {
    const { data: user } = await supabase
      .from('User')
      .select('streakWeeks')
      .eq('id', userId)
      .single()

    return user?.streakWeeks || 0
  }

  private async calculateXpThresholdProgress(userId: string, achievement: Achievement): Promise<number> {
    const { data: user } = await supabase
      .from('User')
      .select('totalXp')
      .eq('id', userId)
      .single()

    return user?.totalXp || 0
  }

  private async calculateQualityProgress(userId: string, achievement: Achievement): Promise<number> {
    // Calculate average review quality rating
    const { data: reviews } = await supabase
      .from('PeerReview')
      .select('qualityRating')
      .eq('reviewerId', userId)
      .not('qualityRating', 'is', null)

    if (!reviews || reviews.length === 0) return 0

    const averageQuality = reviews.reduce((sum, review) => sum + (review.qualityRating || 0), 0) / reviews.length
    return averageQuality
  }

  private async calculateSpeedProgress(userId: string, achievement: Achievement): Promise<number> {
    // Count reviews completed within 24 hours
    const { data: assignments } = await supabase
      .from('ReviewAssignment')
      .select('assignedAt, completedAt')
      .eq('reviewerId', userId)
      .eq('status', 'COMPLETED')
      .not('completedAt', 'is', null)

    if (!assignments) return 0

    let fastReviews = 0
    assignments.forEach(assignment => {
      const assigned = new Date(assignment.assignedAt)
      const completed = new Date(assignment.completedAt!)
      const hoursDiff = (completed.getTime() - assigned.getTime()) / (1000 * 60 * 60)
      
      if (hoursDiff <= 24) {
        fastReviews++
      }
    })

    return fastReviews
  }

  private async calculateCompositeProgress(userId: string, achievement: Achievement): Promise<number> {
    // Handle special composite achievements like "Perfect Week"
    if (achievement.name === 'Perfect Week') {
      // Check if user completed all task type caps in current week
      const goalProgress = await xpAnalyticsService.getGoalProgress(userId)
      const allCapsReached = goalProgress.every(goal => goal.current >= goal.maximum)
      return allCapsReached ? 1 : 0
    }

    return 0
  }

  private isAchievementRelevantToTrigger(achievement: Achievement, triggerType: string): boolean {
    switch (triggerType) {
      case 'submission':
        return ['SUBMISSION', 'MILESTONE', 'SPECIAL'].includes(achievement.category)
      case 'review':
        return ['REVIEW', 'MILESTONE', 'SPECIAL'].includes(achievement.category)
      case 'xp_change':
        return ['MILESTONE', 'STREAK'].includes(achievement.category)
      default:
        return true
    }
  }
}

// Export singleton instance
export const achievementEngine = new AchievementEngine()
