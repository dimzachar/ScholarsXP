import { createClient } from '@supabase/supabase-js'
import { ENABLE_ACHIEVEMENTS } from '@/config/feature-flags'
import { mapTransactionTypeToBucket } from './xp-ledger'
import { applyTransactionToBreakdown, createEmptyBreakdown } from './xp-ledger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface XpBreakdown {
  submissions: number
  reviews: number
  streaks: number
  achievements: number
  penalties: number
  adminAdjustments: number
  total: number
}

export interface XpTrend {
  week: number
  weekStart: string
  weekEnd: string
  xpEarned: number
  submissions: number
  reviews: number
  streaks: number
}

export interface XpAnalytics {
  currentWeek: XpBreakdown
  allTime: XpBreakdown
  weeklyTrends: XpTrend[]
  projectedWeeklyXp: number
  goalProgress: {
    taskType: string
    current: number
    maximum: number
    percentage: number
  }[]
  rank: {
    weekly: number
    allTime: number
    totalUsers: number
  }
}

export interface XpTransaction {
  id: string
  amount: number
  type: string
  description: string
  sourceId?: string
  weekNumber: number
  createdAt: Date
}

/**
 * Service for XP analytics and reporting
 */
export class XpAnalyticsService {
  /**
   * Get comprehensive XP analytics for a user
   */
  async getUserXpAnalytics(userId: string): Promise<XpAnalytics> {
    try {
      const [
        currentWeekBreakdown,
        allTimeBreakdown,
        weeklyTrends,
        goalProgress,
        rank
      ] = await Promise.all([
        this.getCurrentWeekBreakdown(userId),
        this.getAllTimeBreakdown(userId),
        this.getWeeklyTrends(userId),
        this.getGoalProgress(userId),
        this.getUserRank(userId)
      ])

      const projectedWeeklyXp = this.calculateProjectedWeeklyXp(weeklyTrends)

      return {
        currentWeek: currentWeekBreakdown,
        allTime: allTimeBreakdown,
        weeklyTrends,
        projectedWeeklyXp,
        goalProgress,
        rank
      }
    } catch (error) {
      console.error('Error getting user XP analytics:', error)
      throw error
    }
  }

  /**
   * Get XP breakdown for current week
   */
  async getCurrentWeekBreakdown(userId: string): Promise<XpBreakdown> {
    const currentWeek = this.getCurrentWeekNumber()
    return this.getXpBreakdownForWeek(userId, currentWeek)
  }

  /**
   * Get all-time XP breakdown
   */
  async getAllTimeBreakdown(userId: string): Promise<XpBreakdown> {
    try {
      const { data: transactions, error } = await supabase
        .from('XpTransaction')
        .select('amount, type')
        .eq('userId', userId)

      if (error) {
        console.error('Error fetching XP transactions:', error)
        return this.getEmptyBreakdown()
      }

      return this.calculateBreakdownFromTransactions(transactions || [])
    } catch (error) {
      console.error('Error in getAllTimeBreakdown:', error)
      return this.getEmptyBreakdown()
    }
  }

  /**
   * Get XP breakdown for a specific week
   */
  async getXpBreakdownForWeek(userId: string, weekNumber: number): Promise<XpBreakdown> {
    try {
      const { data: transactions, error } = await supabase
        .from('XpTransaction')
        .select('amount, type')
        .eq('userId', userId)
        .eq('weekNumber', weekNumber)

      if (error) {
        console.error('Error fetching weekly XP transactions:', error)
        return this.getEmptyBreakdown()
      }

      return this.calculateBreakdownFromTransactions(transactions || [])
    } catch (error) {
      console.error('Error in getXpBreakdownForWeek:', error)
      return this.getEmptyBreakdown()
    }
  }

