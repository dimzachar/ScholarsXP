import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPermission } from '@/lib/auth-middleware'
import { withAdminOptimization } from '@/middleware/api-optimization'
import { getLegacySubmissionCount } from '@/lib/queries/admin-submissions-optimized'

const handler = async () => {
  try {
    // console.log('Starting admin stats fetch...')

    // Get date boundaries upfront
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const twentyFourHoursAgo = new Date()
    twentyFourHoursAgo.setDate(twentyFourHoursAgo.getDate() - 1)

    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)

    // Run ALL queries in parallel to minimize connection hold time
    const [
      totalUsers,
      totalSubmissions,
      legacySubmissions,
      totalPeerReviews,
      activeUsers,
      totalXpAwarded,
      adminUsers,
      pendingReviews,
      underPeerReview,
      flaggedSubmissions,
      rejectedSubmissions,
      finalizedSubmissions,
      recentUsers,
      weeklyUsers
    ] = await Promise.all([
      // Basic counts
      prisma.user.count(),
      prisma.submission.count(),
      getLegacySubmissionCount({}),
      prisma.peerReview.count(),

      // Active users (7 days)
      prisma.user.count({
        where: {
          submissions: {
            some: { createdAt: { gte: sevenDaysAgo } }
          }
        }
      }),

      // Total XP
      prisma.xpTransaction.aggregate({ _sum: { amount: true } }),

      // Admin/Reviewer count
      prisma.user.count({
        where: { role: { in: ['ADMIN', 'REVIEWER'] } }
      }),

      // Submission status counts
      prisma.submission.count({ where: { status: 'AI_REVIEWED' } }),
      prisma.submission.count({ where: { status: 'UNDER_PEER_REVIEW' } }),
      prisma.submission.count({ where: { status: 'FLAGGED' } }),
      prisma.submission.count({ where: { status: 'REJECTED' } }),
      prisma.submission.count({ where: { status: 'FINALIZED' } }),

      // Recent users (24h)
      prisma.user.count({
        where: {
          submissions: {
            some: { createdAt: { gte: twentyFourHoursAgo } }
          }
        }
      }),

      // Weekly new users
      prisma.user.count({
        where: { createdAt: { gte: weekStart } }
      })
    ])

    const totalSubmissionsWithLegacy = totalSubmissions + legacySubmissions
    const totalXpValue = totalXpAwarded._sum?.amount || 0

    // console.log('All stats fetched in parallel')

    const result = {
      success: true,
      data: {
        totalUsers,
        activeUsers, // Users from last 7 days
        totalSubmissions: totalSubmissionsWithLegacy, // Include legacy
        legacySubmissions,
        pendingReviews,
        underPeerReview,
        flaggedSubmissions,
        rejectedSubmissions,
        finalizedSubmissions,
        totalPeerReviews,
        totalXpAwarded: totalXpValue,
        adminUsers,
        recentUsers, // Users active in last 24 hours
        weeklyUsers // New users this week
      }
    }

    // console.log('Returning result:', result)
    return NextResponse.json(result)

  } catch (error) {
    console.error('Error fetching admin stats:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack')
    return NextResponse.json(
      {
        success: false,
        error: {
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    )
  }
}

export const GET = withAdminOptimization(withPermission('admin_access')(handler))
