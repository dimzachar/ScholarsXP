import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { xpAnalyticsService } from '@/lib/xp-analytics'
import { createServiceClient } from '@/lib/supabase-server'

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
        // Always fetch weekly trends for the Progress Trends chart
        weeklyTrends = await xpAnalyticsService.getWeeklyTrends(userId, 12)
        break

      case 'all_time':
        xpBreakdown = await xpAnalyticsService.getAllTimeBreakdown(userId)
        // Always fetch weekly trends for chart display
        weeklyTrends = await xpAnalyticsService.getWeeklyTrends(userId, 12)
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
        xpBreakdown = await xpAnalyticsService.getCurrentWeekBreakdown(userId)
        weeklyTrends = await xpAnalyticsService.getWeeklyTrends(userId, 12)
        break
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

    // Get user profile data and submission statistics for enhanced metrics
    const supabase = createServiceClient()
    const [userProfileResult, submissionStatsResult] = await Promise.all([
      supabase
        .from('User')
        .select('totalXp, currentWeekXp, streakWeeks')
        .eq('id', userId)
        .single(),

      // Get submission statistics for enhanced metrics
      supabase
        .from('Submission')
        .select('id, status, finalXp, aiXp, createdAt')
        .eq('userId', userId)
    ])

    const userProfile = userProfileResult.data
    const submissions = submissionStatsResult.data || []

    // Calculate enhanced metrics
    const totalSubmissions = submissions.length
    const completedSubmissions = submissions.filter(s => s.status === 'FINALIZED').length
    const submissionSuccessRate = totalSubmissions > 0 ? Math.round((completedSubmissions / totalSubmissions) * 100) : 0
    const averageXpPerSubmission = completedSubmissions > 0
      ? Math.round(submissions.reduce((sum, s) => sum + (s.finalXp || s.aiXp || 0), 0) / completedSubmissions)
      : 0

    // Calculate activity patterns for the last 12 weeks
    const activityHeatmap = weeklyTrends.map(week => ({
      week: week.week,
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      xpEarned: week.xpEarned,
      submissions: week.submissions,
      reviews: week.reviews,
      activityLevel: week.xpEarned > 100 ? 'high' : week.xpEarned > 50 ? 'medium' : week.xpEarned > 0 ? 'low' : 'none'
    }))

    // Calculate improvement trends
    const improvementTrends = {
      weekOverWeek: 0,
      monthOverMonth: 0,
      last4WeeksAverage: 0,
      previous4WeeksAverage: 0
    }

    if (weeklyTrends.length >= 2) {
      const thisWeek = weeklyTrends[weeklyTrends.length - 1]?.xpEarned || 0
      const lastWeek = weeklyTrends[weeklyTrends.length - 2]?.xpEarned || 0
      improvementTrends.weekOverWeek = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : 0
    }

    if (weeklyTrends.length >= 8) {
      const last4Weeks = weeklyTrends.slice(-4)
      const previous4Weeks = weeklyTrends.slice(-8, -4)

      improvementTrends.last4WeeksAverage = Math.round(
        last4Weeks.reduce((sum, week) => sum + week.xpEarned, 0) / 4
      )
      improvementTrends.previous4WeeksAverage = Math.round(
        previous4Weeks.reduce((sum, week) => sum + week.xpEarned, 0) / 4
      )

      if (improvementTrends.previous4WeeksAverage > 0) {
        improvementTrends.monthOverMonth = Math.round(
          ((improvementTrends.last4WeeksAverage - improvementTrends.previous4WeeksAverage) /
           improvementTrends.previous4WeeksAverage) * 100
        )
      }
    }

    // Get user rank for percentile calculation
    const userRank = await xpAnalyticsService.getUserRank(userId)
    const percentileRank = userRank.totalUsers > 0
      ? Math.round(((userRank.totalUsers - userRank.allTime) / userRank.totalUsers) * 100)
      : 0

    // Calculate insights with enhanced data
    const insights = generateXpInsights(xpBreakdown, weeklyTrends, goalProgress, userProfile, filteredTransactions)

    const responseData = {
      timeframe,
      breakdown: xpBreakdown,
      percentageBreakdown,
      weeklyTrends: weeklyTrends,
      transactionsByType,
      goalProgress,
      insights,
      enhancedMetrics: {
        submissionSuccessRate,
        averageXpPerSubmission,
        totalSubmissions,
        completedSubmissions,
        activityHeatmap,
        streakWeeks: userProfile?.streakWeeks || 0,
        currentWeekXp: userProfile?.currentWeekXp || 0,
        totalXp: userProfile?.totalXp || 0
      },
      comparativeAnalytics: {
        percentileRank,
        rank: userRank,
        improvementTrends,
        performanceComparison: {
          aboveAverage: percentileRank > 50,
          topQuartile: percentileRank > 75,
          topDecile: percentileRank > 90
        }
      },
      summary: {
        totalTransactions: filteredTransactions.length,
        positiveTransactions: filteredTransactions.filter(t => t.amount > 0).length,
        negativeTransactions: filteredTransactions.filter(t => t.amount < 0).length,
        averageTransactionValue: filteredTransactions.length > 0
          ? Math.round(filteredTransactions.reduce((sum, t) => sum + t.amount, 0) / filteredTransactions.length)
          : 0
      }
    }

    return NextResponse.json(responseData)

  } catch (error) {
    console.error('Error fetching XP breakdown:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})

function generateXpInsights(breakdown: any, weeklyTrends: any[], goalProgress: any[], userProfile: any, transactions: any[]) {
  const insights = []

  // Performance insights based on XP distribution
  if (breakdown.total > 0) {
    const submissionPercentage = (breakdown.submissions / breakdown.total) * 100
    const reviewPercentage = (breakdown.reviews / breakdown.total) * 100

    // Submission performance insights
    if (submissionPercentage > 80) {
      insights.push({
        id: 'submission-focused',
        type: 'performance',
        title: 'Submission Specialist',
        description: `${Math.round(submissionPercentage)}% of your XP comes from submissions. You're excelling at content creation!`,
        priority: 'low',
        actionable: false
      })
    } else if (submissionPercentage < 40 && breakdown.submissions > 0) {
      insights.push({
        id: 'increase-submissions',
        type: 'recommendation',
        title: 'Boost Your Submissions',
        description: `Only ${Math.round(submissionPercentage)}% of your XP is from submissions. Consider creating more content for higher XP gains.`,
        priority: 'medium',
        actionable: true
      })
    }

    // Review balance insights
    if (reviewPercentage > 40) {
      insights.push({
        id: 'active-reviewer',
        type: 'performance',
        title: 'Community Champion',
        description: `${Math.round(reviewPercentage)}% of your XP comes from reviews. You're helping the community grow!`,
        priority: 'low',
        actionable: false
      })
    } else if (reviewPercentage < 15 && breakdown.reviews >= 0) {
      insights.push({
        id: 'more-reviews',
        type: 'recommendation',
        title: 'Review More Content',
        description: `Reviews only make up ${Math.round(reviewPercentage)}% of your XP. Peer reviews are a steady way to earn more XP.`,
        priority: 'medium',
        actionable: true
      })
    }
  }

  // Streak and consistency insights
  if (userProfile?.streakWeeks > 0) {
    if (userProfile.streakWeeks >= 4) {
      insights.push({
        id: 'streak-master',
        type: 'streak',
        title: 'Streak Master',
        description: `${userProfile.streakWeeks} week streak! Your consistency is impressive and earning you bonus XP.`,
        priority: 'low',
        actionable: false
      })
    } else {
      insights.push({
        id: 'building-streak',
        type: 'streak',
        title: 'Building Momentum',
        description: `${userProfile.streakWeeks} week streak! Keep it up to earn even more streak bonuses.`,
        priority: 'low',
        actionable: false
      })
    }
  } else if (breakdown.streaks === 0) {
    insights.push({
      id: 'start-streak',
      type: 'recommendation',
      title: 'Start a Streak',
      description: 'Stay active for consecutive weeks to earn streak bonuses and multiply your XP gains.',
      priority: 'high',
      actionable: true
    })
  }

  // Goal progress insights with specific recommendations
  const completedGoals = goalProgress.filter(goal => goal.percentage >= 100)
  const nearCompletionGoals = goalProgress.filter(goal => goal.percentage >= 80 && goal.percentage < 100)
  const strugglingGoals = goalProgress.filter(goal => goal.percentage < 50)

  if (completedGoals.length > 0) {
    insights.push({
      id: 'goals-completed',
      type: 'goal',
      title: 'Goal Achiever',
      description: `Completed ${completedGoals.length} weekly goal${completedGoals.length > 1 ? 's' : ''}! You're on track for maximum XP.`,
      priority: 'low',
      actionable: false
    })
  }

  if (nearCompletionGoals.length > 0) {
    const goalNames = nearCompletionGoals.map(g => g.taskType).join(', ')
    insights.push({
      id: 'goals-almost-done',
      type: 'goal',
      title: 'Almost There!',
      description: `You're close to completing ${goalNames} goals. A few more submissions could unlock bonus XP!`,
      priority: 'high',
      actionable: true
    })
  }

  if (strugglingGoals.length > 0 && completedGoals.length === 0) {
    insights.push({
      id: 'focus-goals',
      type: 'goal',
      title: 'Focus Your Efforts',
      description: `Consider focusing on specific task types to complete weekly goals and earn bonus XP.`,
      priority: 'medium',
      actionable: true
    })
  }

  // Weekly trend analysis with actionable insights
  if (weeklyTrends.length >= 3) {
    const recentWeeks = weeklyTrends.slice(-3)
    const currentWeekXp = recentWeeks[recentWeeks.length - 1]?.xpEarned || 0
    const previousWeekXp = recentWeeks[recentWeeks.length - 2]?.xpEarned || 0
    const averageXp = recentWeeks.reduce((sum, week) => sum + week.xpEarned, 0) / recentWeeks.length

    if (currentWeekXp > previousWeekXp * 1.5) {
      insights.push({
        id: 'trending-up',
        type: 'performance',
        title: 'Momentum Building',
        description: `Your XP this week (${currentWeekXp}) is significantly higher than last week. Keep this pace!`,
        priority: 'low',
        actionable: false
      })
    } else if (currentWeekXp < previousWeekXp * 0.5 && previousWeekXp > 0) {
      insights.push({
        id: 'trending-down',
        type: 'recommendation',
        title: 'Activity Declining',
        description: `Your XP dropped from ${previousWeekXp} to ${currentWeekXp}. Consider increasing your activity to maintain momentum.`,
        priority: 'high',
        actionable: true
      })
    }

    // Consistency insight
    const isConsistent = recentWeeks.every(week => Math.abs(week.xpEarned - averageXp) < averageXp * 0.3)
    if (isConsistent && averageXp > 50) {
      insights.push({
        id: 'consistent-performer',
        type: 'performance',
        title: 'Consistent Performer',
        description: `You've maintained steady XP gains averaging ${Math.round(averageXp)} per week. Consistency pays off!`,
        priority: 'low',
        actionable: false
      })
    }
  }

  // Penalty and improvement insights
  if (breakdown.penalties < 0) {
    insights.push({
      id: 'penalties-warning',
      type: 'recommendation',
      title: 'Avoid Penalties',
      description: `You've lost ${Math.abs(breakdown.penalties)} XP to penalties. Stay active and meet deadlines to avoid future penalties.`,
      priority: 'high',
      actionable: true
    })
  }

  // Achievement insights
  if (breakdown.achievements > 0) {
    insights.push({
      id: 'achievement-earner',
      type: 'achievement',
      title: 'Achievement Unlocked',
      description: `You've earned ${breakdown.achievements} XP from achievements. Check your profile for new badges!`,
      priority: 'low',
      actionable: false
    })
  }

  // Sort insights by priority (high -> medium -> low) and limit to top 5
  const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 }
  return insights
    .sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority])
    .slice(0, 5)
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
