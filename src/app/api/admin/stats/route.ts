import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPermission } from '@/lib/auth-middleware'
import { withAdminOptimization } from '@/middleware/api-optimization'
import { getLegacySubmissionCount } from '@/lib/queries/admin-submissions-optimized'

const handler = async () => {
  try {
    console.log('Starting admin stats fetch...')
    
    // Get total users count
    const totalUsers = await prisma.user.count()
    console.log('Total users:', totalUsers)

    // Get total submissions including legacy (should match the 1008 the user expects)
    const totalSubmissions = await prisma.submission.count()
    const legacySubmissions = await getLegacySubmissionCount({})
    const totalSubmissionsWithLegacy = totalSubmissions + legacySubmissions
    console.log('Regular submissions:', totalSubmissions)
    console.log('Legacy submissions:', legacySubmissions)
    console.log('Total submissions with legacy:', totalSubmissionsWithLegacy)

    // Get total peer reviews count
    const totalPeerReviews = await prisma.peerReview.count()
    console.log('Total peer reviews:', totalPeerReviews)

    // Get active users count (users who have submitted in the last 7 days)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    
    const activeUsers = await prisma.user.count({
      where: {
        submissions: {
          some: {
            createdAt: {
              gte: sevenDaysAgo
            }
          }
        }
      }
    })
    console.log('Active users (7 days):', activeUsers)

    // Get total XP awarded
    const totalXpAwarded = await prisma.xpTransaction.aggregate({
      _sum: {
        amount: true
      }
    })
    const totalXpValue = totalXpAwarded._sum?.amount || 0
    console.log('Total XP awarded:', totalXpValue)

    // Get users with role not equal to 'USER' (excluding regular users)
    const adminUsers = await prisma.user.count({
      where: {
        role: {
          in: ['ADMIN', 'REVIEWER'] // Only count actual admin and reviewer roles
        }
      }
    })
    console.log('Admin/Reviewer users:', adminUsers)

    // Get submission status counts
    const [pendingReviews, underPeerReview, flaggedSubmissions, rejectedSubmissions, finalizedSubmissions] = await Promise.all([
      prisma.submission.count({ where: { status: 'AI_REVIEWED' } }),
      prisma.submission.count({ where: { status: 'UNDER_PEER_REVIEW' } }),
      prisma.submission.count({ where: { status: 'FLAGGED' } }),
      prisma.submission.count({ where: { status: 'REJECTED' } }),
      prisma.submission.count({ where: { status: 'FINALIZED' } })
    ])

    console.log('Pending reviews:', pendingReviews)
    console.log('Flagged submissions:', flaggedSubmissions)
    console.log('Rejected submissions:', rejectedSubmissions)
    console.log('Finalized submissions:', finalizedSubmissions)

    // Get users who submitted in the last 24 hours (more active stat)
    const twentyFourHoursAgo = new Date()
    twentyFourHoursAgo.setDate(twentyFourHoursAgo.getDate() - 1)
    
    const recentUsers = await prisma.user.count({
      where: {
        submissions: {
          some: {
            createdAt: {
              gte: twentyFourHoursAgo
            }
          }
        }
      }
    })
    console.log('Users active (24h):', recentUsers)

    // Get total users this week
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)
    
    const weeklyUsers = await prisma.user.count({
      where: {
        createdAt: {
          gte: weekStart
        }
      }
    })
    console.log('New users this week:', weeklyUsers)

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

    console.log('Returning result:', result)
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
