import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { reliabilityService } from './reliability-service'
import { RELIABILITY_CONFIG } from '@/config/reliability'
import { REVIEWER_ROLES } from '@/lib/roles'

export interface ReliabilitySnapshotData {
  id: string
  userId: string
  username: string | null
  score: number
  formulaId: string
  delta: number | null
  source: string
  snapshotDate: Date
}

export interface AggregateDay {
  date: string
  avgScore: number
  minScore: number
  maxScore: number
  reviewerCount: number
}

export interface HistoryResult {
  snapshots: ReliabilitySnapshotData[]
  aggregate: AggregateDay[]
  total: number
}

/**
 * Take a reliability snapshot for a single reviewer.
 * Computes delta from the reviewer's previous snapshot.
 */
export async function takeSnapshot(
  userId: string,
  source: string = 'unknown'
): Promise<ReliabilitySnapshotData | null> {
  try {
    const scores = await reliabilityService.getReliabilityScores([userId])
    const result = scores.get(userId)
    if (!result) return null

    const formulaId = RELIABILITY_CONFIG.ACTIVE_FORMULA
    const score = result.score

    // Get the previous snapshot to compute delta
    const prev = await prisma.reliabilitySnapshot.findFirst({
      where: { userId },
      orderBy: { snapshotDate: 'desc' },
      select: { score: true },
    })

    const delta = prev !== null ? +(score - prev.score).toFixed(4) : null

    const snapshot = await prisma.reliabilitySnapshot.create({
      data: {
        userId,
        score,
        formulaId,
        metrics: JSON.parse(JSON.stringify(result.metrics)),
        delta,
        source,
      },
    })

    return {
      id: snapshot.id,
      userId: snapshot.userId,
      username: result.metrics.username,
      score: snapshot.score,
      formulaId: snapshot.formulaId,
      delta: snapshot.delta,
      source: snapshot.source,
      snapshotDate: snapshot.snapshotDate,
    }
  } catch (error) {
    console.error(`[SnapshotService] Failed to take snapshot for user ${userId}:`, error)
    return null
  }
}

/**
 * Take reliability snapshots for all reviewers.
 * Finds all users who have reviewer-role privileges.
 */
