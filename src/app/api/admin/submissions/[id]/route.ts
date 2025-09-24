import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'
import { getOptimizedSubmissionDetails } from '@/lib/queries/admin-submissions-optimized'
import { getWeekNumber } from '@/lib/utils'

// Normalize incoming status labels to DB enum values
function normalizeStatus(input: string): 'PENDING' | 'AI_REVIEWED' | 'UNDER_PEER_REVIEW' | 'FINALIZED' | 'FLAGGED' | 'REJECTED' | 'LEGACY_IMPORTED' {
  const map: Record<string, string> = {
    COMPLETED: 'FINALIZED',
    COMPLETE: 'FINALIZED',
    DONE: 'FINALIZED',
    PEER_REVIEW: 'UNDER_PEER_REVIEW',
  }
  const allowed = new Set([
    'PENDING',
    'AI_REVIEWED',
    'UNDER_PEER_REVIEW',
    'FINALIZED',
    'FLAGGED',
    'REJECTED',
    'LEGACY_IMPORTED',
  ])
  const requested = String(input || '').toUpperCase()
  const normalized = (map[requested] || requested) as string
  return (allowed.has(normalized) ? normalized : 'FINALIZED') as any
}

export const PATCH = withPermission('admin_access')(async (request: AuthenticatedRequest, { params }: { params: { id: string } }) => {
  try {
    const { id } = params
    const body = await request.json().catch(() => ({})) as { action?: string; data?: any }

    if (!id) {
      return NextResponse.json({ error: 'Missing submission id' }, { status: 400 })
    }

    const action = body?.action || 'updateStatus'
    const data = body?.data || {}

    switch (action) {
      case 'updateStatus': {
        if (!data?.status) {
          return NextResponse.json({ error: 'Status is required' }, { status: 400 })
        }
        const newStatus = normalizeStatus(data.status)

        const updated = await prisma.submission.update({
          where: { id },
          data: { status: newStatus, updatedAt: new Date() },
        })

        // Best-effort audit log
        try {
          await prisma.adminAction.create({
            data: {
              adminId: request.user.id,
              action: 'SYSTEM_CONFIG',
              targetType: 'submission',
              targetId: id,
              details: { subAction: 'SUBMISSION_STATUS_CHANGE', newStatus, reason: data.reason || null },
            },
          })
        } catch {}

        // Invalidate related caches (best-effort, dynamic import to avoid edge SSR issues)
        try {
          const { QueryCache } = await import('@/lib/cache/query-cache')
          await Promise.all([
            QueryCache.invalidatePattern('admin_submissions:*'),
            QueryCache.invalidatePattern('admin_submission_count:*'),
            QueryCache.invalidatePattern('admin_submission_stats:*'),
            QueryCache.invalidatePattern('leaderboard:*'),
            QueryCache.invalidatePattern('analytics:*'),
          ])
        } catch {}

        return NextResponse.json({ success: true, data: { id: updated.id, status: updated.status } })
      }

      case 'updateXp': {
        if (typeof data?.xpAwarded !== 'number') {
          return NextResponse.json({ error: 'XP amount is required' }, { status: 400 })
        }

        const result = await prisma.$transaction(async (tx) => {
          const submission = await tx.submission.findUnique({ where: { id }, include: { user: true } })
          if (!submission) throw new Error('Submission not found')

          const newXp = data.xpAwarded as number
          const oldXp = submission.finalXp || 0
          const diff = newXp - oldXp

          await Promise.all([
            tx.submission.update({ where: { id }, data: { finalXp: newXp, status: 'FINALIZED' } }),
            tx.user.update({ where: { id: submission.userId }, data: { totalXp: { increment: diff }, currentWeekXp: { increment: diff } } }),
            tx.xpTransaction.create({
              data: {
                userId: submission.userId,
                amount: diff,
                type: 'ADMIN_ADJUSTMENT',
                sourceId: submission.id,
                description: `Admin XP adjustment: ${data.reason || 'Single update'}`,
                weekNumber: getWeekNumber(new Date()),
              },
            }),
          ])

          // Best-effort admin action audit
          try {
            await tx.adminAction.create({
              data: {
                adminId: request.user.id,
                action: 'XP_OVERRIDE',
                targetType: 'submission',
                targetId: submission.id,
                details: { oldXp, newXp, difference: diff, reason: data.reason || 'Single update' },
              },
            })
          } catch {}

          return { newXp, diff }
        })

        // Invalidate caches (best-effort)
        try {
          const { QueryCache } = await import('@/lib/cache/query-cache')
          await Promise.all([
            QueryCache.invalidatePattern('admin_submissions:*'),
            QueryCache.invalidatePattern('admin_submission_count:*'),
            QueryCache.invalidatePattern('admin_submission_stats:*'),
            QueryCache.invalidatePattern('leaderboard:*'),
            QueryCache.invalidatePattern('analytics:*'),
          ])
        } catch {}

        return NextResponse.json({ success: true, data: { id, xp: result.newXp, delta: result.diff } })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (error: any) {
    console.error('Admin submission [id] PATCH error:', error)
    return NextResponse.json({ error: error?.message || 'Failed to update submission' }, { status: 500 })
  }
})

export const GET = withPermission('admin_access')(async (_request: AuthenticatedRequest, { params }: { params: { id: string } }) => {
  try {
    const { id } = params
    if (!id) {
      return NextResponse.json({ error: 'Missing submission id' }, { status: 400 })
    }

    const { submission } = await getOptimizedSubmissionDetails(id)

    return NextResponse.json({ submission })
  } catch (error: any) {
    const message = error?.message || 'Failed to fetch submission'
    const status = message === 'Submission not found' ? 404 : 500
    console.error('Admin submission [id] GET error:', error)
    return NextResponse.json({ error: message }, { status })
  }
})
