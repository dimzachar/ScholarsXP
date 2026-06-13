/**
 * Reviewer Fairness Simulator
 *
 * Runs all candidate algorithms against historical auto-assignment events
 * and compares distribution outcomes: Gini, top-3 share, coverage, activation rate.
 *
 * Algorithms themselves live in reviewer-fairness-algorithms.ts — this file
 * only handles event reconstruction, per-event parameter gathering, and
 * aggregating the results.
 *
 * Used by: admin/reviewer-fairness Simulation tab
 */

import { prisma } from '@/lib/prisma'
import {
  reconstructPoolAtTime,
  getHistoricalRecentAssignmentCounts,
  getRecentPenaltyTimestamps,
} from '@/lib/reviewer-pool-reconstruction'
import type { ReconstructedCandidate } from '@/lib/reviewer-pool-reconstruction'
import { compareReviewerPriorityValues } from '@/lib/reviewer-ranking'
import { computeGini } from '@/lib/reviewer-fairness-metrics'

import {
  ALGORITHMS,
  runSelector,
  type AlgorithmId,
  type AlgorithmMeta,
  type SelectionOptions
} from '@/lib/reviewer-fairness-algorithms'

// Re-export for backward compatibility
export { ALGORITHMS, type AlgorithmId, type AlgorithmMeta }

export interface AlgorithmResult {
  algorithmId: string
  algorithmLabel: string
  totalEvents: number
  uniquePicked: number
  totalPicksMade: number
  giniCoefficient: number
  top3AssignmentSharePct: number
  top5AssignmentSharePct: number
  distributionCoveragePct: number
  newReviewerActivated: number
  avgReliabilityOfPicks: number
  reviewerBreakdown: Array<{
    reviewerId: string
    username: string
    picks: number
    sharePct: number
    avgReliability: number
  }>
}

export interface SimulationResult {
  generatedAt: string
  dateRange: { start: string; end: string }
  totalSubmissions: number
  totalReviewersInPool: number
  eligibleReviewersInPool: number
  uniqueEvents: number
  initialAssignmentEvents: number
  reassignmentEvents: number
  totalReviewerSlots: number
  algorithms: AlgorithmResult[]
}

export interface SimulationEvent {
  submissionId: string
  timestamp: Date
  submissionUserId: string
  minReviewers: number
  isReassignment: boolean
}

interface EventPool {
  event: SimulationEvent
  pool: ReconstructedCandidate[]
  recentCounts: Map<string, number>
  recent7dCounts: Map<string, number>
  weightedLoads: Map<string, number>
  recentPenaltyAt: Map<string, Date>
  triggerFairness: boolean
}

// ---------------------------------------------------------------------------
// Weighted load computation (for 3C)
// ---------------------------------------------------------------------------

async function computeWeightedLoads(
  reviewerIds: string[],
  targetTime: Date
): Promise<Map<string, number>> {
  if (reviewerIds.length === 0) return new Map()

  const rows = await prisma.$queryRaw<Array<{ reviewerId: string; assignedAt: Date }>>`
    SELECT "reviewerId", "assignedAt"
    FROM "ReviewAssignment"
    WHERE "reviewerId" = ANY(${reviewerIds}::uuid[])
      AND "assignedAt" < ${targetTime}
      AND ("completedAt" IS NULL OR "completedAt" > ${targetTime})
      AND NOT ("status" = 'REASSIGNED' AND "updatedAt" <= ${targetTime})
  `

  const loads = new Map<string, number>()
  for (const row of rows) {
    const ageHours = (targetTime.getTime() - row.assignedAt.getTime()) / (1000 * 60 * 60)
    const decay = Math.max(0, 1 - ageHours / 48)  // linear decay over 48h
    loads.set(row.reviewerId, (loads.get(row.reviewerId) ?? 0) + decay)
  }

  return loads
}

// ---------------------------------------------------------------------------
// Fetch events
// ---------------------------------------------------------------------------

/**
 * Query initial-assignment batches and reassignment events separately.
 *
 * Initial batches are detected by grouping the FIRST batch of assignments
 * per submission (everything within 10s of the first `assignedAt`).
 * Anything later is a reassignment — and crucially, each reassignment uses
 * its OWN `assignedAt` timestamp, so the pool reconstruction later sees
 * the correct active-assignment state at reassignment time.
 */
