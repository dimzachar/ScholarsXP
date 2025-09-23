import { prisma } from '@/lib/prisma'
import { reviewerPoolService } from '@/lib/reviewer-pool'
import type { AssignmentResult, ReviewerPoolOptions } from '@/lib/reviewer-pool'

export interface EnsureReviewAssignmentsResult {
  success: boolean
  status: 'ASSIGNED' | 'SKIPPED_ALREADY_ASSIGNED' | 'FAILED'
  assignmentResult?: AssignmentResult
  existingAssignments?: number
  error?: string
}

export async function ensureReviewAssignments(
  submissionId: string,
  submissionUserId: string,
  options: ReviewerPoolOptions = {}
): Promise<EnsureReviewAssignmentsResult> {
  try {
    const existingAssignments = await prisma.reviewAssignment.count({
      where: { submissionId }
    })

    if (existingAssignments > 0) {
      console.log(`[PeerReview] Skipping auto-assignment for ${submissionId}: ${existingAssignments} assignment(s) already exist`)
      return {
        success: true,
        status: 'SKIPPED_ALREADY_ASSIGNED',
        existingAssignments
      }
    }

    const mergedOptions: ReviewerPoolOptions = {
      ...options
    }

    if (mergedOptions.minimumReviewers === undefined) {
      const envValue = parseInt(
        process.env.REVIEWER_MINIMUM_REQUIRED ||
        process.env.MIN_REVIEWERS_REQUIRED ||
        '',
        10
      )

      if (!Number.isNaN(envValue) && envValue > 0) {
        mergedOptions.minimumReviewers = envValue
      }
    }

    if (mergedOptions.allowPartialAssignment === undefined) {
      const allowPartialEnv = (process.env.ALLOW_PARTIAL_REVIEW_ASSIGNMENTS || '').toLowerCase() === 'true'
      mergedOptions.allowPartialAssignment = allowPartialEnv || process.env.NODE_ENV !== 'production'
    }

    const assignmentResult = await reviewerPoolService.assignReviewers(
      submissionId,
      submissionUserId,
      mergedOptions
    )

    if (assignmentResult.success) {
      console.log(`[PeerReview] Auto-assigned ${assignmentResult.assignedReviewers.length} reviewer(s) to submission ${submissionId}`)
      if (assignmentResult.warnings.length > 0) {
        console.warn(`[PeerReview] Assignment warnings for ${submissionId}: ${assignmentResult.warnings.join('; ')}`)
      }
    } else {
      const errorMessage = assignmentResult.errors.join('; ') || 'Unknown error'
      console.warn(`[PeerReview] Failed to auto-assign reviewers for ${submissionId}: ${errorMessage}`)
    }

    return {
      success: assignmentResult.success,
      status: assignmentResult.success ? 'ASSIGNED' : 'FAILED',
      assignmentResult
    }
  } catch (error) {
    console.error(`Error ensuring review assignments for submission ${submissionId}:`, error)
    return {
      success: false,
      status: 'FAILED',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}