export async function takeAllSnapshots(
  source: string = 'daily_cron'
): Promise<{ snapshotsCreated: number; errors: string[] }> {
  const errors: string[] = []
  let snapshotsCreated = 0

  try {
    const reviewers = await prisma.user.findMany({
      where: {
        role: { in: REVIEWER_ROLES },
        peerReviews: { some: {} },
      },
      select: { id: true, username: true },
    })

    for (const reviewer of reviewers) {
      const snapshot = await takeSnapshot(reviewer.id, source)
      if (snapshot) {
        snapshotsCreated++
      } else {
        errors.push(`No data for ${reviewer.username || reviewer.id}`)
      }
    }
  } catch (error) {
    console.error('[SnapshotService] takeAllSnapshots failed:', error)
    errors.push(`Fatal: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  return { snapshotsCreated, errors }
}

/**
 * Get reliability history for a specific reviewer.
 */
export async function getReviewerHistory(
  userId: string,
  days: number = 30
): Promise<ReliabilitySnapshotData[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const rows = await prisma.reliabilitySnapshot.findMany({
    where: {
      userId,
      snapshotDate: { gte: since },
    },
    orderBy: { snapshotDate: 'desc' },
    select: {
      id: true,
      userId: true,
      score: true,
      formulaId: true,
      delta: true,
      source: true,
      snapshotDate: true,
    },
  })

  // Fetch usernames in batch
  const userIds = [...new Set(rows.map((r) => r.userId))]
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      })
    : []
  const userMap = new Map(users.map((u) => [u.id, u.username]))

  return rows.map((r) => ({
    ...r,
    username: userMap.get(r.userId) ?? null,
  }))
}

/**
 * Get aggregate reliability history (daily average across all reviewers).
 */
export async function getAggregateHistory(
  days: number = 30
): Promise<AggregateDay[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  // Raw aggregate using Prisma groupBy
  const groups = await prisma.reliabilitySnapshot.groupBy({
    by: ['snapshotDate'],
    where: { snapshotDate: { gte: since } },
    _avg: { score: true },
    _min: { score: true },
    _max: { score: true },
    _count: { id: true },
    orderBy: { snapshotDate: 'asc' },
  })

  return groups.map((g) => ({
    date: g.snapshotDate.toISOString().slice(0, 10),
    avgScore: +(g._avg.score ?? 0).toFixed(4),
    minScore: +(g._min.score ?? 0).toFixed(4),
    maxScore: +(g._max.score ?? 0).toFixed(4),
    reviewerCount: g._count.id,
  }))
}

/**
 * Get paginated reliability history with optional user filter.
 */
export async function getHistory(
  options: {
    days?: number
    userId?: string
    limit?: number
    offset?: number
  } = {}
): Promise<HistoryResult> {
  const { days = 30, userId, limit = 50, offset = 0 } = options
  const since = new Date()
  since.setDate(since.getDate() - days)

  const where: Prisma.ReliabilitySnapshotWhereInput = {
    snapshotDate: { gte: since },
  }
  if (userId) where.userId = userId

  const [rows, total, aggregate] = await Promise.all([
    prisma.reliabilitySnapshot.findMany({
      where,
      orderBy: { snapshotDate: 'desc' },
      skip: offset,
      take: limit,
      select: {
        id: true,
        userId: true,
        score: true,
        formulaId: true,
        delta: true,
        source: true,
        snapshotDate: true,
      },
    }),
    prisma.reliabilitySnapshot.count({ where }),
    getAggregateHistory(days),
  ])

  // Batch fetch usernames
  const userIds = [...new Set(rows.map((r) => r.userId))]
  const users = userIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true },
      })
    : []
  const userMap = new Map(users.map((u) => [u.id, u.username]))

  const snapshots = rows.map((r) => ({
    ...r,
    username: userMap.get(r.userId) ?? null,
  }))

  return { snapshots, aggregate, total }
}

/**
 * Take a reliability snapshot asynchronously (fire-and-forget).
 * Safe to call from event handlers without awaiting.
 */
export function takeSnapshotAsync(userId: string, source: string): void {
  void takeSnapshot(userId, source).catch((err) =>
    console.error('[SnapshotService] async snapshot failed:', err)
  )
}

/**
 * Backfill historical reliability snapshots for all reviewers.
 * Steps through weekly intervals from each reviewer's first review to now,
 * computing what their reliability score would have been at each point.
 * Skips dates that already have a snapshot for that user.
 */
export async function backfillHistory(
  weeksBack: number = 12
): Promise<{ snapshotsCreated: number; errors: string[]; reviewersProcessed: number }> {
  const errors: string[] = []
  let snapshotsCreated = 0
  let reviewersProcessed = 0

  try {
    const reviewers = await prisma.user.findMany({
      where: {
        role: { in: REVIEWER_ROLES },
        peerReviews: { some: {} },
      },
      select: { id: true, username: true },
    })

    const now = new Date()

    for (const reviewer of reviewers) {
      try {
        // Find earliest peer review date
        const earliestReview = await prisma.peerReview.findFirst({
          where: { reviewerId: reviewer.id },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        })

        if (!earliestReview) continue

        reviewersProcessed++

        // Get existing snapshot dates for this user (to avoid duplicates)
        const existingDates = await prisma.reliabilitySnapshot.findMany({
          where: { userId: reviewer.id },
          select: { snapshotDate: true },
        })
        const existingDateSet = new Set(
          existingDates.map(d => d.snapshotDate.toISOString().slice(0, 10))
        )

        // Step through weekly intervals
        const interval = 7 * 24 * 60 * 60 * 1000 // 7 days in ms
        let cursor = new Date(earliestReview.createdAt)
        // Align to start of week for cleaner buckets
        cursor.setDate(cursor.getDate() - cursor.getDay())
        cursor.setHours(0, 0, 0, 0)

        while (cursor < now) {
          const dateKey = cursor.toISOString().slice(0, 10)

          // Skip if we already have a snapshot for this date
          if (!existingDateSet.has(dateKey)) {
            const asOf = new Date(cursor)
            asOf.setDate(asOf.getDate() + 6) // End of week
            asOf.setHours(23, 59, 59, 999)

            const scores = await reliabilityService.getReliabilityScores([reviewer.id], asOf)
            const result = scores.get(reviewer.id)

            if (result) {
              const formulaId = RELIABILITY_CONFIG.ACTIVE_FORMULA
              const score = result.score

              // Get previous snapshot for delta computation
              const prev = await prisma.reliabilitySnapshot.findFirst({
                where: { userId: reviewer.id, snapshotDate: { lt: cursor } },
                orderBy: { snapshotDate: 'desc' },
                select: { score: true },
              })

              const delta = prev !== null ? +(score - prev.score).toFixed(4) : null

              await prisma.reliabilitySnapshot.create({
                data: {
                  userId: reviewer.id,
                  score,
                  formulaId,
                  metrics: JSON.parse(JSON.stringify(result.metrics)),
                  delta,
                  source: 'backfill',
                  snapshotDate: cursor,
                },
              })

              snapshotsCreated++
            }
          }

          cursor = new Date(cursor.getTime() + interval)
        }

        // Also take a current snapshot
        const currentSnap = await takeSnapshot(reviewer.id, 'backfill')
        if (currentSnap) snapshotsCreated++
      } catch (err) {
        errors.push(`Error backfilling ${reviewer.username || reviewer.id}: ${err}`)
      }
    }
  } catch (error) {
    console.error('[SnapshotService] backfillHistory failed:', error)
    errors.push(`Fatal: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  return { snapshotsCreated, errors, reviewersProcessed }
}
