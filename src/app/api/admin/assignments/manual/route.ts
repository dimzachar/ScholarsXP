import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { reviewerPoolService } from '@/lib/reviewer-pool'
import { prisma } from '@/lib/prisma'
import { notifyReviewAssigned } from '@/lib/notifications'

export const POST = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const { submissionId, reviewerIds } = await request.json()

    if (!submissionId || !reviewerIds || !Array.isArray(reviewerIds)) {
      return NextResponse.json(
        { message: 'Submission ID and reviewer IDs array are required' },
        { status: 400 }
      )
    }

    if (reviewerIds.length === 0 || reviewerIds.length > 5) {
      return NextResponse.json(
        { message: 'Must assign between 1 and 5 reviewers' },
        { status: 400 }
      )
    }

    // Get submission details
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: submission, error: submissionError } = await supabase
      .from('Submission')
      .select('userId, status, url')
      .eq('id', submissionId)
      .single()

    if (submissionError || !submission) {
      return NextResponse.json(
        { message: 'Submission not found' },
        { status: 404 }
      )
    }

    // Validate each reviewer
    const validationResults = await Promise.all(
      reviewerIds.map(async (reviewerId: string) => {
        const result = await reviewerPoolService.canAssignReviewer(
          reviewerId,
          submission.userId
        )
        return { reviewerId, ...result }
      })
    )

    const invalidReviewers = validationResults.filter(result => !result.canAssign)
    if (invalidReviewers.length > 0) {
      return NextResponse.json(
        { 
          message: 'Some reviewers cannot be assigned',
          invalidReviewers: invalidReviewers.map(r => ({
            reviewerId: r.reviewerId,
            reason: r.reason
          }))
        },
        { status: 400 }
      )
    }

    // Check for existing assignments
    const { data: existingAssignments } = await supabase
      .from('ReviewAssignment')
      .select('reviewerId')
      .eq('submissionId', submissionId)

    const existingReviewerIds = existingAssignments?.map(a => a.reviewerId) || []
    const newReviewerIds = reviewerIds.filter((id: string) => !existingReviewerIds.includes(id))

    if (newReviewerIds.length === 0) {
      return NextResponse.json(
        { message: 'All specified reviewers are already assigned to this submission' },
        { status: 400 }
      )
    }

    // Calculate deadline (72 hours from now, excluding weekends)
    const deadline = new Date()
    deadline.setHours(deadline.getHours() + 72)
    
    // If deadline falls on weekend, extend to Monday
    const dayOfWeek = deadline.getDay()
    if (dayOfWeek === 0) { // Sunday
      deadline.setDate(deadline.getDate() + 1) // Move to Monday
    } else if (dayOfWeek === 6) { // Saturday
      deadline.setDate(deadline.getDate() + 2) // Move to Monday
    }

    // Create assignments for new reviewers
    const assignments = newReviewerIds.map((reviewerId: string) => ({
      submissionId,
      reviewerId,
      deadline: deadline.toISOString(),
      status: 'PENDING',
      assignedAt: new Date().toISOString()
    }))

    const { data: createdAssignments, error: assignmentError } = await supabase
      .from('ReviewAssignment')
      .insert(assignments)
      .select(`
        *,
        reviewer:User(id, username, email, totalXp)
      `)

    if (assignmentError) {
      return NextResponse.json(
        { message: `Failed to create assignments: ${assignmentError.message}` },
        { status: 500 }
      )
    }

    // Update submission status and review count
    const totalReviewers = existingReviewerIds.length + newReviewerIds.length
    const { error: submissionUpdateError } = await supabase
      .from('Submission')
      .update({
        status: 'UNDER_PEER_REVIEW',
        reviewDeadline: deadline.toISOString(),
        reviewCount: totalReviewers
      })
      .eq('id', submissionId)

    if (submissionUpdateError) {
      console.error('Failed to update submission:', submissionUpdateError)
    }

    // Send notifications to newly assigned reviewers
    if (createdAssignments && submission.url) {
      const notificationResults = await Promise.allSettled(
        createdAssignments.map(async assignment => {
          await notifyReviewAssigned(
            assignment.reviewerId,
            submissionId,
            submission.url
          )
        })
      )

      notificationResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          const assignment = createdAssignments[index]
          console.error(
            `Failed to notify reviewer ${assignment.reviewerId} about assignment ${assignment.id}:`,
            result.reason
          )
        }
      })
    }

    // Best-effort admin action log for manual assignments
    try {
      await prisma.adminAction.create({
        data: {
          adminId: request.user.id,
          action: 'REVIEW_REASSIGN',
          targetType: 'submission',
          targetId: submissionId,
          details: {
            subAction: 'REVIEW_ASSIGN',
            reviewersAssigned: newReviewerIds,
            totalReviewers,
          }
        }
      })
    } catch (e) {
      console.warn('Manual assignment audit log failed:', e)
    }

    return NextResponse.json({
      message: `Successfully assigned ${newReviewerIds.length} new reviewers`,
      newAssignments: createdAssignments?.map(assignment => ({
        id: assignment.id,
        reviewerId: assignment.reviewerId,
        reviewer: assignment.reviewer,
        deadline: assignment.deadline
      })),
      totalReviewers,
      skippedReviewers: reviewerIds.length - newReviewerIds.length
    })

  } catch (error) {
    console.error('Error in manual assignment:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})
