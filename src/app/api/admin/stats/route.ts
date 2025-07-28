import { NextResponse } from 'next/server'
import { userService, submissionService, peerReviewService } from '@/lib/database'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Get total users count
    const totalUsers = await userService.count()

    // Get total submissions count (regular + legacy)
    const [regularSubmissions, legacySubmissions] = await Promise.all([
      submissionService.count(),
      prisma.legacySubmission.count()
    ])
    const totalSubmissions = regularSubmissions + legacySubmissions

    // Get pending reviews count (submissions that need peer review)
    const pendingReviews = await submissionService.countByStatus('AI_REVIEWED')

    // Get flagged submissions count
    const flaggedSubmissions = await submissionService.countByStatus('FLAGGED')

    // Get additional stats
    const rejectedSubmissions = await submissionService.countByStatus('REJECTED')

    const finalizedSubmissions = await submissionService.countByStatus('FINALIZED')

    const totalPeerReviews = await peerReviewService.count()

    return NextResponse.json({
      success: true,
      data: {
        totalUsers,
        totalSubmissions,
        pendingReviews,
        flaggedSubmissions,
        rejectedSubmissions,
        finalizedSubmissions,
        legacySubmissions,
        totalPeerReviews
      }
    })

  } catch (error) {
    console.error('Error fetching admin stats:', error)
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

