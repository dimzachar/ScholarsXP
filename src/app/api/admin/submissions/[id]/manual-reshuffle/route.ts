import { NextResponse } from 'next/server'

import { withPermission, type AuthenticatedRequest } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase-server'
import { reviewerPoolService } from '@/lib/reviewer-pool'
import { logAdminAction } from '@/lib/audit-log'
import { prisma } from '@/lib/prisma'
import { xpAnalyticsService } from '@/lib/xp-analytics'
import { notifyReviewAssigned } from '@/lib/notifications'

const MISSED_REVIEW_PENALTY = -10

interface RouteContext {
  params: {
    id: string
  }
}

export const POST = withPermission('admin_access')(async (
  request: AuthenticatedRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: submissionId } = await params

  if (!submissionId) {
    return NextResponse.json(
      { message: 'Submission ID is required' },
      { status: 400 }
    )
  }

  let body: { assignmentIds?: string[]; reason?: string } = {}

  try {
    body = await request.json()
  } catch (error) {
    // Ignore empty bodies
  }

  const reason = body.reason || 'manual:admin'
  const assignmentIds = body.assignmentIds || []

  try {
    const supabase = createServiceClient()

    // If no specific assignment IDs provided, reshuffle all pending or missed assignments
    let assignmentsToReshuffle = assignmentIds
    if (!assignmentsToReshuffle || assignmentsToReshuffle.length === 0) {
      const { data: allAssignments, error: fetchError } = await supabase
        .from('ReviewAssignment')
        .select('id')
        .eq('submissionId', submissionId)
        .in('status', ['PENDING', 'MISSED'])

      if (fetchError) {
        console.error('Failed to fetch assignments to reshuffle:', fetchError)
        return NextResponse.json(
          { message: 'Failed to fetch assignments' },
          { status: 500 }
        )
      }

      assignmentsToReshuffle = allAssignments?.map((a: { id: string }) => a.id) || []
    }

    if (!assignmentsToReshuffle || assignmentsToReshuffle.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No assignments available for reshuffling',
        reshuffledCount: 0,
        assignments: []
      })
    }

    const results = []
    let reshuffledCount = 0

    // Process each assignment
    for (const assignmentId of assignmentsToReshuffle) {
      try {
        const result = await reshuffleSingleAssignment(supabase, assignmentId, reason)
        
        console.log(`Reshuffle result for assignment ${assignmentId}:`, result)
        
        results.push({
          assignmentId,
          success: result.success,
          error: result.error,
          details: result.details
        })

        if (result.success) {
          reshuffledCount++
        }
      } catch (assignmentError) {
        console.error(`Failed to reshuffle assignment ${assignmentId}:`, assignmentError)
        results.push({
          assignmentId,
          success: false,
          error: assignmentError instanceof Error ? assignmentError.message : 'Unknown error',
          details: null
        })
      }
    }

    // Log admin action for manual reshuffle
    if (reshuffledCount > 0) {
      await logAdminAction({
        adminId: request.user.id,
        action: 'REVIEW_MANUAL_RESHUFFLE',
        targetType: 'submission',
        targetId: submissionId,
        details: {
          subAction: 'MANUAL_RESHUFFLE',
          assignmentIds: assignmentsToReshuffle,
          reshuffledCount,
          totalProcessed: assignmentsToReshuffle.length,
          reason: reason,
          assignmentResults: results,
          timestamp: new Date().toISOString()
        }
      })
    }

    return NextResponse.json({
      success: true,
      message: `Successfully processed ${assignmentsToReshuffle.length} assignments, reshuffled ${reshuffledCount}.`,
      submissionId,
      totalProcessed: assignmentsToReshuffle.length,
      reshuffledCount,
      assignments: results
    })

  } catch (error) {
    console.error('Failed to perform manual reshuffle:', error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
})

