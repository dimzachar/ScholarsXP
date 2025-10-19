import { NextResponse } from 'next/server'

import { withPermission, type AuthenticatedRequest } from '@/lib/auth-middleware'
import {
  manualReshuffleAssignment,
  needsManualFollowUp,
  type ReshuffleFailureReason
} from '@/lib/reviewer-reshuffle'

interface RouteContext {
  params: {
    assignmentId: string
  }
}

export const POST = withPermission('admin_access')(async (
  request: AuthenticatedRequest,
  context: RouteContext
) => {
  const assignmentId = context?.params?.assignmentId

  if (!assignmentId) {
    return NextResponse.json(
      { message: 'Assignment ID is required' },
      { status: 400 }
    )
  }

  let body: { reason?: string; dryRun?: boolean } = {}

  try {
    body = await request.json()
  } catch (error) {
    // Ignore empty bodies
  }

  try {
    const result = await manualReshuffleAssignment(assignmentId, {
      reason: body.reason ?? 'manual:admin',
      dryRun: body.dryRun ?? false
    })

    if (result.success) {
      return NextResponse.json({
        success: true,
        dryRun: result.dryRun,
        releasedAssignment: result.releasedAssignment,
        newAssignment: result.newAssignment,
        candidateReviewerId: result.candidateReviewerId
      })
    }

    const reason: ReshuffleFailureReason | undefined = result.reason

    if (reason === 'no_replacement_available') {
      return NextResponse.json(
        {
          success: false,
          needsManualFollowUp: needsManualFollowUp(result),
          releasedAssignment: result.releasedAssignment
        },
        { status: 409 }
      )
    }

    if (reason === 'already_processed') {
      return NextResponse.json(
        {
          success: false,
          alreadyProcessed: true,
          releasedAssignment: result.releasedAssignment
        },
        { status: 409 }
      )
    }

    if (reason === 'not_found') {
      return NextResponse.json(
        { success: false, message: 'Assignment not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        message: result.message ?? 'Unexpected reshuffle error',
        reason
      },
      { status: 500 }
    )
  } catch (error) {
    console.error('Failed to reshuffle reviewer assignment:', error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error'
      },
      { status: 500 }
    )
  }
})
