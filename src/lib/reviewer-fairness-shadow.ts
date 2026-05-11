/**
 * Reviewer Fairness Shadow Monitor
 *
 * Phase 1: Non-blocking shadow logging. After each real assignReviewers() call,
 * runs the candidate fairness algorithms against the same pool and logs what
 * WOULD have happened — without changing any real assignments.
 *
 * Algorithm implementations live in reviewer-fairness-algorithms.ts.
 * This module handles: pulling supporting data, invoking the shared selectors
 * against the production pool, and persisting/querying the shadow logs.
 *
 * Used by: reviewer-pool.ts (initial assignments) + deadline-monitor.ts (reassignments)
 * UI: admin/reviewer-fairness → Shadow Monitor tab
 */

import { prisma } from '@/lib/prisma'
import type { ReviewerCandidate } from '@/lib/reviewer-pool'
import { getHistoricalRecentAssignmentCounts } from '@/lib/reviewer-pool-reconstruction'
import {
  ALGORITHMS,
  runSelector,
  type AlgorithmId,
  type FairnessCandidate,
  type SelectionOptions,
} from '@/lib/reviewer-fairness-algorithms'
import { computeGini, topNShare } from '@/lib/reviewer-fairness-metrics'

let moduleInitialized = false

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Candidate augmented with the fields the fairness algorithms need. */
interface ShadowCandidate extends FairnessCandidate {
  username: string
}

interface ShadowPick {
  reviewerId: string
  username: string
  reliabilityScore: number
}

interface ShadowLogEntry {
  submissionId: string
  algorithmId: string
  eventType: 'initial' | 'reassignment'
  actualPicks: ShadowPick[]
  shadowPicks: ShadowPick[]
  diverged: boolean
  divergedCount: number
  poolSize: number
  eligiblePoolSize: number
  /** Snapshot of reviewer IDs eligible at pick time — used for coverage. */
  eligibleReviewerIds: string[]
}

// ---------------------------------------------------------------------------
// Which algorithms to shadow (configurable at runtime)
// ---------------------------------------------------------------------------

const DEFAULT_SHADOW_ALGORITHMS: AlgorithmId[] = [
  'o3_a3_combined',         // session 5 winner
  'o3_o5soft_a3_combined',  // session 5 fallback (rotation O5)
  'o3_o5_a3_combined',      // strict O5 variant for reference
  'o3_band_randomize',      // pure O3 without 3A reassign preference
  'baseline'                // reference — should always match actual picks
]

let activeShadowAlgorithms: AlgorithmId[] = [...DEFAULT_SHADOW_ALGORITHMS]

export function setShadowAlgorithms(ids: AlgorithmId[]): void {
  activeShadowAlgorithms = [...ids]
}

export function getShadowAlgorithms(): AlgorithmId[] {
  return [...activeShadowAlgorithms]
}

// ---------------------------------------------------------------------------
// Table bootstrap (dev fallback — production has a Supabase migration)
// ---------------------------------------------------------------------------

let tableEnsured = false

async function ensureShadowTable(): Promise<void> {
  if (tableEnsured) return
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "FairnessShadowLog" (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "submissionId" UUID NOT NULL,
        "algorithmId" TEXT NOT NULL,
        "eventType" TEXT NOT NULL,
        "actualPicks" JSONB NOT NULL,
        "shadowPicks" JSONB NOT NULL,
        diverged BOOLEAN NOT NULL,
        "divergedCount" INTEGER NOT NULL,
        "poolSize" INTEGER NOT NULL,
        "eligiblePoolSize" INTEGER NOT NULL,
        "eligibleReviewerIds" JSONB,
        "createdAt" TIMESTAMPTZ DEFAULT now()
      )
    `)
    await prisma.$executeRawUnsafe(`ALTER TABLE "FairnessShadowLog" ADD COLUMN IF NOT EXISTS "eligibleReviewerIds" JSONB`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FairnessShadowLog_algo_created_idx" ON "FairnessShadowLog" ("algorithmId", "createdAt" DESC)`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FairnessShadowLog_submission_idx" ON "FairnessShadowLog" ("submissionId")`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "FairnessShadowLog_created_idx" ON "FairnessShadowLog" ("createdAt")`)
    tableEnsured = true
  } catch (err) {
    console.error('[FairnessShadow] Failed to ensure table exists:', err)
  }
}

