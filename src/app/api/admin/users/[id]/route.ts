import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'

export const GET = withPermission('admin_access')(async (
  request: AuthenticatedRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    // Await params as required by Next.js 15
    const resolvedParams = await params
    const userId = resolvedParams.id

    console.log(`Admin user profile API called for user ID: ${userId}`)

    if (!userId) {
      console.log('No user ID provided')
      return NextResponse.json(
        { message: 'User ID is required' },
        { status: 400 }
      )
    }



    // Calculate week start for XP transactions
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)

    // Fetch user with comprehensive data
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        totalXp: true,
        currentWeekXp: true,
        streakWeeks: true,
        profileImageUrl: true,
        bio: true,
        joinedAt: true,
        lastActiveAt: true,
        _count: {
          select: {
            submissions: true,
            peerReviews: true,
            userAchievements: true
          }
        },
        submissions: {
          select: {
            id: true,
            title: true,
            status: true,
            finalXp: true,
            createdAt: true
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 10 // Recent submissions
        },
        peerReviews: {
          select: {
            id: true,
            xpScore: true,
            createdAt: true,
            submission: {
              select: {
                title: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 10 // Recent reviews
        },
        xpTransactions: {
          where: {
            createdAt: {
              gte: weekStart
            }
          },
          select: {
            amount: true,
            createdAt: true
          }
        }
      }
    })

    if (!user) {
      console.log(`User not found with ID: ${userId}`)
      return NextResponse.json(
        { message: 'User not found', userId },
        { status: 404 }
      )
    }

    console.log(`User found: ${user.username} (${user.email})`)

    // Fetch legacy submissions for this user (matching by discordHandle or username)
    const discordHandle = user.discordHandle || user.username
    const legacySubmissions = await prisma.legacySubmission.findMany({
      where: {
        discordHandle: discordHandle
      },
      select: {
        id: true,
        url: true,
        submittedAt: true,
        aiXp: true,
        peerXp: true,
        finalXp: true,
        importedAt: true
      },
      orderBy: {
        submittedAt: 'desc'
      }
    })

    console.log(`Found ${legacySubmissions.length} legacy submissions for user ${user.username}`)

    // Calculate metrics including legacy data
    const weeklyXp = user.xpTransactions.reduce((sum, tx) => sum + tx.amount, 0)

    // Calculate submission success rate (current submissions only, as legacy are already processed)
    const completedSubmissions = user.submissions.filter(s => s.status === 'COMPLETED').length
    const totalCurrentSubmissions = user._count.submissions
    const totalLegacySubmissions = legacySubmissions.length
    const totalSubmissions = totalCurrentSubmissions + totalLegacySubmissions

    const submissionSuccessRate = totalSubmissions > 0
      ? ((completedSubmissions + totalLegacySubmissions) / totalSubmissions) * 100
      : 0

    // Calculate average review score given (current reviews only, legacy doesn't have peer reviews)
    const avgReviewScore = user.peerReviews.length > 0
      ? user.peerReviews.reduce((sum, review) => sum + (review.xpScore || 0), 0) / user.peerReviews.length
      : 0

    // Determine activity status
    const daysSinceLastActive = user.lastActiveAt
      ? Math.floor((Date.now() - new Date(user.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24))
      : null

    let activityStatus = 'unknown'
    if (daysSinceLastActive !== null) {
      // Check if user is deactivated (lastActiveAt set to very old date)
      const lastActiveYear = new Date(user.lastActiveAt).getFullYear()
      if (lastActiveYear < 2020) {
        activityStatus = 'deactivated'
      } else if (daysSinceLastActive <= 7) {
        activityStatus = 'active'
      } else if (daysSinceLastActive <= 30) {
        activityStatus = 'recent'
      } else {
        activityStatus = 'inactive'
      }
    }

    // Combine current and legacy submissions for recent submissions (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // Format current submissions
    const currentSubmissionsFormatted = user.submissions.map(submission => ({
      id: submission.id,
      title: submission.title || 'Untitled Submission',
      status: submission.status,
      finalXp: submission.finalXp || 0,
      createdAt: submission.createdAt,
      isLegacy: false
    }))

    // Format legacy submissions (filter to last 30 days and take recent ones)
    const recentLegacySubmissions = legacySubmissions
      .filter(legacy => {
        const submissionDate = legacy.submittedAt || legacy.importedAt
        return submissionDate && new Date(submissionDate) >= thirtyDaysAgo
      })
      .slice(0, 5) // Limit legacy submissions in recent view
      .map(legacy => ({
        id: legacy.id,
        title: 'Legacy Submission',
        status: 'LEGACY_IMPORTED',
        finalXp: legacy.finalXp || legacy.aiXp || 0,
        createdAt: legacy.submittedAt || legacy.importedAt,
        isLegacy: true
      }))

    // Combine and sort all recent submissions
    const allRecentSubmissions = [...currentSubmissionsFormatted, ...recentLegacySubmissions]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10) // Take top 10 most recent

    // Transform data for response
    const userProfile = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      totalXp: user.totalXp,
      currentWeekXp: user.currentWeekXp || 0,
      streakWeeks: user.streakWeeks || 0,
      profileImageUrl: user.profileImageUrl,
      bio: user.bio,
      createdAt: user.joinedAt,
      lastActiveAt: user.lastActiveAt,
      metrics: {
        weeklyXp,
        submissionSuccessRate: Math.round(submissionSuccessRate),
        avgReviewScore: Math.round(avgReviewScore * 10) / 10,
        daysSinceLastActive,
        activityStatus,
        totalSubmissions: totalSubmissions, // Include legacy submissions in total
        totalReviews: user._count.peerReviews, // Reviews are current only
        totalAchievements: user._count.userAchievements
      },
      recentSubmissions: allRecentSubmissions,
      recentReviews: user.peerReviews.map(review => ({
        id: review.id,
        submissionTitle: review.submission?.title || 'Untitled Submission',
        xpScore: review.xpScore || 0,
        createdAt: review.createdAt
      }))
    }

    return NextResponse.json(userProfile, {
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=120'
      }
    })

  } catch (error) {
    console.error('Error fetching user profile:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})