export async function fetchSimulationEvents(
  startDate: Date,
  endDate: Date
): Promise<SimulationEvent[]> {
  // Initial batches
  const initialRows = await prisma.$queryRaw<
    Array<{
      submissionId: string
      userId: string
      firstAssignedAt: Date
      initialCount: bigint
    }>
  >`
    WITH first_batch_time AS (
      SELECT
        "submissionId",
        MIN("assignedAt") AS "firstAssignedAt"
      FROM "ReviewAssignment"
      WHERE "assignedAt" >= ${startDate}
        AND "assignedAt" <= ${endDate}
      GROUP BY "submissionId"
    ),
    initial_batch AS (
      SELECT
        ra."submissionId",
        COUNT(DISTINCT ra."reviewerId")::bigint AS "initialCount"
      FROM "ReviewAssignment" ra
      JOIN first_batch_time fbt
        ON ra."submissionId" = fbt."submissionId"
       AND ra."assignedAt" <= fbt."firstAssignedAt" + INTERVAL '10 seconds'
      GROUP BY ra."submissionId"
    )
    SELECT
      fbt."submissionId",
      s."userId",
      fbt."firstAssignedAt",
      ib."initialCount"
    FROM first_batch_time fbt
    JOIN initial_batch ib ON ib."submissionId" = fbt."submissionId"
    JOIN "Submission" s ON s.id = fbt."submissionId"
    WHERE s."userId" IS NOT NULL
    ORDER BY fbt."firstAssignedAt" ASC
  `

  // Reassignments: every row past the initial batch, with its real assignedAt
  const reassignRows = await prisma.$queryRaw<
    Array<{
      submissionId: string
      userId: string
      assignedAt: Date
    }>
  >`
    WITH first_batch_time AS (
      SELECT
        "submissionId",
        MIN("assignedAt") AS "firstAssignedAt"
      FROM "ReviewAssignment"
      WHERE "assignedAt" >= ${startDate}
        AND "assignedAt" <= ${endDate}
      GROUP BY "submissionId"
    )
    SELECT
      ra."submissionId",
      s."userId",
      ra."assignedAt"
    FROM "ReviewAssignment" ra
    JOIN first_batch_time fbt ON fbt."submissionId" = ra."submissionId"
    JOIN "Submission" s ON s.id = ra."submissionId"
    WHERE ra."assignedAt" > fbt."firstAssignedAt" + INTERVAL '10 seconds'
      AND ra."assignedAt" >= ${startDate}
      AND ra."assignedAt" <= ${endDate}
      AND s."userId" IS NOT NULL
    ORDER BY ra."assignedAt" ASC
  `

  const events: SimulationEvent[] = []

  for (const row of initialRows) {
    events.push({
      submissionId: row.submissionId,
      timestamp: row.firstAssignedAt,
      submissionUserId: row.userId,
      minReviewers: Number(row.initialCount),
      isReassignment: false
    })
  }

  for (const row of reassignRows) {
    events.push({
      submissionId: row.submissionId,
      timestamp: row.assignedAt,
      submissionUserId: row.userId,
      minReviewers: 1,
      isReassignment: true
    })
  }

  // Sort all events chronologically so simulations proceed in real-world order
  events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

  return events
}

// ---------------------------------------------------------------------------
// Run simulation
// ---------------------------------------------------------------------------

