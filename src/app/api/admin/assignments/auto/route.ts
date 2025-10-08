import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase-server'
import { reviewerPoolService } from '@/lib/reviewer-pool'
import { notifyReviewAssigned } from '@/lib/notifications'

export const POST = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const { submissionId } = await request.json()

    if (!submissionId) {
      return NextResponse.json(
        { message: 'Submission ID is required' },
        { status: 400 }
      )
    }

    // Get submission details to find the author
    // Admin operations require service client for elevated privileges
    const supabase = createServiceClient()

    const { data: submission, error: submissionError } = await supabase
      .from('Submission')
      .select('userId, status, taskTypes, url')
      .eq('id', submissionId)
      .single()

    if (submissionError || !submission) {
      return NextResponse.json(
        { message: 'Submission not found' },
        { status: 404 }
      )
    }

    // Check if submission is in the correct status for assignment
    if (submission.status !== 'AI_REVIEWED') {
      return NextResponse.json(
        { message: `Submission must be in AI_REVIEWED status. Current status: ${submission.status}` },
        { status: 400 }
      )
    }

    // Check if reviewers are already assigned
    const { data: existingAssignments } = await supabase
      .from('ReviewAssignment')
      .select('id')
      .eq('submissionId', submissionId)

    if (existingAssignments && existingAssignments.length > 0) {
      return NextResponse.json(
        { message: 'Reviewers are already assigned to this submission' },
        { status: 400 }
      )
    }

    // Assign reviewers automatically
    const assignmentResult = await reviewerPoolService.assignReviewers(
      submissionId,
      submission.userId,
      {
        taskTypes: submission.taskTypes
      }
    )

    if (!assignmentResult.success) {
      return NextResponse.json(
        { 
          message: 'Failed to assign reviewers',
          errors: assignmentResult.errors,
          warnings: assignmentResult.warnings
        },
        { status: 400 }
      )
    }

    const notificationResults = await Promise.allSettled(
      assignmentResult.assignedReviewers.map(reviewer =>
        notifyReviewAssigned(reviewer.id, submissionId, submission.url)
      )
    )

    const notificationWarnings = notificationResults.reduce<string[]>((warnings, result, index) => {
      if (result.status === 'rejected') {
        const reviewer = assignmentResult.assignedReviewers[index]
        console.error(
          `Failed to notify reviewer ${reviewer.id} about assignment to submission ${submissionId}:`,
          result.reason
        )
        warnings.push(`Failed to notify reviewer ${reviewer.username || reviewer.email}`)
      }
      return warnings
    }, [])

    const combinedWarnings = [
      ...assignmentResult.warnings,
      ...notificationWarnings
    ]

    return NextResponse.json({
      message: 'Reviewers assigned successfully',
      assignedReviewers: assignmentResult.assignedReviewers.map(reviewer => ({
        id: reviewer.id,
        username: reviewer.username,
        totalXp: reviewer.totalXp,
        activeAssignments: reviewer.activeAssignments
      })),
      warnings: combinedWarnings
    })

  } catch (error) {
    console.error('Error in auto assignment:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})
