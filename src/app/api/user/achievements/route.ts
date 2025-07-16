import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { achievementEngine } from '@/lib/achievement-engine'

export const GET = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') // 'all', 'SUBMISSION', 'REVIEW', 'STREAK', 'MILESTONE', 'SPECIAL'
    const status = searchParams.get('status') // 'all', 'earned', 'available', 'in_progress'

    const userId = request.user.id

    // Get comprehensive achievement data
    const [achievementProgress, userAchievements] = await Promise.all([
      achievementEngine.getUserAchievementProgress(userId),
      achievementEngine.getUserAchievements(userId)
    ])

    // Filter by category if specified
    let filteredProgress = achievementProgress
    if (category && category !== 'all') {
      filteredProgress = achievementProgress.filter(
        progress => progress.achievement.category === category
      )
    }

    // Filter by status if specified
    if (status && status !== 'all') {
      switch (status) {
        case 'earned':
          filteredProgress = filteredProgress.filter(progress => progress.isCompleted)
          break
        case 'available':
          filteredProgress = filteredProgress.filter(progress => !progress.isCompleted)
          break
        case 'in_progress':
          filteredProgress = filteredProgress.filter(
            progress => !progress.isCompleted && progress.percentage > 0
          )
          break
      }
    }

    // Calculate statistics
    const stats = {
      total: achievementProgress.length,
      earned: achievementProgress.filter(p => p.isCompleted).length,
      inProgress: achievementProgress.filter(p => !p.isCompleted && p.percentage > 0).length,
      notStarted: achievementProgress.filter(p => p.percentage === 0).length,
      totalXpFromAchievements: userAchievements.reduce(
        (sum, ua) => sum + (ua.achievement?.xpReward || 0), 0
      ),
      recentlyEarned: userAchievements.filter(
        ua => new Date(ua.earnedAt).getTime() > Date.now() - (7 * 24 * 60 * 60 * 1000)
      ).length
    }

    // Group by category for better organization
    const byCategory = {
      SUBMISSION: filteredProgress.filter(p => p.achievement.category === 'SUBMISSION'),
      REVIEW: filteredProgress.filter(p => p.achievement.category === 'REVIEW'),
      STREAK: filteredProgress.filter(p => p.achievement.category === 'STREAK'),
      MILESTONE: filteredProgress.filter(p => p.achievement.category === 'MILESTONE'),
      SPECIAL: filteredProgress.filter(p => p.achievement.category === 'SPECIAL')
    }

    // Get next achievements to earn (closest to completion)
    const nextToEarn = achievementProgress
      .filter(p => !p.isCompleted)
      .sort((a, b) => b.percentage - a.percentage)
      .slice(0, 3)

    // Get recently earned achievements (last 30 days)
    const recentlyEarned = userAchievements
      .filter(ua => new Date(ua.earnedAt).getTime() > Date.now() - (30 * 24 * 60 * 60 * 1000))
      .sort((a, b) => new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime())
      .slice(0, 5)

    // Calculate completion percentage by category
    const categoryStats = Object.entries(byCategory).map(([categoryName, achievements]) => ({
      category: categoryName,
      total: achievements.length,
      earned: achievements.filter(a => a.isCompleted).length,
      percentage: achievements.length > 0 
        ? Math.round((achievements.filter(a => a.isCompleted).length / achievements.length) * 100)
        : 0,
      totalXp: achievements
        .filter(a => a.isCompleted)
        .reduce((sum, a) => sum + a.achievement.xpReward, 0)
    }))

    // Get achievement streaks and milestones
    const milestones = {
      firstAchievement: userAchievements.length > 0 
        ? userAchievements.sort((a, b) => new Date(a.earnedAt).getTime() - new Date(b.earnedAt).getTime())[0]
        : null,
      latestAchievement: userAchievements.length > 0
        ? userAchievements.sort((a, b) => new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime())[0]
        : null,
      mostValuableAchievement: userAchievements.length > 0
        ? userAchievements.sort((a, b) => (b.achievement?.xpReward || 0) - (a.achievement?.xpReward || 0))[0]
        : null
    }

    // Calculate achievement velocity (achievements per week)
    const achievementVelocity = userAchievements.length > 0 ? (() => {
      const firstAchievement = userAchievements.sort(
        (a, b) => new Date(a.earnedAt).getTime() - new Date(b.earnedAt).getTime()
      )[0]
      const weeksSinceFirst = Math.max(1, 
        (Date.now() - new Date(firstAchievement.earnedAt).getTime()) / (7 * 24 * 60 * 60 * 1000)
      )
      return Math.round((userAchievements.length / weeksSinceFirst) * 10) / 10
    })() : 0

    return NextResponse.json({
      achievements: filteredProgress,
      byCategory,
      stats,
      categoryStats,
      nextToEarn,
      recentlyEarned,
      milestones,
      insights: {
        achievementVelocity,
        completionRate: Math.round((stats.earned / stats.total) * 100),
        averageXpPerAchievement: stats.earned > 0 
          ? Math.round(stats.totalXpFromAchievements / stats.earned)
          : 0,
        daysToNextAchievement: nextToEarn.length > 0 && nextToEarn[0].percentage > 50
          ? Math.ceil((100 - nextToEarn[0].percentage) / 10) // Rough estimate
          : null
      },
      filters: {
        category: category || 'all',
        status: status || 'all'
      }
    })

  } catch (error) {
    console.error('Error in user achievements endpoint:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})

// POST endpoint to manually trigger achievement evaluation (for testing)
export const POST = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const { triggerType } = await request.json()
    const userId = request.user.id

    if (!triggerType || !['submission', 'review', 'xp_change'].includes(triggerType)) {
      return NextResponse.json(
        { message: 'Invalid trigger type. Must be: submission, review, or xp_change' },
        { status: 400 }
      )
    }

    // Trigger achievement evaluation
    const newAchievements = await achievementEngine.evaluateAchievements(userId, triggerType)

    return NextResponse.json({
      message: 'Achievement evaluation completed',
      newAchievements: newAchievements.map(achievement => ({
        id: achievement.id,
        name: achievement.name,
        description: achievement.description,
        xpReward: achievement.xpReward,
        category: achievement.category
      })),
      count: newAchievements.length
    })

  } catch (error) {
    console.error('Error in achievement evaluation:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})
