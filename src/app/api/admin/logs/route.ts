import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import type { AdminActionType } from '@prisma/client'
import type { NormalizedLogRow } from '@/lib/audit-log'

function parseCSV(value: string | null | undefined): string[] | undefined {
  if (!value) return undefined
  return value.split(',').map((v) => v.trim()).filter(Boolean)
}

export const GET = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const url = new URL(request.url)
    const sp = url.searchParams

    const page = Math.max(parseInt(sp.get('page') || '1', 10), 1)
    const limitRaw = Math.max(parseInt(sp.get('limit') || '50', 10), 1)
    const limit = Math.min(limitRaw, 200)

    const eventTypes = parseCSV(sp.get('eventTypes')) || ['admin_action', 'submission', 'peer_review', 'xp_transaction']
    const actionTypes = parseCSV(sp.get('actionTypes')) as AdminActionType[] | undefined
    const targetTypes = parseCSV(sp.get('targetTypes'))
    const actorId = sp.get('actorId') || undefined
    const userId = sp.get('userId') || undefined // affected user
    const q = sp.get('q')?.toLowerCase() || ''
    const sortBy = (sp.get('sortBy') || 'createdAt') as 'createdAt' | 'action'
    const sortDir = (sp.get('sortDir') || 'desc') as 'asc' | 'desc'

    const dateFromStr = sp.get('dateFrom')
    const dateToStr = sp.get('dateTo')
    const dateFrom = dateFromStr ? new Date(dateFromStr) : undefined
    const dateTo = dateToStr ? new Date(dateToStr) : undefined

    // Fetch recent records per event type (we over-fetch to paginate after merge)
    const queries: Promise<NormalizedLogRow[]>[] = []

    // Admin Actions
    if (eventTypes.includes('admin_action')) {
      const where: Prisma.AdminActionWhereInput = {
        ...(actionTypes ? { action: { in: actionTypes } } : {}),
        ...(targetTypes ? { targetType: { in: targetTypes } } : {}),
        ...(actorId ? { adminId: actorId } : {}),
        ...(dateFrom || dateTo
          ? { createdAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
          : {}),
      }

      queries.push(
        prisma.adminAction
          .findMany({
            where,
            include: { admin: { select: { id: true, username: true, role: true } } },
            orderBy: { createdAt: 'desc' },
            take: limit * 3, // over-fetch for merging + pagination
          })
          .then((rows) =>
            rows.map<NormalizedLogRow>((row) => {
              const det: any = (row as any).details || {}
              const actionLabel = row.action === 'SYSTEM_CONFIG' && det?.subAction
                ? `SYSTEM_CONFIG:${det.subAction}`
                : row.action
              let summary = `${actionLabel} on ${row.targetType} ${row.targetId}`
              
              // Handle different review action types with specific summaries
              if (row.action === 'SYSTEM_CONFIG') {
                // Generate descriptive summaries based on targetId and details
                if (row.targetId === 'weekly' || det?.targetIdRaw === 'weekly') {
                  const parts: string[] = ['Weekly reset:']
                  if (det.usersProcessed !== undefined) parts.push(`${det.usersProcessed} users`)
                  if (det.streaksAwarded) parts.push(`${det.streaksAwarded} streaks`)
                  if (det.penaltiesApplied) parts.push(`${det.penaltiesApplied} penalties`)
                  if (det.missedReviewsFound) parts.push(`${det.missedReviewsFound} missed reviews`)
                  summary = parts.length > 1 ? parts.join(', ') : 'Weekly reset triggered'
                } else if (row.targetId === 'aggregate' || det?.targetIdRaw === 'aggregate') {
                  const total = det.totalProcessed ?? (det.submissionsProcessed || 0) + (det.stuckSubmissionsProcessed || 0)
                  summary = `XP aggregation: ${total} submission(s) processed`
                } else if (row.targetId === 'refresh' || det?.targetIdRaw === 'refresh') {
                  const areas = det.cacheAreasCleared?.join(', ') || 'all'
                  summary = `Cache refresh: ${areas}`
                } else if (row.targetId === 'monthly_winners' || det?.targetIdRaw === 'monthly_winners') {
                  summary = `Monthly winners bulk award${det.month ? ` (${det.month})` : ''}`
                } else if (row.targetType === 'user' && det?.action) {
                  // User status changes (deactivate/reactivate)
                  summary = `User ${det.action}d`
                } else if (det?.newStatus) {
                  summary = `Status -> ${det.newStatus}`
                } else if (det?.subAction) {
                  summary = `${det.subAction}`
                } else {
                  // Fallback: try to extract meaningful info from details
                  const detailKeys = Object.keys(det).filter(k => k !== 'targetIdRaw')
                  if (detailKeys.length > 0) {
                    summary = `Config update: ${detailKeys.slice(0, 3).join(', ')}${detailKeys.length > 3 ? '...' : ''}`
                  } else {
                    summary = `System config on ${row.targetType}`
                  }
                }
              } else if (row.action === 'REVIEW_REASSIGN' && det?.newReviewerId) {
                summary = `Review reassigned ${det.oldReviewerId} -> ${det.newReviewerId}`
              } else if (row.action === 'REVIEW_AUTO_ASSIGN' && det?.reviewerCount) {
                summary = `Auto-assigned ${det.reviewerCount} reviewer(s)`
              } else if (row.action === 'REVIEW_MANUAL_RESHUFFLE' && det?.reshuffledCount) {
                summary = `Manual reshuffle: ${det.reshuffledCount} assignment(s) reshuffled`
              } else if (row.action === 'REVIEW_BULK_RESHUFFLE' && det?.reshuffleResults) {
                const totalReshuffled = det.reshuffleResults.reduce((sum: number, r: any) => sum + (r.newAssignments || 0), 0)
                summary = `Bulk reshuffle: ${totalReshuffled} reviewer(s) assigned`
              } else if (row.action === 'REVIEW_DEADLINE_REASSIGN' && det?.reason) {
                summary = `Deadline reassignment: ${det.reason}`
              } else if (row.action === 'CONTENT_FLAG' && det?.subAction) {
                summary = `Flag ${det.subAction}`
              }
              
              return {
                id: `admin_action:${row.id}`,
                eventType: 'admin_action',
                action: actionLabel as any,
                actor: { id: row.adminId, name: (row as any).admin?.username, role: (row as any).admin?.role || 'ADMIN' },
                target: { type: row.targetType, id: row.targetId },
                details: row.details || undefined,
                createdAt: row.createdAt.toISOString(),
                summary,
              }
            })
          )
      )
    }

    // Submissions created
    if (eventTypes.includes('submission')) {
      const where: Prisma.SubmissionWhereInput = {
        ...(userId ? { userId } : {}),
        ...(dateFrom || dateTo
          ? { createdAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
          : {}),
        ...(q ? { OR: [{ url: { contains: q, mode: 'insensitive' } }, { platform: { contains: q, mode: 'insensitive' } }] } : {}),
      }

      queries.push(
        prisma.submission
          .findMany({
            where,
            include: { user: { select: { id: true, username: true, role: true } } },
            orderBy: { createdAt: 'desc' },
            take: limit * 3,
          })
          .then((rows) =>
            rows.map<NormalizedLogRow>((row) => ({
              id: `submission:${row.id}`,
              eventType: 'submission',
              action: 'SUBMISSION_CREATED',
              actor: { id: row.userId, name: row.user?.username, role: row.user?.role || 'USER' },
              target: { type: 'submission', id: row.id, label: row.title || row.url },
              details: { platform: row.platform, status: row.status, taskTypes: row.taskTypes },
              createdAt: row.createdAt.toISOString(),
              summary: `Submission created (${row.platform})`,
            }))
          )
      )
    }

    // Peer reviews submitted
    if (eventTypes.includes('peer_review')) {
      const where: Prisma.PeerReviewWhereInput = {
        ...(actorId ? { reviewerId: actorId } : {}),
        ...(dateFrom || dateTo
          ? { createdAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } }
          : {}),
      }

      queries.push(
        prisma.peerReview
          .findMany({
            where,
            include: { reviewer: { select: { id: true, username: true, role: true } } },
            orderBy: { createdAt: 'desc' },
            take: limit * 3,
          })
          .then((rows) =>
            rows.map<NormalizedLogRow>((row) => ({
              id: `peer_review:${row.id}`,
              eventType: 'peer_review',
              action: 'PEER_REVIEW_SUBMITTED',
              actor: { id: row.reviewerId, name: row.reviewer?.username, role: row.reviewer?.role || 'REVIEWER' },
              target: { type: 'submission', id: row.submissionId },
              details: { xpScore: row.xpScore, isLate: row.isLate, qualityRating: row.qualityRating },
              createdAt: row.createdAt.toISOString(),
              summary: `Peer review submitted (${row.xpScore} XP)`,
            }))
          )
      )
    }

    // XP transactions (admin adjustments and others)
    if (eventTypes.includes('xp_transaction')) {
      const userIdParam = userId || null
      const dateFromParam = dateFrom ? dateFrom.toISOString() : null
      const dateToParam = dateTo ? dateTo.toISOString() : null

      queries.push(
        prisma
          .$queryRaw<Array<{
            id: string
            userId: string
            amount: number
            type_text: string
            description: string | null
            sourceType: string | null
            sourceId: string | null
            createdAt: Date
            adminId: string | null
            username: string | null
            role: string | null
          }>>(Prisma.sql`
            SELECT t.id,
                   t."userId"      AS "userId",
                   t.amount        AS amount,
                   t.type::text    AS type_text,
                   t.description   AS description,
                   t."sourceType"  AS "sourceType",
                   t."sourceId"    AS "sourceId",
                   t."createdAt"   AS "createdAt",
                   t."adminId"     AS "adminId",
                   u.username      AS username,
                   u.role          AS role
            FROM "XpTransaction" t
            LEFT JOIN "User" u ON u.id = t."userId"
            WHERE (${userIdParam}::uuid IS NULL OR t."userId" = ${userIdParam}::uuid)
              AND (${dateFromParam}::timestamptz IS NULL OR t."createdAt" >= ${dateFromParam}::timestamptz)
              AND (${dateToParam}::timestamptz IS NULL OR t."createdAt" <= ${dateToParam}::timestamptz)
            ORDER BY t."createdAt" DESC
            LIMIT ${limit * 3}
          `)
          .then((rows) =>
            rows.map<NormalizedLogRow>((row) => ({
              id: `xp_tx:${row.id}`,
              eventType: 'xp_transaction',
              action: `XP_${row.type_text}`,
              actor: row.adminId ? { id: row.adminId } : undefined,
              target: { type: 'user', id: row.userId, label: row.username },
              details: { amount: row.amount, description: row.description, sourceType: row.sourceType, sourceId: row.sourceId },
              createdAt: new Date(row.createdAt).toISOString(),
              summary: `XP ${row.type_text} (${row.amount >= 0 ? '+' : ''}${row.amount})`,
            }))
          )
      )
    }

    const results = (await Promise.all(queries)).flat()

    // Basic text filter across summary/target label/action
    const filtered = q
      ? results.filter((r) =>
          [r.summary, r.action, r.target?.label]
            .filter(Boolean)
            .some((s) => String(s).toLowerCase().includes(q))
        )
      : results

    // Sort
    const sorted = filtered.sort((a, b) => {
      if (sortBy === 'action') {
        const cmp = a.action.localeCompare(b.action)
        return sortDir === 'asc' ? cmp : -cmp
      }
      // createdAt
      const at = new Date(a.createdAt).getTime()
      const bt = new Date(b.createdAt).getTime()
      return sortDir === 'asc' ? at - bt : bt - at
    })

    // Pagination after merge
    const start = (page - 1) * limit
    const end = start + limit
    const pageItems = sorted.slice(start, end)

    return NextResponse.json({
      items: pageItems,
      page,
      limit,
      total: sorted.length,
      totalPages: Math.max(1, Math.ceil(sorted.length / limit)),
      hasNextPage: end < sorted.length,
      hasPrevPage: start > 0,
      applied: { eventTypes, actionTypes, targetTypes, actorId, userId, sortBy, sortDir, dateFrom: dateFromStr, dateTo: dateToStr, q },
    })
  } catch (err) {
    console.error('[admin/logs] error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