// ---------------------------------------------------------------------------
// Core shadow function — called after real assignment completes
// ---------------------------------------------------------------------------

export interface ShadowContext {
  submissionId: string
  submissionUserId: string
  isReassignment: boolean
  /** The full sorted pool that was available (before slicing) */
  availablePool: ReviewerCandidate[]
  /** The actual picks made by production code */
  actualPicks: ReviewerCandidate[]
  /** Minimum reviewers requested */
  minimumReviewers: number
  /**
   * Timestamp to use as the upper bound for recent-assignment queries.
   * Must be captured BEFORE production inserts its new ReviewAssignment rows,
   * otherwise the shadow sees its own just-written rows and thinks the picked
   * reviewers have +1 more recent assignment than they did at pick time.
   */
  pickedAt: Date
}

/**
 * Fire-and-forget: runs all active shadow algorithms against the given pool,
 * writes results to FairnessShadowLog. Never throws — failures are silently logged.
 */
export async function logShadowPicks(ctx: ShadowContext): Promise<void> {
  if (activeShadowAlgorithms.length === 0) return

  if (!moduleInitialized) {
    console.log(`[FairnessShadow] Module loaded — shadowing ${activeShadowAlgorithms.length} algorithms: ${activeShadowAlgorithms.join(', ')}`)
    moduleInitialized = true
  }

  try {
    await ensureShadowTable()
    const { submissionId, isReassignment, availablePool, actualPicks, minimumReviewers, pickedAt } = ctx
    console.log(`[FairnessShadow] Shadowing submission ${submissionId.slice(0, 8)}… (${isReassignment ? 'reassignment' : 'initial'}, pool=${availablePool.length}, n=${minimumReviewers})`)
    const eventType = isReassignment ? 'reassignment' : 'initial'
    const n = minimumReviewers

    // Build ShadowCandidate[] — pull recent counts + penalties bounded by pickedAt
    // so our freshly-inserted ReviewAssignment rows don't leak into the stats.
    // Reuse the simulator's helper so "30 days" means the same thing in both
    // paths (Postgres INTERVAL, not JS Date arithmetic).
    const candidateIds = availablePool.map(c => c.id)
    const [recent30dMap, recent7dMap, penaltyMap] = await Promise.all([
      getHistoricalRecentAssignmentCounts(candidateIds, pickedAt, 30),
      getHistoricalRecentAssignmentCounts(candidateIds, pickedAt, 7),
      fetchPenaltyChecks(candidateIds, pickedAt),
    ])

    const shadowPool: ShadowCandidate[] = availablePool.map(c => ({
      id: c.id,
      username: c.username,
      activeAssignments: c.activeAssignments,
      reliabilityScore: c.reliabilityScore ?? 0.5,
      totalXp: c.totalXp,
      missedReviews: c.missedReviews,
      hasPenalties: penaltyMap.get(c.id) ?? false,
    }))

    const recentCounts = recent30dMap
    const recent7dCounts = recent7dMap

    const actualPicksFormatted: ShadowPick[] = actualPicks.map(r => ({
      reviewerId: r.id,
      username: r.username,
      reliabilityScore: r.reliabilityScore ?? 0.5,
    }))

    // Run each shadow algorithm via the centralized dispatch.
    const entries: ShadowLogEntry[] = []
    const eligibleReviewerIds = shadowPool.map(c => c.id)

    for (const algoId of activeShadowAlgorithms) {
      const options: SelectionOptions = {
        minReviewers: isReassignment ? 1 : n,
        submissionId,
        isReassignment,
        recentCounts,
        recent7dCounts,
        // Shadow doesn't currently model weighted-load or dashboard triggers
        // live; algorithms that need them will fall back to their default.
      }

      const shadowPicksRaw = runSelector(algoId, shadowPool, options)
      const shadowPicksFormatted: ShadowPick[] = shadowPicksRaw.map(r => ({
        reviewerId: r.id,
        username: r.username,
        reliabilityScore: r.reliabilityScore,
      }))

      const actualIds = new Set(actualPicksFormatted.map(p => p.reviewerId))
      const divergedCount = shadowPicksFormatted.filter(p => !actualIds.has(p.reviewerId)).length

      entries.push({
        submissionId,
        algorithmId: algoId,
        eventType,
        actualPicks: actualPicksFormatted,
        shadowPicks: shadowPicksFormatted,
        diverged: divergedCount > 0,
        divergedCount,
        poolSize: availablePool.length,
        eligiblePoolSize: shadowPool.length,
        eligibleReviewerIds,
      })
    }

    if (entries.length > 0) {
      await prisma.fairnessShadowLog.createMany({
        data: entries.map(e => ({
          submissionId: e.submissionId,
          algorithmId: e.algorithmId,
          eventType: e.eventType,
          actualPicks: e.actualPicks as any,
          shadowPicks: e.shadowPicks as any,
          diverged: e.diverged,
          divergedCount: e.divergedCount,
          poolSize: e.poolSize,
          eligiblePoolSize: e.eligiblePoolSize,
          eligibleReviewerIds: e.eligibleReviewerIds as any,
        })),
      })
      const divergedCount = entries.filter(e => e.diverged).length
      console.log(`[FairnessShadow] ✓ Logged ${entries.length} entries (${divergedCount} diverged) for ${submissionId.slice(0, 8)}…`)
    }
  } catch (error) {
    console.error('[FairnessShadow] Failed to log shadow picks:', error)
  }
}

