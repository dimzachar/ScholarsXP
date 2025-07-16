import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { xpAnalyticsService } from '@/lib/xp-analytics'

export const GET = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    const timeframe = searchParams.get('timeframe') || 'current_week' // 'current_week', 'all_time', 'last_12_weeks'
    const userId = request.user.id

    let xpBreakdown
    let weeklyTrends = []

    switch (timeframe) {
      case 'current_week':
        xpBreakdown = await xpAnalyticsService.getCurrentWeekBreakdown(userId)
        break
      
      case 'all_time':
        xpBreakdown = await xpAnalyticsService.getAllTimeBreakdown(userId)
        break
      
      case 'last_12_weeks':
        weeklyTrends = await xpAnalyticsService.getWeeklyTrends(userId, 12)
        // Calculate total for last 12 weeks
        xpBreakdown = {
          submissions: weeklyTrends.reduce((sum, week) => sum + (week.submissions * 25), 0), // Estimate
          reviews: weeklyTrends.reduce((sum, week) => sum + (week.reviews * 5), 0),
          streaks: weeklyTrends.reduce((sum, week) => sum + week.streaks, 0),
          achievements: 0, // TODO: Calculate from achievements in timeframe
          penalties: 0, // TODO: Calculate from penalties in timeframe
          adminAdjustments: 0, // TODO: Calculate from admin adjustments in timeframe
          total: weeklyTrends.reduce((sum, week) => sum + week.xpEarned, 0)
        }
        break
      
      default:
        return NextResponse.json(
          { message: 'Invalid timeframe. Use: current_week, all_time, or last_12_weeks' },
          { status: 400 }
        )
    }

    // Get detailed transaction history for the timeframe
    const transactionHistory = await xpAnalyticsService.getXpTransactionHistory(userId, 100)
    
    // Filter transactions based on timeframe
    let filteredTransactions = transactionHistory
    if (timeframe === 'current_week') {
      const currentWeek = getCurrentWeekNumber()
      filteredTransactions = transactionHistory.filter(t => {
        const transactionWeek = getWeekNumber(t.createdAt)
        return transactionWeek === currentWeek
      })
    } else if (timeframe === 'last_12_weeks') {
      const currentWeek = getCurrentWeekNumber()
      const startWeek = currentWeek - 11
      filteredTransactions = transactionHistory.filter(t => {
        const transactionWeek = getWeekNumber(t.createdAt)
        return transactionWeek >= startWeek && transactionWeek <= currentWeek
      })
    }

    // Group transactions by type for detailed breakdown
    const transactionsByType = filteredTransactions.reduce((acc, transaction) => {
      if (!acc[transaction.type]) {
        acc[transaction.type] = []
      }
      acc[transaction.type].push(transaction)
      return acc
    }, {} as Record<string, typeof transactionHistory>)

    // Calculate percentage breakdown
    const total = Math.abs(xpBreakdown.total) || 1 // Avoid division by zero
    const percentageBreakdown = {
      submissions: Math.round((xpBreakdown.submissions / total) * 100),
      reviews: Math.round((xpBreakdown.reviews / total) * 100),
      streaks: Math.round((xpBreakdown.streaks / total) * 100),
      achievements: Math.round((xpBreakdown.achievements / total) * 100),
      penalties: Math.round((Math.abs(xpBreakdown.penalties) / total) * 100),
      adminAdjustments: Math.round((Math.abs(xpBreakdown.adminAdjustments) / total) * 100)
    }

    // Get goal progress for current week (regardless of timeframe)
    const goalProgress = await xpAnalyticsService.getGoalProgress(userId)

    // Calculate insights
    const insights = generateXpInsights(xpBreakdown, weeklyTrends, goalProgress)

    return NextResponse.json({
      timeframe,
      breakdown: xpBreakdown,
      percentageBreakdown,
      weeklyTrends: timeframe === 'last_12_weeks' ? weeklyTrends : [],
      transactionsByType,
      goalProgress,
      insights,
      summary: {
        totalTransactions: filteredTransactions.length,
        positiveTransactions: filteredTransactions.filter(t => t.amount > 0).length,
        negativeTransactions: filteredTransactions.filter(t => t.amount < 0).length,
        averageTransactionValue: filteredTransactions.length > 0 
          ? Math.round(filteredTransactions.reduce((sum, t) => sum + t.amount, 0) / filteredTransactions.length)
          : 0
      }
    })

  } catch (error) {
    console.error('Error fetching XP breakdown:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})

function generateXpInsights(breakdown: any, weeklyTrends: any[], goalProgress: any[]) {
  const insights = []

  // Submission insights
  if (breakdown.submissions > 0) {
    const submissionPercentage = (breakdown.submissions / breakdown.total) * 100
    if (submissionPercentage > 70) {
      insights.push({
        type: 'positive',
        category: 'submissions',
        message: 'Great job! Most of your XP comes from content submissions.',
        value: Math.round(submissionPercentage)
      })
    }
  }

  // Review insights
  if (breakdown.reviews > 0) {
    const reviewPercentage = (breakdown.reviews / breakdown.total) * 100
    if (reviewPercentage > 30) {
      insights.push({
        type: 'positive',
        category: 'reviews',
        message: 'You\'re an active reviewer! Keep helping the community.',
        value: Math.round(reviewPercentage)
      })
    } else if (reviewPercentage < 10) {
      insights.push({
        type: 'suggestion',
        category: 'reviews',
        message: 'Consider doing more peer reviews to earn additional XP.',
        value: Math.round(reviewPercentage)
      })
    }
  }

  // Streak insights
  if (breakdown.streaks > 0) {
    insights.push({
      type: 'positive',
      category: 'streaks',
      message: 'Your consistency is paying off with streak bonuses!',
      value: breakdown.streaks
    })
  }

  // Penalty insights
  if (breakdown.penalties < 0) {
    insights.push({
      type: 'warning',
      category: 'penalties',
      message: 'You\'ve lost XP due to penalties. Stay active to avoid them!',
      value: Math.abs(breakdown.penalties)
    })
  }

  // Goal progress insights
  const completedGoals = goalProgress.filter(goal => goal.percentage >= 100)
  const nearCompletionGoals = goalProgress.filter(goal => goal.percentage >= 80 && goal.percentage < 100)

  if (completedGoals.length > 0) {
    insights.push({
      type: 'positive',
      category: 'goals',
      message: `You've completed ${completedGoals.length} weekly goal${completedGoals.length > 1 ? 's' : ''}!`,
      value: completedGoals.length
    })
  }

  if (nearCompletionGoals.length > 0) {
    insights.push({
      type: 'suggestion',
      category: 'goals',
      message: `You're close to completing ${nearCompletionGoals.length} more goal${nearCompletionGoals.length > 1 ? 's' : ''}!`,
      value: nearCompletionGoals.length
    })
  }

  // Weekly trend insights
  if (weeklyTrends.length >= 4) {
    const recentWeeks = weeklyTrends.slice(-4)
    const averageRecent = recentWeeks.reduce((sum, week) => sum + week.xpEarned, 0) / recentWeeks.length
    const olderWeeks = weeklyTrends.slice(0, -4)
    
    if (olderWeeks.length > 0) {
      const averageOlder = olderWeeks.reduce((sum, week) => sum + week.xpEarned, 0) / olderWeeks.length
      const improvement = ((averageRecent - averageOlder) / averageOlder) * 100
      
      if (improvement > 20) {
        insights.push({
          type: 'positive',
          category: 'trends',
          message: `Your XP earning has improved by ${Math.round(improvement)}% recently!`,
          value: Math.round(improvement)
        })
      } else if (improvement < -20) {
        insights.push({
          type: 'suggestion',
          category: 'trends',
          message: `Your XP earning has decreased by ${Math.round(Math.abs(improvement))}%. Consider increasing activity.`,
          value: Math.round(Math.abs(improvement))
        })
      }
    }
  }

  return insights
}

function getCurrentWeekNumber(): number {
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
  return Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7)
}

function getWeekNumber(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1)
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000))
  return Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7)
}
