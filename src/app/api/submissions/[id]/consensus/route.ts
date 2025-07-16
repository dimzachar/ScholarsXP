import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { consensusCalculatorService } from '@/lib/consensus-calculator'

interface RouteParams {
  params: {
    id: string
  }
}

export const POST = withPermission('admin')(async (
  request: AuthenticatedRequest,
  { params }: RouteParams
) => {
  try {
    const submissionId = params.id

    if (!submissionId) {
      return NextResponse.json(
        { message: 'Submission ID is required' },
        { status: 400 }
      )
    }

    // Calculate consensus for the submission
    const consensusResult = await consensusCalculatorService.calculateConsensus(submissionId)

    if (!consensusResult) {
      return NextResponse.json(
        { message: 'Failed to calculate consensus. Check if submission has sufficient reviews.' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      message: 'Consensus calculated successfully',
      consensus: consensusResult
    })

  } catch (error) {
    console.error('Error calculating consensus:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})

// Allow reviewers to view consensus results
export const GET = withPermission('review_content')(async (
  request: AuthenticatedRequest,
  { params }: RouteParams
) => {
  try {
    const submissionId = params.id

    // Import the secure client factory
    const { createAuthenticatedClient } = await import('@/lib/supabase-server')

    // Create authenticated client that respects RLS policies
    const accessToken = request.user.access_token ||
                       request.headers.get('authorization')?.replace('Bearer ', '') ||
                       request.cookies.get('sb-access-token')?.value || ''

    const supabase = createAuthenticatedClient(
      accessToken,
      request.user.refresh_token || request.cookies.get('sb-refresh-token')?.value
    )

    // Get submission with consensus data
    const { data: submission, error } = await supabase
      .from('Submission')
      .select(`
        id,
        finalXp,
        consensusScore,
        aiXp,
        status,
        reviewCount,
        peerReviews:PeerReview(
          id,
          xpScore,
          qualityRating,
          isLate,
          reviewer:User(username)
        )
      `)
      .eq('id', submissionId)
      .single()

    if (error || !submission) {
      return NextResponse.json(
        { message: 'Submission not found' },
        { status: 404 }
      )
    }

    // Only show consensus data if submission is finalized
    if (submission.status !== 'FINALIZED') {
      return NextResponse.json(
        { message: 'Consensus not yet calculated for this submission' },
        { status: 400 }
      )
    }

    // Calculate summary statistics
    const peerScores = submission.peerReviews?.map(r => r.xpScore) || []
    const averagePeerScore = peerScores.length > 0 
      ? Math.round(peerScores.reduce((sum, score) => sum + score, 0) / peerScores.length)
      : 0

    const qualityRatings = submission.peerReviews?.filter(r => r.qualityRating).map(r => r.qualityRating) || []
    const averageQuality = qualityRatings.length > 0
      ? Math.round((qualityRatings.reduce((sum, rating) => sum + rating, 0) / qualityRatings.length) * 10) / 10
      : 0

    const lateReviews = submission.peerReviews?.filter(r => r.isLate).length || 0

    return NextResponse.json({
      submissionId,
      status: submission.status,
      consensus: {
        finalXp: submission.finalXp,
        consensusScore: submission.consensusScore,
        aiXp: submission.aiXp,
        averagePeerScore,
        reviewCount: submission.reviewCount,
        averageQuality,
        lateReviews
      },
      reviews: submission.peerReviews?.map(review => ({
        xpScore: review.xpScore,
        qualityRating: review.qualityRating,
        isLate: review.isLate,
        reviewer: review.reviewer?.username
      })) || []
    })

  } catch (error) {
    console.error('Error fetching consensus data:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})