// ---------------------------------------------------------------------------
// Data fetchers — bounded by `asOf` so shadow reads the state AT pick time,
// not after we inserted our own rows. Recent-assignment counts are delegated
// to `getHistoricalRecentAssignmentCounts` so simulator and shadow agree on
// exactly what "N days" means (Postgres INTERVAL, not JS Date math).
// ---------------------------------------------------------------------------

async function fetchPenaltyChecks(
  reviewerIds: string[],
  asOf: Date
): Promise<Map<string, boolean>> {
  if (reviewerIds.length === 0) return new Map()

  const rows = await prisma.$queryRaw<Array<{ userId: string; penaltyCount: bigint }>>`
    SELECT
      "userId",
      COUNT(*)::int AS "penaltyCount"
    FROM "XpTransaction"
    WHERE "userId" = ANY(${reviewerIds}::uuid[])
      AND type = 'PENALTY'
      AND "createdAt" < ${asOf}
    GROUP BY "userId"
  `

  return new Map(rows.map(row => [row.userId, Number(row.penaltyCount) > 0]))
}

// ---------------------------------------------------------------------------
// Query types for the admin UI
// ---------------------------------------------------------------------------

export interface ShadowSummaryRow {
  algorithmId: string
  algorithmLabel: string
  totalEvents: number
  divergedEvents: number
  divergenceRatePct: number
  uniqueActualPicks: number
  uniqueShadowPicks: number
  newFacesActivated: number
  avgReliabilityActual: number
  avgReliabilityShadow: number
  giniActual: number
  giniShadow: number
  top3ShareActualPct: number
  top3ShareShadowPct: number
  top5ShareActualPct: number
  top5ShareShadowPct: number
  distributionCoverageActualPct: number
  distributionCoverageShadowPct: number
  eligiblePoolSize: number
}

export interface ShadowReviewerBreakdown {
  reviewerId: string
  username: string
  actualPicks: number
  shadowPicks: number
  actualSharePct: number
  shadowSharePct: number
  avgReliabilityActual: number
  avgReliabilityShadow: number
}

export interface ShadowEventDetail {
  id: string
  submissionId: string
  algorithmId: string
  algorithmLabel: string
  eventType: string
  actualPicks: ShadowPick[]
  shadowPicks: ShadowPick[]
  diverged: boolean
  divergedCount: number
  createdAt: string
}

