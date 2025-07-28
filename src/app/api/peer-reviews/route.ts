import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { getTaskType } from '@/lib/task-types'
import { withErrorHandling, createSuccessResponse, validateRequiredFields } from '@/lib/api-middleware'
import { ValidationError } from '@/lib/api-error-handler'

export const POST = withPermission('review_content')(
  withErrorHandling(async (request: AuthenticatedRequest) => {
    const {
      submissionId,
      xpScore,
      comments,
      criteria,
      timeSpent,
      qualityRating
    } = await request.json()

    validateRequiredFields({ submissionId, xpScore }, ['submissionId', 'xpScore'])

    if (!comments || comments.trim().length < 20) {
      throw new ValidationError('Comments are required and must be at least 20 characters', {
        field: 'comments',
        minLength: 20,
        currentLength: comments?.trim().length || 0
      })
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
      return NextResponse.json({
        success: false,
        error: {
          error: 'Submission not found',
          code: 'NOT_FOUND',
          details: submissionError?.message
        }
      }, { status: 404 })
    }

    // Validate XP score against task-specific ranges
    if (submission.taskTypes && submission.taskTypes.length > 0) {
      const primaryTaskType = submission.taskTypes[0]
      const taskTypeConfig = getTaskType(primaryTaskType)
      const { min, max } = taskTypeConfig.xpRange

      if (xpScore < min || xpScore > max) {
        return NextResponse.json({
          success: false,
          error: {
            error: `XP score must be between ${min} and ${max} for task type ${primaryTaskType}`,
            code: 'VALIDATION_ERROR',
            details: { min, max, taskType: primaryTaskType, provided: xpScore }
          }
        }, { status: 400 })
      }
    } else {
      // Fallback to old validation if no task types (legacy submissions)
      if (xpScore < 0 || xpScore > 100) {
        return NextResponse.json({
          success: false,
          error: {
            error: 'XP score must be between 0 and 100',
            code: 'VALIDATION_ERROR',
            details: { min: 0, max: 100, provided: xpScore }
          }
        }, { status: 400 })
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
      return NextResponse.json({
        success: false,
        error: {
          error: 'No active review assignment found for this submission',
          code: 'FORBIDDEN',
          details: assignmentError?.message
        }
      }, { status: 403 })
    }

    if (assignment.status === 'COMPLETED') {
      return NextResponse.json({
        success: false,
        error: {
          error: 'Review has already been submitted for this assignment',
          code: 'ALREADY_EXISTS',
          details: { assignmentId: assignment.id, status: assignment.status }
        }
      }, { status: 400 })
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
      return NextResponse.json({
        success: false,
        error: {
          error: 'Failed to save review',
          code: 'DATABASE_ERROR',
          details: reviewError.message
        }
      }, { status: 500 })
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

    return createSuccessResponse({
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
  })
)

