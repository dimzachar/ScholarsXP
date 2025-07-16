import { NextResponse } from 'next/server'
import { userService, submissionService, peerReviewService } from '@/lib/database'

export async function GET() {
  try {
    // Get total users count
    const totalUsers = await userService.count()

    // Get total submissions count
    const totalSubmissions = await submissionService.count()

    // Get pending reviews count (submissions that need peer review)
    const pendingReviews = await submissionService.countByStatus('AI_REVIEWED')

    // Get flagged submissions count
    const flaggedSubmissions = await submissionService.countByStatus('FLAGGED')

    // Get additional stats
    const rejectedSubmissions = await submissionService.countByStatus('REJECTED')

    const finalizedSubmissions = await submissionService.countByStatus('FINALIZED')

    const totalPeerReviews = await peerReviewService.count()

    return NextResponse.json({
      totalUsers,
      totalSubmissions,
      pendingReviews,
      flaggedSubmissions,
      rejectedSubmissions,
      finalizedSubmissions,
      totalPeerReviews
    })

  } catch (error) {
    console.error('Error fetching admin stats:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}

