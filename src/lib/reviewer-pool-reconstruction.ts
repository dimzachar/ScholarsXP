/**
 * Shared historical pool reconstruction.
 *
 * Used by both:
 * - reviewer-selection-debug.ts   (single-submission selection replay)
 * - reviewer-fairness-simulator.ts (batch simulation across all algorithms)
 *
 * Reconstructs the exact eligible reviewer pool and priority ranking
 * as it existed at a given point in time.
 */

import { prisma } from '@/lib/prisma'
import { REVIEWER_ROLES, isAdmin } from '@/lib/roles'
import { compareReviewerPriorityValues } from '@/lib/reviewer-ranking'
import { RELIABILITY_CONFIG } from '@/config/reliability'
import { calculateScore, getFormula } from '@/lib/reliability/formulas'
import type { ReviewerMetrics } from '@/lib/reliability/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReconstructedCandidate {
  id: string
  username: string
  email: string
  role: string
  totalXp: number
  reliabilityScore: number
  activeAssignments: number
  missedReviews: number
  hasPenalties: boolean
  reviewPausedUntil: Date | null
  reviewPausedPermanently: boolean
  isEligible: boolean
  exclusionReasons: string[]
  priority: number | null
}

export interface ReconstructedPool {
  asOf: Date
  candidates: ReconstructedCandidate[]
  eligibleCount: number
  totalCount: number
}

// ---------------------------------------------------------------------------
// Configuration (mirrors reviewer-pool.ts)
// ---------------------------------------------------------------------------

const MIN_REVIEWER_XP = 50
const MAX_ACTIVE_ASSIGNMENTS = 5
const FAIRNESS_RELIABILITY_FLOOR = 0.5

// ---------------------------------------------------------------------------
// Raw query types
// ---------------------------------------------------------------------------

type HistoricalAssignmentCount = {
  reviewerId: string
  activeAssignments: number
}

type HistoricalReviewAggregate = {
  reviewerId: string
  totalReviews: number
  lateReviews: number
  avgQualityRating: number | null
}

type HistoricalPenaltyRow = {
  userId: string
  penaltyCount: number
}

type RecentPenaltyTimestampRow = {
  userId: string
  lastPenaltyAt: Date
}

type RecentAssignmentRow = {
  reviewerId: string
  recentCount: number
}

// ---------------------------------------------------------------------------
// Historical active-assignment count
// ---------------------------------------------------------------------------

export async function getHistoricalActiveAssignmentCounts(
  reviewerIds: string[],
  targetTime: Date
): Promise<Map<string, number>> {
  if (reviewerIds.length === 0) return new Map()

  const rows = await prisma.$queryRaw<HistoricalAssignmentCount[]>`
    SELECT
      "reviewerId",
      COUNT(*)::int AS "activeAssignments"
    FROM "ReviewAssignment"
    WHERE "reviewerId" = ANY(${reviewerIds}::uuid[])
      AND "assignedAt" < ${targetTime}
      AND ("completedAt" IS NULL OR "completedAt" > ${targetTime})
      AND NOT ("status" = 'REASSIGNED' AND "updatedAt" <= ${targetTime})
    GROUP BY "reviewerId"
  `

  return new Map(rows.map(row => [row.reviewerId, row.activeAssignments]))
}

// ---------------------------------------------------------------------------
// Historical recent-assignment count (last 30 days before targetTime)
// ---------------------------------------------------------------------------

export async function getHistoricalRecentAssignmentCounts(
  reviewerIds: string[],
  targetTime: Date,
  windowDays = 30
): Promise<Map<string, number>> {
  if (reviewerIds.length === 0) return new Map()

  try {
    // Matches the codebase convention (getTime() - N * 24h in ms) used across
    // analytics, reviewer-dashboard, admin stats, etc. Fixed-duration UTC math —
    // not DST-aware, but consistent with every other "N days ago" calculation.
    const windowStart = new Date(targetTime.getTime() - windowDays * 24 * 60 * 60 * 1000)

    const rows = await prisma.$queryRaw<RecentAssignmentRow[]>`
      SELECT
        "reviewerId",
        COUNT(*)::int AS "recentCount"
      FROM "ReviewAssignment"
      WHERE "reviewerId" = ANY(${reviewerIds}::uuid[])
        AND "assignedAt" >= ${windowStart}
        AND "assignedAt" < ${targetTime}
      GROUP BY "reviewerId"
    `

    return new Map(rows.map(row => [row.reviewerId, row.recentCount]))
  } catch (error) {
    console.error('[ReviewerPool] Failed to fetch recent assignment counts:', error)
    return new Map()
  }
}

// ---------------------------------------------------------------------------
// Historical reliability scores
// ---------------------------------------------------------------------------

