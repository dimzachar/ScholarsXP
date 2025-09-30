import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { getTaskType } from '@/lib/task-types'
import {
  resolveTaskFromPlatform,
  getXpForTier,
  isValidCategory,
  isValidTier,
  getRejectedXp
} from '@/lib/xp-rules-v2'
import { withErrorHandling, createSuccessResponse, validateRequiredFields } from '@/lib/api-middleware'
import { ValidationError } from '@/lib/api-error-handler'

export const POST = withPermission('review_content')(
  withErrorHandling(async (request: AuthenticatedRequest) => {
    const {
      submissionId,
      xpScore: xpScoreInput,
      comments,
      criteria,
      timeSpent,
      qualityRating,
      category,
      tier,
      isRejected
    } = await request.json()

    // Require submissionId always; require either numeric xpScore (legacy) or category+tier (v2)
    validateRequiredFields({ submissionId }, ['submissionId'])
    const rejected = Boolean(isRejected)

    if (!rejected && !(isValidCategory(category) && isValidTier(tier)) && (xpScoreInput === undefined || xpScoreInput === null)) {
      throw new ValidationError('Provide category+tier (v2) or legacy xpScore', {
        required: ['submissionId', 'category+tier' /* or xpScore */]
      })
    }

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

    // Get submission to determine platform/task for XP mapping
    const { data: submission, error: submissionError } = await supabase
      .from('Submission')
      .select('platform, taskTypes')
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

    // Compute XP via v2 mapping when category+tier provided; otherwise support legacy xpScore validation
    let computedXp: number
    if (rejected) {
      computedXp = getRejectedXp()
    } else if (isValidCategory(category) && isValidTier(tier)) {
      const task = resolveTaskFromPlatform(submission.platform)
      if (!task) {
        return NextResponse.json({
          success: false,
          error: {
            error: `Unsupported platform for review mapping: ${submission.platform}`,
            code: 'INVALID_PLATFORM'
          }
        }, { status: 400 })
      }
      // Enforce platform restrictions: A => Twitter only; B => Medium/Reddit only
      if (task === 'A' && submission.platform !== 'Twitter') {
        return NextResponse.json({
          success: false,
          error: {
            error: `Task A applies to Twitter only; got ${submission.platform}`,
            code: 'INVALID_PLATFORM'
          }
        }, { status: 400 })
      }
      if (task === 'B' && submission.platform !== 'Medium' && submission.platform !== 'Reddit') {
        return NextResponse.json({
          success: false,
          error: {
            error: `Task B applies to Medium or Reddit; got ${submission.platform}`,
            code: 'INVALID_PLATFORM'
          }
        }, { status: 400 })
      }
      computedXp = getXpForTier(task, category, tier)
    } else {
      // Legacy path: validate numeric xpScore against task-specific range if available, else 0-100
      const xpScore = Number(xpScoreInput)
      if (Number.isNaN(xpScore)) {
        return NextResponse.json({
          success: false,
          error: { error: 'Invalid xpScore', code: 'VALIDATION_ERROR' }
        }, { status: 400 })
      }
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
      } else if (xpScore < 0 || xpScore > 100) {
        return NextResponse.json({
          success: false,
          error: {
            error: 'XP score must be between 0 and 100',
            code: 'VALIDATION_ERROR',
            details: { min: 0, max: 100, provided: xpScore }
          }
        }, { status: 400 })
      }
      computedXp = Math.round(xpScore)
    }

    // Check if reviewer has an active assignment for this submission
    const { data: assignment, error: assignmentError } = await supabase
      .from('ReviewAssignment')
      .select('id, deadline, status, assignedAt')
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
        xpScore: computedXp,
        contentCategory: !rejected && isValidCategory(category) ? category : null,
        qualityTier: !rejected && isValidTier(tier) ? tier : null,
        comments: comments.trim(),
        timeSpent: timeSpent || 1,
        // No self-assessed quality in v2; persist null
        qualityRating: null,
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
    let rewardDetails = null
    const assignedAtDate = assignment.assignedAt ? new Date(assignment.assignedAt) : now
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const { reviewIncentivesService } = await import('@/lib/review-incentives')
        rewardDetails = await reviewIncentivesService.awardReviewXp(
          reviewerId,
          submissionId,
          null,
          timeSpent || 1,
          isLate,
          assignedAtDate
        )
      } catch (rewardError) {
        console.error('Error awarding reviewer incentive XP:', rewardError)
      }
    } else {
      console.warn(
        'SUPABASE_SERVICE_ROLE_KEY not set; skipping review incentive reward calculation.'
      )
    }

    // Check if all reviews are complete and trigger consensus calculation
    const { data: remainingAssignments } = await supabase
      .from('ReviewAssignment')
      .select('id')
      .eq('submissionId', submissionId)
      .in('status', ['PENDING', 'IN_PROGRESS'])

    let consensusResult = null
    if (!remainingAssignments || remainingAssignments.length === 0) {
      // All reviews completed, calculate consensus if service role available
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { consensusCalculatorService } = await import('@/lib/consensus-calculator')
        consensusResult = await consensusCalculatorService.calculateConsensus(submissionId)
        console.log(`🎯 All reviews completed for submission ${submissionId}, consensus calculated`)
      } else {
        console.warn(
          'SUPABASE_SERVICE_ROLE_KEY not set; skipping consensus calculation for submission',
          submissionId
        )
      }
    }

    console.log(`✅ Review submitted by ${reviewerId} for submission ${submissionId}: ${computedXp} XP, quality: ${qualityRating}/5, time: ${timeSpent}min, late: ${isLate}, rejected: ${rejected}`)

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

