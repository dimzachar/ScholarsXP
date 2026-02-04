import { createClient } from '@supabase/supabase-js'
import { ENABLE_ACHIEVEMENTS } from '@/config/feature-flags'
import { mapTransactionTypeToBucket } from './xp-ledger'
import { applyTransactionToBreakdown, createEmptyBreakdown } from './xp-ledger'
import { getWeekNumber } from '@/lib/utils'
import { getGamifiedRank } from '@/lib/gamified-ranks'
import { notifyRankPromoted } from '@/lib/notifications'

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
    weeklyActiveUsers: number
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
    // Always fetch fresh data from database, no caching
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
      // Add cache-busting to ensure fresh data
      const { data: transactions, error } = await supabase
        .from('XpTransaction')
        .select('amount, type')
        .eq('userId', userId)
        .eq('weekNumber', weekNumber)
        .order('createdAt', { ascending: false })

      if (error) {
        console.error('Error fetching weekly XP transactions:', error)
        return this.getEmptyBreakdown()
      }

      // console.log(`📊 Analytics: Found ${transactions?.length || 0} transactions for user ${userId}, week ${weekNumber}`)
      
      const breakdown = this.calculateBreakdownFromTransactions(transactions || [])
      // console.log(`📊 Analytics: Calculated breakdown for week ${weekNumber}:`, breakdown)
      
      return breakdown
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
        .select('totalXp')
        .eq('id', userId)
        .single()

      if (userError || !user) {
        console.error('Error fetching user data for rank:', userError)
        return { weekly: 0, allTime: 0, totalUsers: 0, weeklyActiveUsers: 0 }
      }

      // Get all-time rank by counting users with higher totalXp
      const { count: allTimeRank, error: _allTimeError } = await supabase
        .from('User')
        .select('*', { count: 'exact', head: true })
        .gt('totalXp', user.totalXp)

      // Get weekly rank from XpTransaction (source of truth)
      const { data: allWeeklyXp, error: weeklyXpError } = await supabase
        .from('XpTransaction')
        .select('userId, amount')
        .eq('weekNumber', currentWeek)

      let weeklyRank = 0
      let weeklyActiveUsers = 0
      if (!weeklyXpError && allWeeklyXp) {
        // Aggregate XP by user
        const xpByUser: Record<string, number> = {}
        for (const tx of allWeeklyXp) {
          xpByUser[tx.userId] = (xpByUser[tx.userId] || 0) + (tx.amount || 0)
        }
        
        // Count active users (users with XP > 0 this week)
        weeklyActiveUsers = Object.keys(xpByUser).length
        
        const userWeeklyXp = xpByUser[userId] || 0
        if (userWeeklyXp > 0) {
          // Count users with higher XP
          const usersAbove = Object.values(xpByUser).filter(xp => xp > userWeeklyXp).length
          weeklyRank = usersAbove + 1
        }
      }

      const { count: totalUsers } = await supabase
        .from('User')
        .select('*', { count: 'exact', head: true })

      return {
        weekly: weeklyRank,
        allTime: (allTimeRank || 0) + 1, // Add 1 because count gives users above
        totalUsers: totalUsers || 0,
        weeklyActiveUsers
      }
    } catch (error) {
      console.error('Error in getUserRank:', error)
      return { weekly: 0, allTime: 0, totalUsers: 0, weeklyActiveUsers: 0 }
    }
  }

  /**
   * Record XP transaction and update user totals
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

      // Insert the transaction
      const { error: txError } = await supabase
        .from('XpTransaction')
        .insert({
          userId,
          amount,
          type,
          description,
          sourceId,
          weekNumber
        })

      if (txError) {
        console.error('Error recording XP transaction:', txError)
        throw txError
      }

      // Update user's totalXp - fetch current value and increment
      const { data: user, error: fetchError } = await supabase
        .from('User')
        .select('totalXp, currentWeekXp')
        .eq('id', userId)
        .single()

      if (fetchError || !user) {
        console.warn('Failed to fetch user for XP update:', fetchError)
        return
      }

      // Get current rank before XP change (for promotion detection)
      const oldRank = getGamifiedRank(user.totalXp || 0)

      // Update totalXp and currentWeekXp
      // Note: This function always uses current week, so currentWeekXp update is correct
      // For backdated transactions (like monthly bonuses), use SQL functions instead
      const newTotalXp = (user.totalXp || 0) + amount
      const { error: updateError } = await supabase
        .from('User')
        .update({
          totalXp: newTotalXp,
          currentWeekXp: (user.currentWeekXp || 0) + amount,
          updatedAt: new Date().toISOString()
        })
        .eq('id', userId)

      if (updateError) {
        console.warn('Failed to update user XP totals:', updateError)
        // Don't throw - transaction was recorded, totals can be reconciled later
      }

      // Check for rank promotion (fire and forget - don't block transaction)
      const newRank = getGamifiedRank(newTotalXp)
      if (newRank && newRank.displayName !== oldRank?.displayName && amount > 0) {
        // Handle first promotion (no old rank) by passing a "no rank" placeholder
        const oldRankData = oldRank || {
          displayName: 'No Rank',
          category: 'None',
          tier: null
        } as any
        notifyRankPromoted(userId, oldRankData, newRank).catch(err => {
          console.warn('Failed to send rank promotion notification:', err)
        })
      }
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

    // Include 'other' XP in submissions bucket to preserve total accuracy
    // This ensures unrecognized transaction types don't silently disappear
    return {
      submissions: breakdown.submissions + breakdown.other,
      reviews: breakdown.reviews,
      streaks: breakdown.streaks,
      achievements: breakdown.achievements,
      penalties: breakdown.penalties,
      adminAdjustments: breakdown.adminAdjustments,
      total: breakdown.total
    }
  }

  private getEmptyBreakdown(): XpBreakdown {
    return {
      submissions: 0,
      reviews: 0,
      streaks: 0,
      achievements: 0,
      penalties: 0,
      adminAdjustments: 0,
      total: 0
    }
  }

  private calculateProjectedWeeklyXp(trends: XpTrend[]): number {
    if (trends.length < 2) return 0

    // Calculate average XP from last 4 weeks
    const recentTrends = trends.slice(-4)
    const averageXp = recentTrends.reduce((sum, trend) => sum + trend.xpEarned, 0) / recentTrends.length
    
    return Math.round(averageXp)
  }

  private getCurrentWeekNumber(): number {
    return getWeekNumber(new Date())
  }

  private getWeekDates(weekNumber: number): { weekStart: Date; weekEnd: Date } {
    const year = new Date().getFullYear()
    
    // Find the Monday of week 1 (ISO 8601: week containing Jan 4)
    const jan4 = new Date(year, 0, 4)
    const jan4Day = jan4.getDay()
    const daysToMonday = jan4Day === 0 ? -6 : 1 - jan4Day
    const week1Start = new Date(jan4)
    week1Start.setDate(jan4.getDate() + daysToMonday)
    week1Start.setHours(0, 0, 0, 0)
    
    // Calculate the start of the target week
    const weekStart = new Date(week1Start)
    weekStart.setDate(week1Start.getDate() + (weekNumber - 1) * 7)
    
    // Calculate the end of the week (Sunday)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)
    
    return { weekStart, weekEnd }
  }
}

// Export singleton instance
export const xpAnalyticsService = new XpAnalyticsService()