async function reshuffleSingleAssignment(supabase: any, assignmentId: string, reason: string) {
  try {
    console.log(`Starting reshuffle for assignment ${assignmentId}`)
    
    // Get current assignment details
    const { data: assignment, error: fetchError } = await supabase
      .from('ReviewAssignment')
      .select('*')
      .eq('id', assignmentId)
      .single()

    console.log('Assignment fetch result:', { assignment, fetchError })

    if (fetchError || !assignment) {
      return {
        success: false,
        error: fetchError?.message || 'Assignment not found',
        details: null
      }
    }

    console.log(`Assignment status: ${assignment.status}, submissionId: ${assignment.submissionId}`)

    // Only reshuffle PENDING or MISSED assignments
    if (assignment.status !== 'PENDING' && assignment.status !== 'MISSED') {
      return {
        success: false,
        error: `Cannot reshuffle assignment with status: ${assignment.status}`,
        details: { currentStatus: assignment.status }
      }
    }

    // Check if assignment is overdue and apply penalty
    const deadline = new Date(assignment.deadline)
    const now = new Date()
    const isOverdue = deadline < now
    let penaltyApplied = false

    if (isOverdue) {
      try {
        // Fetch current missedReviews count and increment
        const { data: userData, error: userFetchError } = await supabase
          .from('User')
          .select('missedReviews')
          .eq('id', assignment.reviewerId)
          .single()

        if (userFetchError) {
          console.error(`Failed to fetch user for penalty:`, userFetchError)
        } else {
          const currentMissed = userData?.missedReviews || 0
          const { error: updateError } = await supabase
            .from('User')
            .update({
              missedReviews: currentMissed + 1,
              updatedAt: new Date().toISOString()
            })
            .eq('id', assignment.reviewerId)

          if (updateError) {
            console.error(`Failed to increment missedReviews:`, updateError)
          }
        }

        // Record penalty XP transaction
        await xpAnalyticsService.recordXpTransaction(
          assignment.reviewerId,
          MISSED_REVIEW_PENALTY,
          'PENALTY',
          `Missed review deadline for submission ${assignment.submissionId} (reshuffled)`,
          assignment.submissionId
        )

        penaltyApplied = true
        console.log(`⚠️ Penalty applied to reviewer ${assignment.reviewerId} for overdue assignment ${assignmentId}: ${MISSED_REVIEW_PENALTY} XP`)
      } catch (penaltyError) {
        console.error(`Failed to apply penalty for assignment ${assignmentId}:`, penaltyError)
        // Continue with reshuffle even if penalty fails
      }
    }

    // Get excluded reviewers (all reviewers assigned to this submission)
    const { data: existingAssignments, error: existingError } = await supabase
      .from('ReviewAssignment')
      .select('reviewerId')
      .eq('submissionId', assignment.submissionId)
      .neq('status', 'REASSIGNED')

    if (existingError) {
      return {
        success: false,
        error: 'Failed to get existing assignments',
        details: null
      }
    }

    // Get submission details to exclude the submission author
    const { data: submission, error: submissionError } = await supabase
      .from('Submission')
      .select('userId, url')
      .eq('id', assignment.submissionId)
      .single()

    if (submissionError || !submission) {
      return {
        success: false,
        error: 'Failed to get submission details',
        details: null
      }
    }

    const excludedReviewerIds = existingAssignments?.map((a: { reviewerId: string }) => a.reviewerId) || []
    // Add submission author to exclusion list to prevent self-review
    if (submission.userId) {
      excludedReviewerIds.push(submission.userId)
    }

    // Use the reviewer pool service directly to find a new reviewer
    const assignmentResult = await reviewerPoolService.assignReviewers(
      assignment.submissionId,
      submission.userId, // Pass actual submission author ID, not assignment.submissionId
      {
        excludeUserIds: excludedReviewerIds,
        minimumReviewers: 1,
        allowPartialAssignment: true
      }
    )

    if (!assignmentResult.success || assignmentResult.assignedReviewers.length === 0) {
      return {
        success: false,
        error: 'No eligible reviewer found',
        details: {
          excludedCount: excludedReviewerIds.length,
          error: assignmentResult.errors.join('; ') || 'Assignment failed'
        }
      }
    }

    const newReviewer = assignmentResult.assignedReviewers[0]

    // Update the old assignment to REASSIGNED
    const { error: updateError } = await supabase
      .from('ReviewAssignment')
      .update({
        status: 'REASSIGNED',
        updatedAt: new Date().toISOString()
      })
      .eq('id', assignmentId)

    if (updateError) {
      return {
        success: false,
        error: 'Failed to update original assignment',
        details: { updateError: updateError.message }
      }
    }

    // Update submission review count to exclude REASSIGNED assignments
    const { count: activeAssignments, error: countError } = await supabase
      .from('ReviewAssignment')
      .select('id', { count: 'exact', head: true })
      .eq('submissionId', assignment.submissionId)
      .neq('status', 'REASSIGNED')

    if (!countError && typeof activeAssignments === 'number') {
      await supabase
        .from('Submission')
        .update({ reviewCount: activeAssignments })
        .eq('id', assignment.submissionId)
    }

    // Notify the new reviewer about their assignment
    try {
      await notifyReviewAssigned(newReviewer.id, assignment.submissionId, submission.url)
      console.log(`📧 Notification sent to new reviewer ${newReviewer.id} for reshuffled assignment`)
    } catch (notifyError) {
      console.error(`Failed to notify new reviewer ${newReviewer.id}:`, notifyError)
      // Don't fail the reshuffle if notification fails
    }

    return {
      success: true,
      error: null,
      details: {
        oldReviewerId: assignment.reviewerId,
        newReviewerId: newReviewer.id,
        newReviewerName: newReviewer.username || newReviewer.email,
        wasOverdue: isOverdue,
        penaltyApplied,
        penaltyAmount: penaltyApplied ? MISSED_REVIEW_PENALTY : 0
      }
    }

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: null
    }
  }
}