  /**
   * Get weekly XP trends for the last 12 weeks
   */
  async getWeeklyTrends(userId: string, weeks: number = 12): Promise<XpTrend[]> {
    try {
      const currentWeek = this.getCurrentWeekNumber()
      const startWeek = Math.max(1, currentWeek - weeks + 1)

      const { data: transactions, error } = await supabase
        .from('XpTransaction')
        .select('amount, type, weekNumber, createdAt')
        .eq('userId', userId)
        .gte('weekNumber', startWeek)
        .lte('weekNumber', currentWeek)
        .order('weekNumber', { ascending: true })

      if (error) {
        console.error('Error fetching weekly trends:', error)
        return []
      }

      // Group transactions by week
      const weeklyData = new Map<number, {
        xpEarned: number
        submissions: number
        reviews: number
        streaks: number
      }>()

      transactions?.forEach(transaction => {
        const bucket = mapTransactionTypeToBucket(transaction.type)

        if (!ENABLE_ACHIEVEMENTS && (bucket === 'achievements' || bucket === 'adminAdjustments')) {
          return
        }

        const week = transaction.weekNumber
        if (!weeklyData.has(week)) {
          weeklyData.set(week, { xpEarned: 0, submissions: 0, reviews: 0, streaks: 0 })
        }

        const data = weeklyData.get(week)!
        data.xpEarned += transaction.amount

        // Count activities by type
        switch (transaction.type) {
          case 'SUBMISSION_REWARD':
            data.submissions++
            break
          case 'REVIEW_REWARD':
            data.reviews++
            break
          case 'STREAK_BONUS':
            data.streaks++
            break
        }
      })

      // Convert to trend array
      const trends: XpTrend[] = []
      for (let week = startWeek; week <= currentWeek; week++) {
        const data = weeklyData.get(week) || { xpEarned: 0, submissions: 0, reviews: 0, streaks: 0 }
        const { weekStart, weekEnd } = this.getWeekDates(week)

        trends.push({
          week,
          weekStart: weekStart.toISOString(),
          weekEnd: weekEnd.toISOString(),
          ...data
        })
      }

      return trends
    } catch (error) {
      console.error('Error in getWeeklyTrends:', error)
      return []
    }
  }

  /**
   * Get goal progress for current week
   */
  async getGoalProgress(userId: string): Promise<XpAnalytics['goalProgress']> {
    try {
      const currentWeek = this.getCurrentWeekNumber()

      // V2: Overall weekly cap progress (max 5 finalized submissions)
      try {
        const { count, error } = await supabase
          .from('Submission')
          .select('*', { count: 'exact', head: true })
          .eq('userId', userId)
          .eq('weekNumber', currentWeek)
          .eq('status', 'FINALIZED')

        if (!error) {
          const finalized = count || 0
          const maximum = 5
          const percentage = Math.min(100, Math.round((finalized / maximum) * 100))
          return [{ taskType: 'Submissions', current: finalized, maximum, percentage }]
        }
      } catch (e) {
        console.warn('Weekly cap goal progress fallback to legacy logic', e)
      }

      // Get current week submissions grouped by task type
      const { data: submissions, error } = await supabase
        .from('Submission')
        .select('taskTypes, finalXp')
        .eq('userId', userId)
        .eq('weekNumber', currentWeek)
        .not('finalXp', 'is', null)

      if (error) {
        console.error('Error fetching goal progress:', error)
        return []
      }

      // Task type limits (max 3 completions per task type per week)
      const taskTypeLimits = {
        'A': { max: 3, maxXp: 90 },   // 3 × 30 XP
        'B': { max: 3, maxXp: 450 },  // 3 × 150 XP
        'C': { max: 3, maxXp: 90 },   // 3 × 30 XP
        'D': { max: 3, maxXp: 225 },  // 3 × 75 XP
        'E': { max: 3, maxXp: 225 },  // 3 × 75 XP
        'F': { max: 3, maxXp: 225 }   // 3 × 75 XP
      }

      // Count submissions and XP by task type
      const taskTypeProgress = new Map<string, { count: number; xp: number }>()

      submissions?.forEach(submission => {
        submission.taskTypes.forEach((taskType: string) => {
          if (!taskTypeProgress.has(taskType)) {
            taskTypeProgress.set(taskType, { count: 0, xp: 0 })
          }
          const progress = taskTypeProgress.get(taskType)!
          progress.count++
          progress.xp += submission.finalXp || 0
        })
      })

      // Build goal progress array
      const goalProgressArray = Object.entries(taskTypeLimits).map(([taskType, limits]) => {
        const progress = taskTypeProgress.get(taskType) || { count: 0, xp: 0 }
        return {
          taskType,
          current: progress.count,
          maximum: limits.max,
          percentage: Math.round((progress.count / limits.max) * 100)
        }
      })

      return goalProgressArray

    } catch (error) {
      console.error('Error in getGoalProgress:', error)
      return []
    }
  }

