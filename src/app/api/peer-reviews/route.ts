import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { getTaskType } from '@/lib/task-types'

export const POST = withPermission('review_content')(async (request: AuthenticatedRequest) => {
  try {
    const {
      submissionId,
      xpScore,
      comments,
      criteria,
      timeSpent,
      qualityRating
    } = await request.json()

    if (!submissionId || xpScore === undefined) {
      return NextResponse.json(
        { message: 'Submission ID and XP score are required' },
        { status: 400 }
      )
    }

    if (!comments || comments.trim().length < 20) {
      return NextResponse.json(
        { message: 'Comments are required and must be at least 20 characters' },
        { status: 400 }
      )
    }

    // Get reviewer ID from authenticated user
    const reviewerId = request.user.id

    // Create authenticated Supabase client that respects RLS policies
    // Get access token from the authenticated user (provided by auth middleware)
    const accessToken = request.user.access_token ||
                       request.headers.get('authorization')?.replace('Bearer ', '') ||
                       request.cookies.get('sb-access-token')?.value || ''

    const supabase = createAuthenticatedClient(
      accessToken,
      request.user.refresh_token || request.cookies.get('sb-refresh-token')?.value
    )

    // Get submission to validate XP score against task-specific ranges
    const { data: submission, error: submissionError } = await supabase
      .from('Submission')
      .select('taskTypes')
      .eq('id', submissionId)
      .single()

    if (submissionError || !submission) {
      return NextResponse.json(
        { message: 'Submission not found' },
        { status: 404 }
      )
    }

    // Validate XP score against task-specific ranges
    if (submission.taskTypes && submission.taskTypes.length > 0) {
      const primaryTaskType = submission.taskTypes[0]
      const taskTypeConfig = getTaskType(primaryTaskType)
      const { min, max } = taskTypeConfig.xpRange

      if (xpScore < min || xpScore > max) {
        return NextResponse.json(
          { message: `XP score must be between ${min} and ${max} for task type ${primaryTaskType}` },
          { status: 400 }
        )
      }
    } else {
      // Fallback to old validation if no task types (legacy submissions)
      if (xpScore < 0 || xpScore > 100) {
        return NextResponse.json(
          { message: 'XP score must be between 0 and 100' },
          { status: 400 }
        )
      }
    }

    // Check if reviewer has an active assignment for this submission
    const { data: assignment, error: assignmentError } = await supabase
      .from('ReviewAssignment')
      .select('id, deadline, status')
      .eq('submissionId', submissionId)
      .eq('reviewerId', reviewerId)
      .single()

    if (assignmentError || !assignment) {
      return NextResponse.json(
        { message: 'No active review assignment found for this submission' },
        { status: 403 }
      )
    }

    if (assignment.status === 'COMPLETED') {
      return NextResponse.json(
        { message: 'Review has already been submitted for this assignment' },
        { status: 400 }
      )
    }

    // Check if review is late
    const deadline = new Date(assignment.deadline)
    const now = new Date()
    const isLate = now > deadline

    // Create the peer review
    const { data: review, error: reviewError } = await supabase
      .from('PeerReview')
      .insert({
        reviewerId,
        submissionId,
        xpScore,
        comments: comments.trim(),
        timeSpent: timeSpent || 1,
        qualityRating: qualityRating || 4,
        isLate
      })
      .select()
      .single()

    if (reviewError) {
      console.error('Error creating peer review:', reviewError)
      return NextResponse.json(
        { message: 'Failed to save review' },
        { status: 500 }
      )
    }

    // Update the assignment status
    const { error: assignmentUpdateError } = await supabase
      .from('ReviewAssignment')
      .update({
        status: 'COMPLETED',
        completedAt: now.toISOString()
      })
      .eq('id', assignment.id)

    if (assignmentUpdateError) {
      console.error('Error updating assignment:', assignmentUpdateError)
    }

    // Award XP using the incentives system
    const { reviewIncentivesService } = await import('@/lib/review-incentives')
    const { consensusCalculatorService } = await import('@/lib/consensus-calculator')

    const rewardDetails = await reviewIncentivesService.awardReviewXp(
      reviewerId,
      submissionId,
      qualityRating || 4,
      timeSpent || 1,
      isLate,
      new Date(assignment.assignedAt)
    )

    // Check if all reviews are complete and trigger consensus calculation
    const { data: remainingAssignments } = await supabase
      .from('ReviewAssignment')
      .select('id')
      .eq('submissionId', submissionId)
      .in('status', ['PENDING', 'IN_PROGRESS'])

    let consensusResult = null
    if (!remainingAssignments || remainingAssignments.length === 0) {
      // All reviews completed, calculate consensus
      consensusResult = await consensusCalculatorService.calculateConsensus(submissionId)
      console.log(`🎯 All reviews completed for submission ${submissionId}, consensus calculated`)
    }

    console.log(`✅ Review submitted by ${reviewerId} for submission ${submissionId}: ${xpScore} XP, quality: ${qualityRating}/5, time: ${timeSpent}min, late: ${isLate}`)

    return NextResponse.json({
      message: 'Review submitted successfully',
      reviewId: review.id,
      reward: rewardDetails,
      consensus: consensusResult ? {
        calculated: true,
        finalXp: consensusResult.finalXp,
        confidence: consensusResult.confidence
      } : {
        calculated: false,
        pendingReviews: remainingAssignments?.length || 0
      }
    })

  } catch (error) {
    console.error('Error submitting peer review:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})

