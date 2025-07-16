import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'

interface RouteParams {
  params: {
    id: string
  }
}

export const PATCH = withPermission('review_content')(async (
  request: AuthenticatedRequest,
  { params }: RouteParams
) => {
  try {
    const { status, notes } = await request.json()
    const assignmentId = params.id
    const reviewerId = request.user.id

    if (!status) {
      return NextResponse.json(
        { message: 'Status is required' },
        { status: 400 }
      )
    }

    const validStatuses = ['IN_PROGRESS', 'COMPLETED', 'MISSED']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { message: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get the assignment and verify ownership
    const { data: assignment, error: fetchError } = await supabase
      .from('ReviewAssignment')
      .select(`
        *,
        submission:Submission(id, userId, status)
      `)
      .eq('id', assignmentId)
      .eq('reviewerId', reviewerId)
      .single()

    if (fetchError || !assignment) {
      return NextResponse.json(
        { message: 'Assignment not found or access denied' },
        { status: 404 }
      )
    }

    // Check if assignment can be updated
    if (assignment.status === 'COMPLETED') {
      return NextResponse.json(
        { message: 'Assignment is already completed' },
        { status: 400 }
      )
    }

    // Prepare update data
    const updateData: any = {
      status,
      updatedAt: new Date().toISOString()
    }

    // Set completion time if marking as completed
    if (status === 'COMPLETED') {
      updateData.completedAt = new Date().toISOString()
      
      // Check if completed late
      const deadline = new Date(assignment.deadline)
      const now = new Date()
      if (now > deadline) {
        updateData.isLate = true
      }
    }

    // Update the assignment
    const { data: updatedAssignment, error: updateError } = await supabase
      .from('ReviewAssignment')
      .update(updateData)
      .eq('id', assignmentId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating assignment:', updateError)
      return NextResponse.json(
        { message: 'Failed to update assignment status' },
        { status: 500 }
      )
    }

    // Handle status-specific logic
    if (status === 'COMPLETED') {
      // Check if this was the last pending review for the submission
      const { data: remainingAssignments } = await supabase
        .from('ReviewAssignment')
        .select('id')
        .eq('submissionId', assignment.submissionId)
        .in('status', ['PENDING', 'IN_PROGRESS'])

      if (!remainingAssignments || remainingAssignments.length === 0) {
        // All reviews completed, trigger consensus calculation
        // TODO: Implement consensus calculation
        console.log(`All reviews completed for submission ${assignment.submissionId}`)
      }

      // Award XP for completing review
      const xpReward = updateData.isLate ? 3 : 5 // Reduced XP for late reviews
      
      // TODO: Record XP transaction and update user XP
      // This would integrate with the XP analytics service

    } else if (status === 'MISSED') {
      // Apply penalty for missed review
      // TODO: Implement penalty system
      console.log(`Review missed by user ${reviewerId} for assignment ${assignmentId}`)
    }

    // TODO: Send notifications based on status change

    return NextResponse.json({
      message: 'Assignment status updated successfully',
      assignment: {
        id: updatedAssignment.id,
        status: updatedAssignment.status,
        completedAt: updatedAssignment.completedAt,
        isLate: updatedAssignment.isLate || false
      }
    })

  } catch (error) {
    console.error('Error updating assignment status:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})