  /**
   * Get user rank (weekly and all-time)
   */
  async getUserRank(userId: string): Promise<XpAnalytics['rank']> {
    try {
      const currentWeek = this.getCurrentWeekNumber()

      // Get user's current XP
      const { data: user, error: userError } = await supabase
        .from('User')
        .select('totalXp, currentWeekXp')
        .eq('id', userId)
        .single()

      if (userError || !user) {
        console.error('Error fetching user data for rank:', userError)
        return { weekly: 0, allTime: 0, totalUsers: 0 }
      }



      // Get all-time rank by counting users with higher totalXp
      const { count: allTimeRank, error: _allTimeError } = await supabase
        .from('User')
        .select('*', { count: 'exact', head: true })
        .gt('totalXp', user.totalXp)
        .neq('role', 'ADMIN')

      // Get weekly rank from WeeklyStats
      const { data: userWeeklyStats, error: weeklyStatsError } = await supabase
        .from('WeeklyStats')
        .select('xpTotal')
        .eq('userId', userId)
        .eq('weekNumber', currentWeek)
        .single()

      let weeklyRank = 0
      if (!weeklyStatsError && userWeeklyStats) {
        const { count: weeklyRankCount, error: weeklyRankError } = await supabase
          .from('WeeklyStats')
          .select('*', { count: 'exact', head: true })
          .eq('weekNumber', currentWeek)
          .gt('xpTotal', userWeeklyStats.xpTotal)

        if (!weeklyRankError) {
          weeklyRank = (weeklyRankCount || 0) + 1
        }
      }

      // Get total users count (excluding admins)
      const { count: totalUsers } = await supabase
        .from('User')
        .select('*', { count: 'exact', head: true })
        .neq('role', 'ADMIN')

      return {
        weekly: weeklyRank,
        allTime: (allTimeRank || 0) + 1, // Add 1 because count gives users above
        totalUsers: totalUsers || 0
      }
    } catch (error) {
      console.error('Error in getUserRank:', error)
      return { weekly: 0, allTime: 0, totalUsers: 0 }
    }
  }

  /**
   * Record XP transaction
   */
  async recordXpTransaction(
    userId: string,
    amount: number,
    type: string,
    description: string,
    sourceId?: string
  ): Promise<void> {
    try {
      const weekNumber = this.getCurrentWeekNumber()

      const { error } = await supabase
        .from('XpTransaction')
        .insert({
          userId,
          amount,
          type,
          description,
          sourceId,
          weekNumber
        })

      if (error) {
        console.error('Error recording XP transaction:', error)
        throw error
      }

      console.log(`📊 Recorded XP transaction: ${amount} XP for user ${userId} (${type})`)
    } catch (error) {
      console.error('Error in recordXpTransaction:', error)
      throw error
    }
  }

  /**
   * Get XP transaction history for a user
   */
  async getXpTransactionHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<XpTransaction[]> {
    try {
      const { data: transactions, error } = await supabase
        .from('XpTransaction')
        .select('*')
        .eq('userId', userId)
        .order('createdAt', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) {
        console.error('Error fetching XP transaction history:', error)
        return []
      }

      return transactions?.map(t => ({
        ...t,
        createdAt: new Date(t.createdAt)
      })) || []
    } catch (error) {
      console.error('Error in getXpTransactionHistory:', error)
      return []
    }
  }

  // Helper methods

  private calculateBreakdownFromTransactions(transactions: any[]): XpBreakdown {
    const breakdown = createEmptyBreakdown()

    transactions.forEach(transaction => {
      applyTransactionToBreakdown(breakdown, {
        amount: transaction.amount,
        type: transaction.type
      })
    })

    const { other, ...normalized } = breakdown
    return normalized
  }

  private getEmptyBreakdown(): XpBreakdown {
    const { other, ...empty } = createEmptyBreakdown()
    return empty
  }

  private calculateProjectedWeeklyXp(trends: XpTrend[]): number {
    if (trends.length < 2) return 0

    // Calculate average XP from last 4 weeks
    const recentTrends = trends.slice(-4)
    const averageXp = recentTrends.reduce((sum, trend) => sum + trend.xpEarned, 0) / recentTrends.length
    
    return Math.round(averageXp)
  }

  private getCurrentWeekNumber(): number {
    const now = new Date()
    const startOfYear = new Date(now.getFullYear(), 0, 1)
    const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
    return Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7)
  }

  private getWeekDates(weekNumber: number): { weekStart: Date; weekEnd: Date } {
    const year = new Date().getFullYear()
    const startOfYear = new Date(year, 0, 1)
    const daysToAdd = (weekNumber - 1) * 7 - startOfYear.getDay()
    
    const weekStart = new Date(startOfYear)
    weekStart.setDate(startOfYear.getDate() + daysToAdd)
    weekStart.setHours(0, 0, 0, 0)
    
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)
    
    return { weekStart, weekEnd }
  }
}

// Export singleton instance
export const xpAnalyticsService = new XpAnalyticsService()
