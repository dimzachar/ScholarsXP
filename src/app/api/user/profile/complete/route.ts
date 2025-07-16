import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase-server'
import { getWeekNumber } from '@/lib/utils'

export const GET = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id

    // Use service client for now to bypass RLS issues
    // TODO: Fix RLS policies to work with authenticated client
    const supabase = createServiceClient()

    // Get basic user profile
    const { data: userProfile, error: userError } = await supabase
      .from('User')
      .select('*')
      .eq('id', userId)
      .single()

    if (userError || !userProfile) {
      return NextResponse.json(
        { message: 'User profile not found' },
        { status: 404 }
      )
    }

    // Get submissions
    const { data: submissions } = await supabase
      .from('Submission')
      .select('*')
      .eq('userId', userId)
      .order('createdAt', { ascending: false })

    // Get reviews given by user
    const { data: givenReviews } = await supabase
      .from('PeerReview')
      .select('*')
      .eq('reviewerId', userId)
      .order('createdAt', { ascending: false })

    // Get achievements
    const { data: achievements } = await supabase
      .from('UserAchievement')
      .select(`
        id,
        earnedAt,
        achievement:Achievement(
          id,
          name,
          description,
          category,
          iconUrl,
          xpReward
        )
      `)
      .eq('userId', userId)
      .order('earnedAt', { ascending: false })

    // Calculate basic statistics
    const currentWeek = getWeekNumber()
    const totalSubmissions = submissions?.length || 0
    const completedSubmissions = submissions?.filter(s => s.status === 'COMPLETED').length || 0
    const totalReviews = givenReviews?.length || 0
    const totalAchievements = achievements?.length || 0

    // XP breakdown
    const submissionXp = submissions?.reduce((sum, sub) => sum + (sub.finalXp || sub.aiXp || 0), 0) || 0
    const reviewXp = totalReviews * 5 // Base review XP
    const achievementXp = achievements?.reduce((sum, ach) => sum + (ach.achievement?.xpReward || 0), 0) || 0
    const totalXp = userProfile.totalXp || 0

    // Weekly stats
    const thisWeekSubmissions = submissions?.filter(sub => sub.weekNumber === currentWeek) || []
    const thisWeekReviews = givenReviews?.filter(review => {
      const reviewDate = new Date(review.createdAt)
      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      return reviewDate >= weekStart
    }) || []

    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const recentSubmissions = submissions?.filter(sub => new Date(sub.createdAt) >= thirtyDaysAgo) || []
    const recentReviews = givenReviews?.filter(review => new Date(review.createdAt) >= thirtyDaysAgo) || []

    const completeProfile = {
      ...userProfile,
      statistics: {
        totalSubmissions,
        completedSubmissions,
        totalReviews,
        totalAchievements,
        currentStreak: 0, // Simplified for now
        avgScore: completedSubmissions > 0 ? Math.round(submissionXp / completedSubmissions) : 0,
        xpBreakdown: {
          total: totalXp,
          submissions: submissionXp,
          reviews: reviewXp,
          achievements: achievementXp,
          other: Math.max(0, totalXp - submissionXp - reviewXp - achievementXp)
        },
        weeklyStats: {
          currentWeek,
          submissions: thisWeekSubmissions.length,
          reviews: thisWeekReviews.length,
          xpEarned: thisWeekSubmissions.reduce((sum, sub) => sum + (sub.finalXp || sub.aiXp || 0), 0) + (thisWeekReviews.length * 5)
        },
        recentActivity: {
          submissions: recentSubmissions.length,
          reviews: recentReviews.length
        }
      },
      submissions: submissions || [],
      givenReviews: givenReviews || [],
      achievements: achievements || []
    }

    return NextResponse.json(completeProfile)

  } catch (error) {
    console.error('Complete profile API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