function buildMetricsFromHistory(
  aggregate: HistoricalReviewAggregate | undefined,
  reviewerId: string
): ReviewerMetrics {
  const totalReviews = aggregate?.totalReviews ?? 0
  const lateReviews = aggregate?.lateReviews ?? 0
  const avgQualityRating = aggregate?.avgQualityRating ?? 0
  const onTimeRate = totalReviews > 0 ? 1 - lateReviews / totalReviews : 0.5
  const normalizedQuality = avgQualityRating > 0 ? (avgQualityRating - 1) / 4 : 0.4

  return {
    id: reviewerId,
    username: reviewerId,
    email: '',
    totalReviews,
    lateReviews,
    missedReviews: 0,
    streakWeeks: 0,
    votesValidated: 0,
    votesInvalidated: 0,
    timeliness: onTimeRate,
    quality: normalizedQuality,
    accuracy: 0.5,
    voteValidation: 0.5,
    experience: Math.min(1, totalReviews / 50),
    missedPenalty: 1,
    penaltyScore: 1,
    reviewVariance: 0.75,
    latePercentage: onTimeRate,
    extremeMissCount: 0,
    extremeMissRate: 0,
    avgDeviation: 0,
    avgQualityRating
  }
}

export async function getHistoricalReliabilityScores(
  reviewerIds: string[],
  targetTime: Date,
  formulaId?: string
): Promise<Map<string, number>> {
  if (reviewerIds.length === 0) return new Map()

  const formula = getFormula(formulaId ?? RELIABILITY_CONFIG.ACTIVE_FORMULA)

  const aggregates = await prisma.$queryRaw<HistoricalReviewAggregate[]>`
    SELECT
      "reviewerId",
      COUNT(*)::int AS "totalReviews",
      COUNT(*) FILTER (WHERE "isLate" = true)::int AS "lateReviews",
      AVG("qualityRating") AS "avgQualityRating"
    FROM "PeerReview"
    WHERE "reviewerId" = ANY(${reviewerIds}::uuid[])
      AND "createdAt" <= ${targetTime}
    GROUP BY "reviewerId"
  `

  const aggregateMap = new Map(aggregates.map(item => [item.reviewerId, item]))
  const scores = new Map<string, number>()

  for (const reviewerId of reviewerIds) {
    const metrics = buildMetricsFromHistory(aggregateMap.get(reviewerId), reviewerId)
    scores.set(
      reviewerId,
      calculateScore(metrics, formula.weights, formula.defaultValues)
    )
  }

  return scores
}

// ---------------------------------------------------------------------------
// Historical penalty check (for O5 proven-bad filter)
// ---------------------------------------------------------------------------

export async function getHistoricalPenaltyCheck(
  reviewerIds: string[],
  targetTime: Date
): Promise<Map<string, boolean>> {
  if (reviewerIds.length === 0) return new Map()

  const rows = await prisma.$queryRaw<HistoricalPenaltyRow[]>`
    SELECT
      "userId",
      COUNT(*)::int AS "penaltyCount"
    FROM "XpTransaction"
    WHERE "userId" = ANY(${reviewerIds}::uuid[])
      AND type = 'PENALTY'
      AND "createdAt" <= ${targetTime}
    GROUP BY "userId"
  `

  return new Map(rows.map(row => [row.userId, row.penaltyCount > 0]))
}

export async function getRecentPenaltyTimestamps(
  reviewerIds: string[],
  targetTime: Date,
  windowDays = 30
): Promise<Map<string, Date>> {
  if (reviewerIds.length === 0) return new Map()

  const windowStart = new Date(targetTime.getTime() - windowDays * 24 * 60 * 60 * 1000)

  const rows = await prisma.$queryRaw<RecentPenaltyTimestampRow[]>`
    SELECT
      "userId",
      MAX("createdAt") AS "lastPenaltyAt"
    FROM "XpTransaction"
    WHERE "userId" = ANY(${reviewerIds}::uuid[])
      AND type = 'PENALTY'
      AND "createdAt" >= ${windowStart}
      AND "createdAt" < ${targetTime}
    GROUP BY "userId"
  `

  return new Map(rows.map(row => [row.userId, row.lastPenaltyAt]))
}

// ---------------------------------------------------------------------------
// Full pool reconstruction
// ---------------------------------------------------------------------------

