import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase-server'
import { ensureReviewAssignments } from '@/lib/auto-review-assignment'
import { logAdminAction } from '@/lib/audit-log'

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

    const allowedStatuses = new Set(['AI_REVIEWED', 'UNDER_PEER_REVIEW'])

    // Check if submission is in the correct status for assignment
    if (!allowedStatuses.has(submission.status)) {
      return NextResponse.json(
        { message: `Submission must be in AI_REVIEWED or UNDER_PEER_REVIEW status. Current status: ${submission.status}` },
        { status: 400 }
      )
    }

    const result = await ensureReviewAssignments(submissionId, submission.userId, {
      taskTypes: submission.taskTypes
    })

    // Log admin action for auto assignment
    if (result.success && result.status === 'ASSIGNED' && result.assignmentResult?.assignedReviewers) {
      await logAdminAction({
        adminId: request.user.id,
        action: 'REVIEW_AUTO_ASSIGN',
        targetType: 'submission',
        targetId: submissionId,
        details: {
          subAction: 'AUTO_ASSIGN',
          assignedReviewers: result.assignmentResult.assignedReviewers.map(r => ({
            id: r.id,
            username: r.username || r.email
          })),
          reviewerCount: result.assignmentResult.assignedReviewers.length,
          warnings: result.assignmentResult.warnings || [],
          timestamp: new Date().toISOString()
        }
      })
    }

    if (!result.success) {
      return NextResponse.json(
        {
          message: result.error || 'Failed to assign reviewers',
          warnings: result.assignmentResult?.warnings
        },
        { status: 400 }
      )
    }

    return NextResponse.json({
      message: result.status === 'SKIPPED_ALREADY_ASSIGNED'
        ? 'Submission already has the required number of reviewers'
        : 'Reviewers assigned successfully',
      assignedReviewers: result.assignmentResult?.assignedReviewers ?? [],
      warnings: result.assignmentResult?.warnings ?? []
    })

  } catch (error) {
    console.error('Error in auto assignment:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})