export interface ShadowQueryResult {
  dateRange: { start: string; end: string }
  totalEvents: number
  summary: ShadowSummaryRow[]
  recentDivergences: ShadowEventDetail[]
  reviewerBreakdown: Record<string, ShadowReviewerBreakdown[]> // per algorithmId
}

// ---------------------------------------------------------------------------
// Query — aggregated via SQL, not in-memory after a LIMIT 500
// ---------------------------------------------------------------------------

export async function queryShadowLogs(
  startDate: Date,
  endDate: Date,
  algorithmIds?: AlgorithmId[]
): Promise<ShadowQueryResult> {
  await ensureShadowTable()

  const requestedAlgoIds = algorithmIds?.length
    ? algorithmIds.filter(id => ALGORITHMS.some(a => a.id === id))
    : activeShadowAlgorithms

  // Summary counters per algorithm (constant rows, scales forever)
  const summaryRows = await prisma.$queryRaw<
    Array<{
      algorithmId: string
      totalEvents: bigint
      divergedEvents: bigint
      poolSizeSum: bigint | null
    }>
  >`
    SELECT
      "algorithmId",
      COUNT(*)::bigint AS "totalEvents",
      COUNT(*) FILTER (WHERE diverged = true)::bigint AS "divergedEvents",
      SUM("eligiblePoolSize")::bigint AS "poolSizeSum"
    FROM "FairnessShadowLog"
    WHERE "createdAt" >= ${startDate}
      AND "createdAt" <= ${endDate}
      AND "algorithmId" = ANY(${requestedAlgoIds})
    GROUP BY "algorithmId"
  `

  // Per-algorithm, per-reviewer pick counts derived from the JSONB arrays.
  const breakdownRows = await prisma.$queryRaw<
    Array<{
      algorithmId: string
      reviewerId: string
      username: string | null
      actualPicks: bigint
      shadowPicks: bigint
      actualRelSum: number | null
      shadowRelSum: number | null
    }>
  >`
    WITH actual_picks AS (
      SELECT
        l."algorithmId",
        (p->>'reviewerId')::uuid AS "reviewerId",
        p->>'username' AS username,
        (p->>'reliabilityScore')::float AS "reliabilityScore"
      FROM "FairnessShadowLog" l
      CROSS JOIN LATERAL jsonb_array_elements(l."actualPicks") AS p
      WHERE l."createdAt" >= ${startDate}
        AND l."createdAt" <= ${endDate}
        AND l."algorithmId" = ANY(${requestedAlgoIds})
    ),
    shadow_picks AS (
      SELECT
        l."algorithmId",
        (p->>'reviewerId')::uuid AS "reviewerId",
        p->>'username' AS username,
        (p->>'reliabilityScore')::float AS "reliabilityScore"
      FROM "FairnessShadowLog" l
      CROSS JOIN LATERAL jsonb_array_elements(l."shadowPicks") AS p
      WHERE l."createdAt" >= ${startDate}
        AND l."createdAt" <= ${endDate}
        AND l."algorithmId" = ANY(${requestedAlgoIds})
    ),
    all_picks AS (
      SELECT "algorithmId", "reviewerId", username FROM actual_picks
      UNION
      SELECT "algorithmId", "reviewerId", username FROM shadow_picks
    )
    SELECT
      ap."algorithmId",
      ap."reviewerId"::text AS "reviewerId",
      MAX(ap.username) AS username,
      COALESCE(COUNT(act."reviewerId"), 0)::bigint AS "actualPicks",
      COALESCE(COUNT(sh."reviewerId"), 0)::bigint AS "shadowPicks",
      COALESCE(SUM(act."reliabilityScore"), 0)::float AS "actualRelSum",
      COALESCE(SUM(sh."reliabilityScore"), 0)::float AS "shadowRelSum"
    FROM all_picks ap
    LEFT JOIN actual_picks act
      ON act."algorithmId" = ap."algorithmId"
     AND act."reviewerId" = ap."reviewerId"
    LEFT JOIN shadow_picks sh
      ON sh."algorithmId" = ap."algorithmId"
     AND sh."reviewerId" = ap."reviewerId"
    GROUP BY ap."algorithmId", ap."reviewerId"
  `

  // Eligible reviewer set union per algorithm (coverage denominator).
  const eligibleUnionRows = await prisma.$queryRaw<
    Array<{ algorithmId: string; eligibleId: string }>
  >`
    SELECT DISTINCT
      "algorithmId",
      jsonb_array_elements_text("eligibleReviewerIds") AS "eligibleId"
    FROM "FairnessShadowLog"
    WHERE "createdAt" >= ${startDate}
      AND "createdAt" <= ${endDate}
      AND "algorithmId" = ANY(${requestedAlgoIds})
      AND "eligibleReviewerIds" IS NOT NULL
  `

  // Recent divergences — the one query that actually needs row-level data.
  const recentDivergencesRaw = await prisma.fairnessShadowLog.findMany({
    where: {
      createdAt: { gte: startDate, lte: endDate },
      algorithmId: { in: requestedAlgoIds },
      diverged: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  // Build per-algorithm aggregations.
  const perAlgoBreakdowns = new Map<string, Map<string, {
    username: string | null
    actualPicks: number
    shadowPicks: number
    actualRelSum: number
    shadowRelSum: number
  }>>()

  for (const row of breakdownRows) {
    if (!perAlgoBreakdowns.has(row.algorithmId)) {
      perAlgoBreakdowns.set(row.algorithmId, new Map())
    }
    perAlgoBreakdowns.get(row.algorithmId)!.set(row.reviewerId, {
      username: row.username,
      actualPicks: Number(row.actualPicks),
      shadowPicks: Number(row.shadowPicks),
      actualRelSum: Number(row.actualRelSum),
      shadowRelSum: Number(row.shadowRelSum),
    })
  }

  const eligibleSetByAlgo = new Map<string, Set<string>>()
  for (const row of eligibleUnionRows) {
    if (!eligibleSetByAlgo.has(row.algorithmId)) {
      eligibleSetByAlgo.set(row.algorithmId, new Set())
    }
    if (row.eligibleId) eligibleSetByAlgo.get(row.algorithmId)!.add(row.eligibleId)
  }

  // New faces = reviewers in shadow picks but not in ANY algorithm's actual picks
  // (actual picks are identical across algorithms for a given event, so unioning
  // is equivalent to "the set of people production actually picked").
  const productionActualReviewers = new Set<string>()
  for (const algoBreakdown of perAlgoBreakdowns.values()) {
    for (const [reviewerId, counts] of algoBreakdown.entries()) {
      if (counts.actualPicks > 0) productionActualReviewers.add(reviewerId)
    }
  }

  const summary: ShadowSummaryRow[] = summaryRows
    .filter(r => requestedAlgoIds.includes(r.algorithmId as AlgorithmId))
    .map(r => {
      const algo = ALGORITHMS.find(a => a.id === r.algorithmId)
      const breakdown = perAlgoBreakdowns.get(r.algorithmId) ?? new Map()

      const actualPickValues: number[] = []
      const shadowPickValues: number[] = []
      const actualReviewers = new Set<string>()
      const shadowReviewers = new Set<string>()
      let actualPickTotal = 0
      let shadowPickTotal = 0
      let actualRelSumTotal = 0
      let shadowRelSumTotal = 0

      for (const [reviewerId, c] of breakdown.entries()) {
        if (c.actualPicks > 0) {
          actualPickValues.push(c.actualPicks)
          actualReviewers.add(reviewerId)
          actualPickTotal += c.actualPicks
          actualRelSumTotal += c.actualRelSum
        }
        if (c.shadowPicks > 0) {
          shadowPickValues.push(c.shadowPicks)
          shadowReviewers.add(reviewerId)
          shadowPickTotal += c.shadowPicks
          shadowRelSumTotal += c.shadowRelSum
        }
      }

      const newFaces = Array.from(shadowReviewers)
        .filter(id => !productionActualReviewers.has(id))
        .length

      const eligibleSetSize = eligibleSetByAlgo.get(r.algorithmId)?.size ?? 0

      return {
        algorithmId: r.algorithmId,
        algorithmLabel: algo?.label ?? r.algorithmId,
        totalEvents: Number(r.totalEvents),
        divergedEvents: Number(r.divergedEvents),
        divergenceRatePct: Number(r.totalEvents) > 0
          ? (Number(r.divergedEvents) / Number(r.totalEvents)) * 100
          : 0,
        uniqueActualPicks: actualReviewers.size,
        uniqueShadowPicks: shadowReviewers.size,
        newFacesActivated: newFaces,
        avgReliabilityActual: actualPickTotal > 0 ? actualRelSumTotal / actualPickTotal : 0,
        avgReliabilityShadow: shadowPickTotal > 0 ? shadowRelSumTotal / shadowPickTotal : 0,
        giniActual: computeGini(actualPickValues),
        giniShadow: computeGini(shadowPickValues),
        top3ShareActualPct: topNShare(actualPickValues, 3),
        top3ShareShadowPct: topNShare(shadowPickValues, 3),
        top5ShareActualPct: topNShare(actualPickValues, 5),
        top5ShareShadowPct: topNShare(shadowPickValues, 5),
        distributionCoverageActualPct: eligibleSetSize > 0
          ? (actualReviewers.size / eligibleSetSize) * 100
          : 0,
        distributionCoverageShadowPct: eligibleSetSize > 0
          ? (shadowReviewers.size / eligibleSetSize) * 100
          : 0,
        eligiblePoolSize: eligibleSetSize,
      }
    })

  // Per-reviewer breakdown per algorithm
  const reviewerBreakdown: Record<string, ShadowReviewerBreakdown[]> = {}
  for (const algoId of requestedAlgoIds) {
    const breakdown = perAlgoBreakdowns.get(algoId)
    if (!breakdown) continue

    let totalActualPicks = 0
    let totalShadowPicks = 0
    for (const c of breakdown.values()) {
      totalActualPicks += c.actualPicks
      totalShadowPicks += c.shadowPicks
    }

    reviewerBreakdown[algoId] = Array.from(breakdown.entries())
      .map(([reviewerId, c]) => ({
        reviewerId,
        username: c.username ?? reviewerId.slice(0, 8),
        actualPicks: c.actualPicks,
        shadowPicks: c.shadowPicks,
        actualSharePct: totalActualPicks > 0 ? (c.actualPicks / totalActualPicks) * 100 : 0,
        shadowSharePct: totalShadowPicks > 0 ? (c.shadowPicks / totalShadowPicks) * 100 : 0,
        avgReliabilityActual: c.actualPicks > 0 ? c.actualRelSum / c.actualPicks : 0,
        avgReliabilityShadow: c.shadowPicks > 0 ? c.shadowRelSum / c.shadowPicks : 0,
      }))
      .sort((a, b) => b.actualPicks - a.actualPicks)
  }

  const recentDivergences: ShadowEventDetail[] = recentDivergencesRaw.map(log => {
    const algo = ALGORITHMS.find(a => a.id === log.algorithmId)
    return {
      id: log.id,
      submissionId: log.submissionId,
      algorithmId: log.algorithmId,
      algorithmLabel: algo?.label ?? log.algorithmId,
      eventType: log.eventType,
      actualPicks: (log.actualPicks as any) as ShadowPick[],
      shadowPicks: (log.shadowPicks as any) as ShadowPick[],
      diverged: log.diverged,
      divergedCount: log.divergedCount,
      createdAt: log.createdAt.toISOString(),
    }
  })

  const totalEvents = summaryRows.reduce((s, r) => s + Number(r.totalEvents), 0)

  return {
    dateRange: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
    totalEvents,
    summary,
    recentDivergences,
    reviewerBreakdown,
  }
}