export async function reconstructPoolAtTime(
  timestamp: Date,
  excludeUserId: string,
  additionalExcludeIds: string[] = [],
  options: {
    formulaId?: string
    maxActiveAssignments?: number
    minReviewerXp?: number
  } = {}
): Promise<ReconstructedPool> {
  const maxAssignments = options.maxActiveAssignments ?? MAX_ACTIVE_ASSIGNMENTS
  const minXp = options.minReviewerXp ?? MIN_REVIEWER_XP

  const excludedIds = [excludeUserId, ...additionalExcludeIds]

  // 1. Fetch all reviewer-role users
  const users = await prisma.user.findMany({
    where: {
      role: { in: REVIEWER_ROLES },
      id: { notIn: excludedIds }
    },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      totalXp: true,
      missedReviews: true,
      reviewPausedUntil: true,
      reviewPausedPermanently: true,
      preferences: true
    }
  })

  if (users.length === 0) {
    return { asOf: timestamp, candidates: [], eligibleCount: 0, totalCount: 0 }
  }

  const reviewerIds = users.map(u => u.id)

  // 2. Fetch historical data in parallel
  const [activeAssignmentCounts, reliabilityScores, recentAssignmentCounts, penaltyChecks] =
    await Promise.all([
      getHistoricalActiveAssignmentCounts(reviewerIds, timestamp),
      getHistoricalReliabilityScores(reviewerIds, timestamp, options.formulaId),
      getHistoricalRecentAssignmentCounts(reviewerIds, timestamp),
      getHistoricalPenaltyCheck(reviewerIds, timestamp)
    ])

  // 3. Build candidates with eligibility filter (mirrors reviewer-pool.ts)
  const isOptedOut = (prefs: unknown): boolean => {
    if (!prefs) return false
    let parsed: Record<string, unknown>
    if (typeof prefs === 'string') {
      try { parsed = JSON.parse(prefs) } catch { return false }
    } else {
      parsed = prefs as Record<string, unknown>
    }
    if (parsed.reviewerOptOut === true) return true
    const until = parsed.reviewerOptOutUntil
    if (until) {
      const d = typeof until === 'string' ? new Date(until) : until instanceof Date ? until : null
      if (d && !Number.isNaN(d.getTime()) && d.getTime() > timestamp.getTime()) return true
    }
    return false
  }

  const candidates: ReconstructedCandidate[] = users.map(user => {
    const reasons: string[] = []
    const activeAssignments = activeAssignmentCounts.get(user.id) ?? 0
    const reliabilityScore = reliabilityScores.get(user.id) ?? 0

    if (isOptedOut(user.preferences)) {
      reasons.push('Opted out at this time')
    }
    if (user.reviewPausedPermanently) {
      reasons.push('Permanently paused')
    } else if (user.reviewPausedUntil && user.reviewPausedUntil.getTime() > timestamp.getTime()) {
      reasons.push('Temporarily paused')
    }
    if (user.totalXp < minXp && !isAdmin(user.role)) {
      reasons.push(`Below XP threshold (${user.totalXp}/${minXp})`)
    }
    if (activeAssignments >= maxAssignments) {
      reasons.push(`At capacity (${activeAssignments}/${maxAssignments})`)
    }

    return {
      id: user.id,
      username: user.username ?? user.email.split('@')[0],
      email: user.email,
      role: user.role,
      totalXp: user.totalXp,
      reliabilityScore,
      activeAssignments,
      missedReviews: user.missedReviews,
      hasPenalties: penaltyChecks.get(user.id) ?? false,
      reviewPausedUntil: user.reviewPausedUntil,
      reviewPausedPermanently: user.reviewPausedPermanently,
      isEligible: reasons.length === 0,
      exclusionReasons: reasons,
      priority: null
    }
  })

  // 4. Sort eligible candidates by current ranking
  const eligiblePool = candidates
    .filter(c => c.isEligible)
    .sort((a, b) =>
      compareReviewerPriorityValues(
        {
          activeAssignments: a.activeAssignments,
          reliabilityScore: a.reliabilityScore,
          totalXp: a.totalXp
        },
        {
          activeAssignments: b.activeAssignments,
          reliabilityScore: b.reliabilityScore,
          totalXp: b.totalXp
        }
      )
    )

  eligiblePool.forEach((c, i) => {
    c.priority = i + 1
  })

  return {
    asOf: timestamp,
    candidates,
    eligibleCount: eligiblePool.length,
    totalCount: candidates.length
  }
}

// ---------------------------------------------------------------------------
// Fairness helpers used by simulator algorithms
//
// The canonical implementations of `passesProvenBadFilter` and `hashCode`
// now live in `reviewer-fairness-algorithms.ts`. Re-exported here for
// backward compatibility with existing callers (reviewer-selection-debug).
// ---------------------------------------------------------------------------

export { passesProvenBadFilter, hashCode } from '@/lib/reviewer-fairness-algorithms'

/** Get candidates with low recent assignment count (for O1 fairness seat). */
export function getLowRecentCandidates(
  candidates: ReconstructedCandidate[],
  recentAssignmentCounts: Map<string, number>,
  maxRecent: number = 3
): ReconstructedCandidate[] {
  return candidates.filter(c => {
    const count = recentAssignmentCounts.get(c.id) ?? 0
    return count <= maxRecent
  })
}
