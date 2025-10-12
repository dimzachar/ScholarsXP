import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { withUserOptimization } from '@/middleware/api-optimization'
import { QueryCache, CacheTTL, withQueryCache } from '@/lib/cache/query-cache'
import { CompleteUserProfileDTO, ResponseTransformer } from '@/types/api-responses'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getWeekNumber } from '@/lib/utils'
import { xpAnalyticsService } from '@/lib/xp-analytics'
import { ENABLE_ACHIEVEMENTS } from '@/config/feature-flags'
import { applyTransactionToBreakdown, createEmptyBreakdown } from '@/lib/xp-ledger'

// Optimized user profile handler with compression and caching
const optimizedProfileHandler = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id

    // Use optimized implementation with caching
    const useOptimizedProfile = process.env.USE_OPTIMIZED_PROFILE !== 'false' // Default to true

    if (useOptimizedProfile) {
      console.log('🚀 Using optimized user profile implementation')
      const startTime = Date.now()

      const profileData = await getOptimizedCompleteProfile(userId)

      const executionTime = Date.now() - startTime
      console.log(`⚡ Optimized user profile completed in ${executionTime}ms`)

      return NextResponse.json(profileData, {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
          'X-Cache': 'OPTIMIZED',
          'X-Execution-Time': executionTime.toString(),
          'X-Performance-Gain': 'optimized_profile'
        }
      })
    }

    // Fall back to existing implementation
    console.log('🔄 Using legacy user profile implementation')
    return await originalHandler(request)
  } catch (error) {
    console.error('Complete profile API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})

// Apply comprehensive optimization middleware
export const GET = withUserOptimization(optimizedProfileHandler)

/**
 * Optimized complete profile function with caching and minimal data
 * Target: 30KB → 8KB (73% reduction)
 */
async function getOptimizedCompleteProfile(userId: string): Promise<CompleteUserProfileDTO> {
  const cacheKey = QueryCache.createKey('complete_profile', { userId })

  return await withQueryCache(
    cacheKey,
    CacheTTL.USER_PROFILE,
    async () => {
      const supabase = createServerSupabaseClient()

      // Get basic user profile
      const { data: userProfile, error: userError } = await supabase
        .from('User')
        .select('*')
        .eq('id', userId)
        .single()

      if (userError || !userProfile) {
        throw new Error('User profile not found')
      }

      // Get essential data in parallel (optimized queries)
      const [
        submissionsResult,
        legacySubmissionsResult,
        reviewsResult,
        achievementsResult,
        xpTransactionsResult
      ] = await Promise.all([
        // Get recent submissions only (limit to 5 for smaller response)
        supabase
          .from('Submission')
          .select('id, title, url, platform, status, finalXp, aiXp, createdAt')
          .eq('userId', userId)
          .order('createdAt', { ascending: false })
          .limit(5),

        // Get legacy submissions if user has discordHandle (with flexible matching)
        userProfile?.discordHandle ? (async () => {
          // Helper function to try multiple discord handle variations
          const tryDiscordHandleVariations = async (handle: string) => {
            const variations = [
              handle, // Exact match first
              handle.split('#')[0], // Without discriminator
              `${handle.split('#')[0]}#0`, // With #0 discriminator
              handle.toLowerCase(), // Lowercase
              handle.split('#')[0].toLowerCase() // Lowercase without discriminator
            ].filter((v, i, arr) => arr.indexOf(v) === i); // Remove duplicates

            for (const variation of variations) {
              const result = await supabase
                .from('LegacySubmission')
                .select('id, url, discordHandle, submittedAt, role, notes, importedAt, aiXp, peerXp, finalXp', { count: 'exact' })
                .eq('discordHandle', variation)
                .order('importedAt', { ascending: false })
                .limit(5);

              if (result.data && result.data.length > 0) {
                console.log(`✅ Found legacy submissions for discord handle variation: "${variation}" (original: "${handle}")`);
                return result;
              }
            }

            console.log(`❌ No legacy submissions found for any variation of discord handle: "${handle}"`);
            return { data: [], count: 0 };
          };

          return await tryDiscordHandleVariations(userProfile.discordHandle);
        })() : Promise.resolve({ data: [], count: 0 }),

        // Get recent reviews only (limit to 5)
        supabase
          .from('PeerReview')
          .select('id, xpScore, createdAt, submission:submissionId(title, url)')
          .eq('reviewerId', userId)
          .order('createdAt', { ascending: false })
          .limit(5),

        // Get recent achievements only (limit to 10)
        ENABLE_ACHIEVEMENTS
          ? supabase
              .from('UserAchievement')
              .select('id, title, description, earnedAt')
              .eq('userId', userId)
              .order('earnedAt', { ascending: false })
              .limit(10)
          : Promise.resolve({ data: [], error: null, count: 0 }),

        // Get XP breakdown efficiently
        supabase
          .from('XpTransaction')
          .select('type, amount')
          .eq('userId', userId)
      ])

      // Calculate statistics efficiently (include legacy submissions)
      const regularSubmissionCount = submissionsResult.count || 0
      const legacySubmissionCount = legacySubmissionsResult.count || 0
      const totalSubmissions = regularSubmissionCount + legacySubmissionCount

      const regularCompleted = submissionsResult.data?.filter(s => s.status === 'FINALIZED').length || 0
      const legacyCompleted = legacySubmissionsResult.data?.length || 0 // Legacy submissions are considered completed
      const completedSubmissions = regularCompleted + legacyCompleted

      const totalReviews = reviewsResult.count || 0
      const achievementsData = achievementsResult.data || []
      const totalAchievements = ENABLE_ACHIEVEMENTS
        ? (achievementsResult.count ?? achievementsData.length ?? 0)
        : 0

      // Calculate XP breakdown
      const xpTransactions = xpTransactionsResult.data || []
      const xpBreakdown = createEmptyBreakdown()
      xpTransactions.forEach(tx => {
        applyTransactionToBreakdown(xpBreakdown, {
          amount: tx.amount,
          type: tx.type
        })
      })

      const submissionXp = xpBreakdown.submissions
      const reviewXp = xpBreakdown.reviews
      const achievementXp = ENABLE_ACHIEVEMENTS ? xpBreakdown.achievements : 0
      const otherXp = xpBreakdown.other + xpBreakdown.streaks + xpBreakdown.adminAdjustments + xpBreakdown.penalties
      const totalXp = userProfile.totalXp || 0

      // Calculate user rank
      const rankData = await xpAnalyticsService.getUserRank(userId)

      // Transform to optimized DTOs
      const profile = ResponseTransformer.toUserProfileDTO(userProfile)

      const statistics = {
        totalSubmissions,
        completedSubmissions,
        totalReviews,
        totalAchievements,
        avgScore: completedSubmissions > 0 ? Math.round(submissionXp / completedSubmissions) : 0,
        rank: rankData,
        xpBreakdown: {
          total: totalXp,
          submissions: submissionXp,
          reviews: reviewXp,
          achievements: achievementXp,
          other: otherXp
        }
      }

      // Combine regular and legacy submissions for recent submissions
      const regularSubmissions = (submissionsResult.data || []).map(ResponseTransformer.toSimpleSubmissionDTO)
      const legacySubmissionsFormatted = (legacySubmissionsResult.data || []).map(legacy => ({
        id: legacy.id,
        title: legacy.url, // Use URL as title for legacy submissions
        url: legacy.url,
        platform: 'Legacy',
        status: 'LEGACY_IMPORTED',
        finalXp: legacy.finalXp || legacy.aiXp || 0,
        createdAt: legacy.submittedAt || legacy.importedAt
      }))

      // Combine and sort by date (most recent first)
      const allSubmissions = [...regularSubmissions, ...legacySubmissionsFormatted]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5) // Keep only 5 most recent

      const recentSubmissions = allSubmissions

      const recentReviews = (reviewsResult.data || []).map(review => ({
        reviewerId: review.reviewerId || userId,
        xpScore: review.xpScore,
        reviewer: { username: profile.username }
      }))

      const achievements = ENABLE_ACHIEVEMENTS
        ? achievementsData.map((achievement: any) => ({
            id: achievement.id,
            title: achievement.title,
            description: achievement.description,
            earnedAt: achievement.earnedAt
          }))
        : []

      return {
        profile,
        statistics,
        recentSubmissions,
        recentReviews,
        achievements
      }
    },
    { logPerformance: true }
  )
}

// Keep original handler as fallback
const originalHandler = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
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

    // Get user's discord handle to fetch legacy submissions
    let legacySubmissions = []
    if (userProfile?.discordHandle) {
      const { data: legacyData } = await supabase
        .from('LegacySubmission')
        .select('id, url, discordHandle, submittedAt, role, notes, importedAt, aiXp, peerXp, finalXp')
        .eq('discordHandle', userProfile.discordHandle)
        .order('importedAt', { ascending: false })

      if (legacyData) {
        // Convert legacy submissions to submission format
        legacySubmissions = legacyData.map(legacy => {
          // Calculate correct week number from submission timestamp
          const submissionDate = legacy.submittedAt || legacy.importedAt
          const weekNumber = submissionDate ? getWeekNumber(new Date(submissionDate)) : 1

          return {
            id: legacy.id,
            userId: userId,
            url: legacy.url,
            title: 'Legacy Submission',
            content: `Legacy submission from ${legacy.url}`,
            platform: 'LEGACY',
            taskTypes: ['LEGACY'],
            aiXp: legacy.aiXp || 0,
            originalityScore: null,
            peerXp: legacy.peerXp,
            finalXp: legacy.finalXp,
            status: 'LEGACY_IMPORTED',
            reviewDeadline: null,
            consensusScore: null,
            reviewCount: 0,
            flagCount: 0,
            createdAt: submissionDate,
            updatedAt: legacy.importedAt,
            weekNumber: weekNumber
          }
        })
      }
    }

    // Combine regular and legacy submissions
    const allSubmissions = [...(submissions || []), ...legacySubmissions]

    // Get reviews given by user
    const { data: givenReviews } = await supabase
      .from('PeerReview')
      .select('*')
      .eq('reviewerId', userId)
      .order('createdAt', { ascending: false })

    // Get achievements
    const achievementsQuery = ENABLE_ACHIEVEMENTS
      ? await supabase
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
      : { data: [], error: null }

    if (achievementsQuery.error) {
      console.error('Error fetching achievements (legacy profile):', achievementsQuery.error)
    }

    const achievements = (achievementsQuery.data || []) as any[]

    // Get XP transactions (includes legacy data)
    const { data: xpTransactions } = await supabase
      .from('XpTransaction')
      .select('*')
      .eq('userId', userId)
      .order('createdAt', { ascending: false })

    // Calculate basic statistics using combined submissions
    const currentWeek = getWeekNumber()
    const totalSubmissions = allSubmissions.length
    const completedSubmissions = allSubmissions.filter(s => s.status === 'COMPLETED' || s.status === 'FINALIZED' || s.status === 'LEGACY_IMPORTED').length
    const totalReviews = givenReviews?.length || 0
    const totalAchievements = ENABLE_ACHIEVEMENTS ? achievements.length : 0

    // XP breakdown - include both regular and legacy submissions
    const submissionXp = allSubmissions.reduce((sum, sub) => sum + (sub.finalXp || sub.aiXp || 0), 0)

    // Calculate XP from transactions by type
    const transactionsByType = (xpTransactions || []).reduce((acc, transaction) => {
      acc[transaction.type] = (acc[transaction.type] || 0) + transaction.amount
      return acc
    }, {} as Record<string, number>)

    const reviewXp = (transactionsByType['REVIEW_REWARD'] || 0) + (totalReviews * 10) // Transaction XP + base review XP
    const achievementXp = ENABLE_ACHIEVEMENTS
      ? (transactionsByType['ACHIEVEMENT_REWARD'] || 0) +
        (transactionsByType['ACHIEVEMENT_BONUS'] || 0) +
        (transactionsByType['ACHIEVEMENT'] || 0) +
        achievements.reduce((sum, ach) => sum + (ach.achievement?.xpReward || 0), 0)
      : 0
    const legacyXp = transactionsByType['ADMIN_ADJUSTMENT'] || 0 // Legacy imported XP
    const streakXp = transactionsByType['STREAK_BONUS'] || 0
    const penaltyXp = transactionsByType['PENALTY'] || 0

    // Use User.totalXp as authoritative source (updated by admin interface)
    // This ensures consistency between admin interface and leaderboard display
    // Only fall back to calculated XP from transactions if User.totalXp is missing
    const calculatedTotalXp = (xpTransactions || []).reduce((sum, transaction) => sum + transaction.amount, 0)
    const totalXp = userProfile.totalXp ?? calculatedTotalXp ?? 0

    // Weekly stats - include both regular and legacy submissions
    const thisWeekSubmissions = allSubmissions.filter(sub => sub.weekNumber === currentWeek)
    const thisWeekReviews = givenReviews?.filter(review => {
      const reviewDate = new Date(review.createdAt)
      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      return reviewDate >= weekStart
    }) || []
    const thisWeekTransactions = xpTransactions?.filter(transaction => transaction.weekNumber === currentWeek) || []

    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentSubmissions = submissions?.filter(sub => new Date(sub.createdAt) >= thirtyDaysAgo) || []
    const recentReviews = givenReviews?.filter(review => new Date(review.createdAt) >= thirtyDaysAgo) || []
    const recentTransactions = xpTransactions?.filter(transaction => new Date(transaction.createdAt) >= thirtyDaysAgo) || []

    // Calculate user rank
    const rankData = await xpAnalyticsService.getUserRank(userId)

    const completeProfile = {
      ...userProfile,
      statistics: {
        totalSubmissions,
        completedSubmissions,
        totalReviews,
        totalAchievements,
        currentStreak: 0, // Simplified for now
        avgScore: completedSubmissions > 0 ? Math.round(submissionXp / completedSubmissions) : 0,
        rank: rankData,
        xpBreakdown: {
          total: totalXp,
          submissions: submissionXp,
          reviews: reviewXp,
          achievements: achievementXp,
          legacy: legacyXp,
          streaks: streakXp,
          penalties: penaltyXp,
          other: Math.max(0, totalXp - submissionXp - reviewXp - achievementXp - legacyXp - streakXp - penaltyXp)
        },
        weeklyStats: {
          currentWeek,
          submissions: thisWeekSubmissions.length,
          reviews: thisWeekReviews.length,
          xpEarned: thisWeekSubmissions.reduce((sum, sub) => sum + (sub.finalXp || sub.aiXp || 0), 0) +
                   thisWeekTransactions.reduce((sum, transaction) => sum + transaction.amount, 0)
        },
        recentActivity: {
          submissions: recentSubmissions.length,
          reviews: recentReviews.length,
          transactions: recentTransactions.length
        }
      },
      submissions: submissions || [],
      givenReviews: givenReviews || [],
      achievements: ENABLE_ACHIEVEMENTS ? achievements : [],
      xpTransactions: xpTransactions || []
    }

    const response = NextResponse.json(completeProfile)
    // Prevent caching to ensure fresh XP data after admin updates
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    return response

  } catch (error) {
    console.error('Complete profile API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