export async function runSimulation(
  startDate: Date,
  endDate: Date,
  algorithmIds: AlgorithmId[] = ALGORITHMS.filter(a => a.id !== 'o3_a3_combined' && a.id !== 'o1_3a_combined').map(a => a.id)
): Promise<SimulationResult> {
  const events = await fetchSimulationEvents(startDate, endDate)
  const allReviewerIds = new Set<string>()
  // Track only ELIGIBLE reviewers (not paused/banned/opted-out) for coverage denominator.
  // Fixes: baseline coverage was inflated because it counted assignments to reviewers
  // who later got paused, while algorithms respect pause state at each event time.
  const allEligibleReviewerIds = new Set<string>()

  if (events.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      dateRange: { start: startDate.toISOString(), end: endDate.toISOString() },
      totalSubmissions: 0,
      totalReviewersInPool: 0,
      eligibleReviewersInPool: 0,
      uniqueEvents: 0,
      initialAssignmentEvents: 0,
      reassignmentEvents: 0,
      totalReviewerSlots: 0,
      algorithms: []
    }
  }

  // Reconstruct pools for each event
  const eventPools: EventPool[] = []

  for (const event of events) {
    const reconstructed = await reconstructPoolAtTime(event.timestamp, event.submissionUserId)

    const eligiblePool = reconstructed.candidates
      .filter(c => c.isEligible)
      .sort((a, b) =>
        compareReviewerPriorityValues(
          { activeAssignments: a.activeAssignments, reliabilityScore: a.reliabilityScore, totalXp: a.totalXp },
          { activeAssignments: b.activeAssignments, reliabilityScore: b.reliabilityScore, totalXp: b.totalXp }
        )
      )

    const poolIds = eligiblePool.map(c => c.id)
    const needsRecentPenaltyAt = algorithmIds.includes('o3_a3_recent_penalty_cooldown')
    const [recentCounts, recent7dCounts, weightedLoads, recentPenaltyAt] = poolIds.length > 0
      ? await Promise.all([
          getHistoricalRecentAssignmentCounts(poolIds, event.timestamp, 30),
          getHistoricalRecentAssignmentCounts(poolIds, event.timestamp, 7),
          computeWeightedLoads(poolIds, event.timestamp),
          needsRecentPenaltyAt ? getRecentPenaltyTimestamps(poolIds, event.timestamp, 30) : Promise.resolve(new Map<string, Date>()),
        ])
      : [new Map<string, number>(), new Map<string, number>(), new Map<string, number>(), new Map<string, Date>()]

    // 3D trigger: check if eligible reviewers have zero recent assignments
    const eligibleWithoutAssignments = eligiblePool.filter(c => {
      const count = recentCounts.get(c.id) ?? 0
      return count === 0
    }).length
    const triggerFairness = eligibleWithoutAssignments >= 2

    reconstructed.candidates.forEach(c => allReviewerIds.add(c.id))
    eligiblePool.forEach(c => allEligibleReviewerIds.add(c.id))

    eventPools.push({
      event,
      pool: eligiblePool,
      recentCounts,
      recent7dCounts,
      weightedLoads,
      recentPenaltyAt,
      triggerFairness
    })
  }

  // Run each algorithm
  const rawResults: Array<{
    algoId: AlgorithmId
    pickCounts: Map<string, number>
    reliabilitySums: Map<string, number>
    totalPicks: number
  }> = []

  // Baseline = actual DB counts (not simulated).
  // MUST use TWO separate queries — LEFT JOIN on only reviewerId creates a
  // cartesian product between ReviewAssignment and PeerReview, inflating counts
  // (each assignment row × each peer review row for that reviewer).
  const baselineCountRows = await prisma.$queryRaw<
    Array<{ reviewerId: string; username: string; count: bigint }>
  >`
    SELECT
      ra."reviewerId",
      u.username,
      COUNT(*)::bigint AS count
    FROM "ReviewAssignment" ra
    JOIN "User" u ON u.id = ra."reviewerId"
    WHERE ra."assignedAt" >= ${startDate}
      AND ra."assignedAt" <= ${endDate}
    GROUP BY ra."reviewerId", u.username
    ORDER BY count DESC
  `

  const reviewerIds = baselineCountRows.map(r => r.reviewerId)
  const baselineRelRows = reviewerIds.length > 0
    ? await prisma.$queryRaw<
        Array<{ reviewerId: string; avgRel: number | null }>
      >`
        SELECT
          pr."reviewerId",
          AVG(pr."qualityRating") AS "avgRel"
        FROM "PeerReview" pr
        WHERE pr."reviewerId" = ANY(${reviewerIds}::uuid[])
        GROUP BY pr."reviewerId"
      `
    : []

  const baselineRelMap = new Map<string, number>()
  for (const row of baselineRelRows) {
    if (row.avgRel != null) baselineRelMap.set(row.reviewerId, row.avgRel)
  }

  const baselinePickCounts = new Map<string, number>()
  const baselineRelSums = new Map<string, number>()
  let baselineTotalPicks = 0
  const baselineUsernameMap = new Map<string, string>()

  for (const row of baselineCountRows) {
    const count = Number(row.count)
    baselinePickCounts.set(row.reviewerId, count)
    const avgRel = baselineRelMap.get(row.reviewerId) ?? 0.7
    baselineRelSums.set(row.reviewerId, avgRel * count)
    baselineTotalPicks += count
    baselineUsernameMap.set(row.reviewerId, row.username ?? row.reviewerId.slice(0, 8))
    allReviewerIds.add(row.reviewerId)
  }

  rawResults.push({
    algoId: 'baseline',
    pickCounts: baselinePickCounts,
    reliabilitySums: baselineRelSums,
    totalPicks: baselineTotalPicks
  })

  // Simulate non-baseline algorithms via the shared selector dispatch
  for (const algoId of algorithmIds) {
    if (algoId === 'baseline') continue
    const meta = ALGORITHMS.find(a => a.id === algoId)
    if (!meta) continue

    const pickCounts = new Map<string, number>()
    const reliabilitySums = new Map<string, number>()
    let totalPicks = 0

    for (const { event, pool, recentCounts, recent7dCounts, weightedLoads, recentPenaltyAt, triggerFairness } of eventPools) {
      const options: SelectionOptions = {
        minReviewers: event.isReassignment ? 1 : event.minReviewers,
        submissionId: event.submissionId,
        isReassignment: event.isReassignment,
        recentCounts,
        recent7dCounts,
        weightedLoads,
        recentPenaltyAt,
        recentPenaltyCooldownDays: 14,
        recentPenaltyCooldownAsOf: event.timestamp,
        triggerFairness
      }

      const picks = runSelector(algoId, pool, options)

      for (const pick of picks) {
        pickCounts.set(pick.id, (pickCounts.get(pick.id) ?? 0) + 1)
        reliabilitySums.set(pick.id, (reliabilitySums.get(pick.id) ?? 0) + pick.reliabilityScore)
        totalPicks++
      }
    }

    rawResults.push({ algoId, pickCounts, reliabilitySums, totalPicks })
  }

  // Build final results with cross-algorithm comparisons
  const baselineRaw = rawResults.find(r => r.algoId === 'baseline')
  const baselinePickedIds = new Set(
    baselineRaw
      ? Array.from(baselineRaw.pickCounts.entries())
          .filter(([, count]) => count > 0)
          .map(([id]) => id)
      : []
  )

  const initialEvents = events.filter(e => !e.isReassignment).length
  const reassignEvents = events.filter(e => e.isReassignment).length

  const totalPicksPossible = events.reduce((sum, e) => sum + e.minReviewers, 0)

  // Cleaned baseline picks: only reviewers who were eligible in at least one
  // reconstructed pool. Makes coverage comparable across baseline (real DB)
  // and algorithm picks (constrained to the reconstructed eligible pools).
  const baselineCleanPickedIds = new Set(
    Array.from(baselinePickedIds).filter(id => allEligibleReviewerIds.has(id))
  )

  const algorithms: AlgorithmResult[] = rawResults.map(raw => {
    const meta = ALGORITHMS.find(a => a.id === raw.algoId)!
    const pickValues = Array.from(raw.pickCounts.values())
    const gini = computeGini(pickValues)
    const totalAssigns = pickValues.reduce((s, v) => s + v, 0)

    const sorted = [...pickValues].sort((a, b) => b - a)
    const top3Sum = sorted.slice(0, 3).reduce((s, v) => s + v, 0)
    const top5Sum = sorted.slice(0, 5).reduce((s, v) => s + v, 0)

    const uniquePicked = raw.pickCounts.size
    const uniquePickedForCoverage =
      raw.algoId === 'baseline' ? baselineCleanPickedIds.size : uniquePicked

    const newActivated =
      raw.algoId === 'baseline'
        ? 0
        : Array.from(raw.pickCounts.entries())
            .filter(([id, count]) => count > 0 && !baselineCleanPickedIds.has(id))
            .length

    const reviewerBreakdown = Array.from(raw.pickCounts.entries())
      .map(([reviewerId, picks]) => {
        let username: string
        if (raw.algoId === 'baseline') {
          username = baselineUsernameMap.get(reviewerId) ?? reviewerId.slice(0, 8)
        } else {
          username = reviewerId.slice(0, 8)
          for (const ep of eventPools) {
            const found = ep.pool.find(c => c.id === reviewerId)
            if (found) { username = found.username; break }
          }
        }
        return {
          reviewerId,
          username,
          picks,
          sharePct: totalAssigns > 0 ? (picks / totalAssigns) * 100 : 0,
          avgReliability: picks > 0 ? (raw.reliabilitySums.get(reviewerId) ?? 0) / picks : 0
        }
      })
      .sort((a, b) => b.picks - a.picks)

    return {
      algorithmId: raw.algoId,
      algorithmLabel: meta.label,
      totalEvents: events.length,
      uniquePicked,
      totalPicksMade: raw.totalPicks,
      giniCoefficient: gini,
      top3AssignmentSharePct: totalAssigns > 0 ? (top3Sum / totalAssigns) * 100 : 0,
      top5AssignmentSharePct: totalAssigns > 0 ? (top5Sum / totalAssigns) * 100 : 0,
      distributionCoveragePct: allEligibleReviewerIds.size > 0
        ? (uniquePickedForCoverage / allEligibleReviewerIds.size) * 100
        : 0,
      newReviewerActivated: newActivated,
      avgReliabilityOfPicks: raw.totalPicks > 0
        ? Array.from(raw.reliabilitySums.values()).reduce((s, v) => s + v, 0) / raw.totalPicks
        : 0,
      reviewerBreakdown
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    dateRange: { start: startDate.toISOString(), end: endDate.toISOString() },
    totalSubmissions: events.length,
    totalReviewersInPool: allReviewerIds.size,
    eligibleReviewersInPool: allEligibleReviewerIds.size,
    uniqueEvents: events.length,
    initialAssignmentEvents: initialEvents,
    reassignmentEvents: reassignEvents,
    totalReviewerSlots: totalPicksPossible,
    algorithms
  }
}
