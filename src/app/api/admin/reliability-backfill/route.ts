import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { backfillHistory } from '@/lib/reliability/snapshot-service'

/**
 * POST /api/admin/reliability-backfill
 * Triggers historical backfill of reliability snapshots for all reviewers.
 * Computes weekly reliability scores going back to each reviewer's first review.
 */
export const POST = withPermission('admin_access')(
  async (request: AuthenticatedRequest) => {
    try {
      const body = await request.json().catch(() => ({}))
      const weeksBack = typeof body.weeksBack === 'number' ? body.weeksBack : 12

      const result = await backfillHistory(weeksBack)

      return NextResponse.json({
        success: true,
        snapshotsCreated: result.snapshotsCreated,
        reviewersProcessed: result.reviewersProcessed,
        errors: result.errors.length > 0 ? result.errors : undefined,
        message: `Backfilled ${result.snapshotsCreated} snapshots across ${result.reviewersProcessed} reviewers`,
      })
    } catch (error) {
      console.error('[ReliabilityBackfill] Error:', error)
      return NextResponse.json(
        { error: 'Failed to backfill reliability history' },
        { status: 500 }
      )
    }
  }
)
