import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { bulkUpdateSubmissions } from '@/lib/queries/admin-submissions-optimized'
import { prisma } from '@/lib/prisma'
import { logAdminAction } from '@/lib/audit-log'

/**
 * API endpoint for bulk reshuffling missed reviewers
 * This endpoint handles reshuffling of missed/inactive reviewers across multiple submissions
 */
const handler = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    console.log('🔄 Bulk reshuffle API called by user:', request.userProfile?.email, 'role:', request.userProfile?.role)

    const body = await request.json()
    const { submissionIds, reason } = body

    // Validate reason
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return NextResponse.json(
        { error: 'reason is required and must be at least 5 characters long' },
        { status: 400 }
      )
    }

    let targetSubmissionIds: string[]

    // If submissionIds provided, use them; otherwise get all submissions under peer review
    if (submissionIds && Array.isArray(submissionIds) && submissionIds.length > 0) {
      targetSubmissionIds = submissionIds
    } else {
      // Get all submissions under peer review status
      const submissions = await prisma.submission.findMany({
        where: { status: 'UNDER_PEER_REVIEW' },
        select: { id: true }
      })
      targetSubmissionIds = submissions.map(s => s.id)
    }

    if (targetSubmissionIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No submissions found under peer review status',
        count: 0,
        data: {
          totalMissedReviewers: 0,
          reshuffleResults: []
        }
      })
    }

    // Call the bulk update function with reshuffle action
    const result = await bulkUpdateSubmissions(
      targetSubmissionIds,
      'bulkReshuffle',
      { reason: reason.trim() },
      request.user.id
    )

    if (result.success) {
      // Log admin action for bulk reshuffle
      await logAdminAction({
        adminId: request.user.id,
        action: 'REVIEW_BULK_RESHUFFLE',
        targetType: 'system',
        targetId: '00000000-0000-0000-0000-000000000000',
        details: {
          subAction: 'BULK_RESHUFFLE_API',
          submissionsProcessed: result.count,
          totalMissedReviewers: result.totalMissedReviewers,
          reason: reason.trim(),
          submissionIds: targetSubmissionIds,
          reshuffleResults: result.reshuffleResults
        }
      })

      return NextResponse.json({
        success: true,
        message: result.message,
        count: result.count,
        data: {
          totalMissedReviewers: result.totalMissedReviewers,
          reshuffleResults: result.reshuffleResults
        }
      })
    } else {
      return NextResponse.json(
        { error: result.message },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('Bulk reshuffle API error:', error)
    return NextResponse.json(
      { error: 'Failed to perform bulk reshuffle' },
      { status: 500 }
    )
  }
})

export { handler as POST }
