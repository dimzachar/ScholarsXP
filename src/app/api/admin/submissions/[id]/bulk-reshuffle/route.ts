import { NextResponse } from 'next/server'

import { withPermission, type AuthenticatedRequest } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase-server'
import { reviewerPoolService } from '@/lib/reviewer-pool'
import { logAdminAction } from '@/lib/audit-log'
import { xpAnalyticsService } from '@/lib/xp-analytics'

const MISSED_REVIEW_PENALTY = -10

interface RouteContext {
  params: {
    id: string
  }
}

interface AssignmentData {
  id: string
  reviewerId: string
  status: string
  assignedAt: string
  reviewer: Array<{
    username: string
  }>
}

async function reshuffleSingleAssignment(supabase: any, assignmentId: string, reason: string) {
  try {
    // Get current assignment details
    const { data: assignment, error: fetchError } = await supabase
      .from('ReviewAssignment')
      .select('*')
      .eq('id', assignmentId)
      .single()

    if (fetchError || !assignment) {
      return {
        success: false,
        error: fetchError?.message || 'Assignment not found',
        details: null
      }
    }

    // Only reshuffle PENDING, IN_PROGRESS, or MISSED assignments
    if (assignment.status !== 'PENDING' && assignment.status !== 'IN_PROGRESS' && assignment.status !== 'MISSED') {
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
        // Increment missed reviews counter
        await supabase
          .from('User')
          .update({
            missedReviews: supabase.sql`COALESCE("missedReviews", 0) + 1`
          })
          .eq('id', assignment.reviewerId)

        // Record penalty XP transaction
        await xpAnalyticsService.recordXpTransaction(
          assignment.reviewerId,
          MISSED_REVIEW_PENALTY,
          'PENALTY',
          `Missed review deadline for submission ${assignment.submissionId} (bulk reshuffled)`,
          assignment.submissionId
        )

        penaltyApplied = true
        console.log(`⚠️ Penalty applied to reviewer ${assignment.reviewerId} for overdue assignment ${assignmentId}`)
      } catch (penaltyError) {
        console.error(`Failed to apply penalty for assignment ${assignmentId}:`, penaltyError)
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

    const excludedReviewerIds = existingAssignments?.map((a: { reviewerId: string }) => a.reviewerId) || []

    // Use the reviewer pool service directly to find a new reviewer
    const assignmentResult = await reviewerPoolService.assignReviewers(
      assignment.submissionId,
      assignment.submissionId,
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

  let body: { reason?: string; dryRun?: boolean } = {}

  try {
    body = await request.json()
  } catch (error) {
    // Ignore empty bodies
  }

  const reason = body.reason ?? 'manual:admin'
  const dryRun = body.dryRun ?? false

  try {
    const supabase = createServiceClient()

    // Find all assignments that can be reshuffled (PENDING, IN_PROGRESS, or MISSED with no completion)
    const { data: assignmentsToReshuffle, error: fetchError } = await supabase
      .from('ReviewAssignment')
      .select('id, reviewerId, status, assignedAt, reviewer:User(username)')
      .eq('submissionId', submissionId)
      .in('status', ['PENDING', 'IN_PROGRESS', 'MISSED'])
      .is('completedAt', null)

    if (fetchError) {
      console.error('Failed to fetch assignments to reshuffle:', fetchError)
      return NextResponse.json(
        { message: 'Failed to fetch assignments' },
        { status: 500 }
      )
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
    for (const assignment of assignmentsToReshuffle) {
      try {
        const result = await reshuffleSingleAssignment(supabase, assignment.id, reason)
        
        console.log(`Bulk reshuffle result for assignment ${assignment.id}:`, result)
        
        results.push({
          assignmentId: assignment.id,
          reviewerId: assignment.reviewerId,
          reviewerName: assignment.reviewer?.[0]?.username || 'Unknown',
          success: result.success,
          error: result.error,
          details: result.details
        })

        if (result.success) {
          reshuffledCount++
        }
      } catch (assignmentError) {
        console.error(`Failed to reshuffle assignment ${assignment.id}:`, assignmentError)
        results.push({
          assignmentId: assignment.id,
          reviewerId: assignment.reviewerId,
          reviewerName: assignment.reviewer?.[0]?.username || 'Unknown',
          success: false,
          error: assignmentError instanceof Error ? assignmentError.message : 'Unknown error',
          details: null
        })
      }
    }

    // Log admin action for bulk reshuffle
    if (!dryRun && reshuffledCount > 0) {
      await logAdminAction({
        adminId: request.user.id,
        action: 'REVIEW_BULK_RESHUFFLE',
        targetType: 'submission',
        targetId: submissionId,
        details: {
          subAction: 'BULK_RESHUFFLE_SUBMISSION',
          assignmentIds: assignmentsToReshuffle.map(a => a.id),
          reshuffledCount,
          totalProcessed: assignmentsToReshuffle.length,
          reason: reason,
          assignmentResults: results,
          timestamp: new Date().toISOString()
        }
      })

      // Also log to AutomationLog for legacy compatibility
      await supabase.from('AutomationLog').insert({
        jobName: 'bulk-reshuffle-admin',
        jobType: 'reshuffle',
        triggeredBy: `admin:${request.user.id}`,
        status: 'SUCCESS',
        result: {
          submissionId,
          reshuffledCount,
          totalProcessed: assignmentsToReshuffle.length,
          reason,
          results: results.map(r => ({
            assignmentId: r.assignmentId,
            success: r.success,
            reviewerName: r.reviewerName
          }))
        }
      })
    }

    return NextResponse.json({
      success: true,
      message: dryRun 
        ? `Bulk reshuffle dry-run completed. Would reshuffle ${assignmentsToReshuffle.length} assignments.`
        : `Successfully processed ${assignmentsToReshuffle.length} assignments, reshuffled ${reshuffledCount}.`,
      dryRun,
      submissionId,
      totalProcessed: assignmentsToReshuffle.length,
      reshuffledCount,
      assignments: results
    })

  } catch (error) {
    console.error('Failed to perform bulk reshuffle:', error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
})
