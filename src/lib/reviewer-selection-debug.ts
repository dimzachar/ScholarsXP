import { prisma } from '@/lib/prisma'
import { REVIEWER_ROLES, isAdmin } from '@/lib/roles'
import { RELIABILITY_CONFIG } from '@/config/reliability'
import { calculateScore, getFormula } from '@/lib/reliability/formulas'
import type { ReviewerMetrics } from '@/lib/reliability/types'

const MIN_REVIEWER_XP = 50
const MAX_ACTIVE_ASSIGNMENTS = 5

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

export interface SelectionReplayCandidate {
  id: string
  username: string
  email: string
  role: string
  totalXp: number
  reliabilityScore: number
  activeAssignmentsBefore: number
  currentAssignmentStatus?: string
  selected: boolean
  inPool: boolean
  priority?: number
  reasons: string[]
}

export interface SelectionReplayEvent {
  key: string
  assignedAt: string
  selectedCount: number
  selectedReviewerIds: string[]
  selectedAssignments: Array<{
    assignmentId: string
    reviewerId: string
    reviewerName: string
    status: string
  }>
  candidates: SelectionReplayCandidate[]
  poolSize: number
  limitations: string[]
}

export interface SubmissionSelectionReplay {
  submissionId: string
  selectionLogic: string
  limitations: string[]
  events: SelectionReplayEvent[]
}

function parseReviewerOptOutAtTime(preferences: unknown, targetTime: Date): boolean {
  if (!preferences) {
    return false
  }

  let parsed: Record<string, unknown>

  if (typeof preferences === 'string') {
    try {
      parsed = JSON.parse(preferences)
    } catch {
      return false
    }
  } else {
    parsed = preferences as Record<string, unknown>
  }

  if (parsed.reviewerOptOut === true) {
    return true
  }

  const optOutUntilRaw = parsed.reviewerOptOutUntil
  if (optOutUntilRaw instanceof Date) {
    return optOutUntilRaw.getTime() > targetTime.getTime()
  }

  if (typeof optOutUntilRaw === 'string') {
    const parsedDate = new Date(optOutUntilRaw)
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.getTime() > targetTime.getTime()
    }
  }

  return false
}

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

async function getHistoricalActiveAssignmentCounts(
  reviewerIds: string[],
  targetTime: Date
): Promise<Map<string, number>> {
  if (reviewerIds.length === 0) {
    return new Map()
  }

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

async function getHistoricalReliabilityScores(
  reviewerIds: string[],
  targetTime: Date
): Promise<Map<string, number>> {
  if (reviewerIds.length === 0) {
    return new Map()
  }

  const formula = getFormula(RELIABILITY_CONFIG.ACTIVE_FORMULA)

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

async function buildReplayEvent(
  submissionId: string,
  submissionUserId: string,
  eventAssignments: Array<{
    id: string
    reviewerId: string
    assignedAt: Date
    status: string
    reviewer: {
      username: string | null
      email: string
    }
  }>,
  allAssignments: Array<{
    id: string
    reviewerId: string
    assignedAt: Date
    updatedAt: Date
    status: string
  }>
): Promise<SelectionReplayEvent> {
  const targetTime = eventAssignments[0].assignedAt

  const reviewers = await prisma.user.findMany({
    where: {
      role: { in: REVIEWER_ROLES },
      id: { not: submissionUserId }
    },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      totalXp: true,
      preferences: true,
      reviewPausedUntil: true,
      reviewPausedPermanently: true
    }
  })

  const reviewerIds = reviewers.map(reviewer => reviewer.id)
  const [activeAssignmentCounts, reliabilityScores] = await Promise.all([
    getHistoricalActiveAssignmentCounts(reviewerIds, targetTime),
    getHistoricalReliabilityScores(reviewerIds, targetTime)
  ])

  const excludedBecauseAlreadyAssigned = new Set(
    allAssignments
      .filter(assignment =>
        assignment.assignedAt < targetTime &&
        !(assignment.status === 'REASSIGNED' && assignment.updatedAt <= targetTime)
      )
      .map(assignment => assignment.reviewerId)
  )

  const eventSelectedIds = new Set(eventAssignments.map(assignment => assignment.reviewerId))
  const selectedStatusMap = new Map(
    eventAssignments.map(assignment => [assignment.reviewerId, assignment.status])
  )

  const candidates: SelectionReplayCandidate[] = reviewers.map(reviewer => {
    const reasons: string[] = []
    const activeAssignmentsBefore = activeAssignmentCounts.get(reviewer.id) ?? 0
    const reliabilityScore = reliabilityScores.get(reviewer.id) ?? 0

    if (excludedBecauseAlreadyAssigned.has(reviewer.id)) {
      reasons.push('Already assigned to this submission before this selection run')
    }

    if (parseReviewerOptOutAtTime(reviewer.preferences, targetTime)) {
      reasons.push('Currently opted out of automatic review assignments')
    }

    if (reviewer.reviewPausedPermanently) {
      reasons.push('Permanently paused from reviewing')
    } else if (reviewer.reviewPausedUntil && reviewer.reviewPausedUntil.getTime() > targetTime.getTime()) {
      reasons.push('Temporarily paused from reviewing')
    }

    if (reviewer.totalXp < MIN_REVIEWER_XP && !isAdmin(reviewer.role)) {
      reasons.push(`Below minimum XP threshold (${reviewer.totalXp}/${MIN_REVIEWER_XP})`)
    }

    if (activeAssignmentsBefore >= MAX_ACTIVE_ASSIGNMENTS) {
      reasons.push(`At capacity (${activeAssignmentsBefore}/${MAX_ACTIVE_ASSIGNMENTS} active assignments)`)
    }

    return {
      id: reviewer.id,
      username: reviewer.username || reviewer.email.split('@')[0],
      email: reviewer.email,
      role: reviewer.role,
      totalXp: reviewer.totalXp,
      reliabilityScore,
      activeAssignmentsBefore,
      currentAssignmentStatus: selectedStatusMap.get(reviewer.id),
      selected: eventSelectedIds.has(reviewer.id),
      inPool: reasons.length === 0,
      reasons
    }
  })

  const rankedPool = candidates
    .filter(candidate => candidate.inPool)
    .sort((a, b) => {
      if (a.activeAssignmentsBefore !== b.activeAssignmentsBefore) {
        return a.activeAssignmentsBefore - b.activeAssignmentsBefore
      }
      if (a.reliabilityScore !== b.reliabilityScore) {
        return b.reliabilityScore - a.reliabilityScore
      }
      return b.totalXp - a.totalXp
    })
    .map((candidate, index) => ({
      ...candidate,
      priority: index + 1
    }))

  const rankedPoolMap = new Map(rankedPool.map(candidate => [candidate.id, candidate.priority]))

  const mergedCandidates = candidates
    .map(candidate => ({
      ...candidate,
      priority: rankedPoolMap.get(candidate.id)
    }))
    .sort((a, b) => {
      if (a.inPool && b.inPool) {
        return (a.priority ?? 0) - (b.priority ?? 0)
      }
      if (a.inPool) return -1
      if (b.inPool) return 1
      return a.username.localeCompare(b.username)
    })

  return {
    key: `${submissionId}:${targetTime.toISOString()}`,
    assignedAt: targetTime.toISOString(),
    selectedCount: eventAssignments.length,
    selectedReviewerIds: eventAssignments.map(assignment => assignment.reviewerId),
    selectedAssignments: eventAssignments.map(assignment => ({
      assignmentId: assignment.id,
      reviewerId: assignment.reviewerId,
      reviewerName: assignment.reviewer.username || assignment.reviewer.email.split('@')[0],
      status: assignment.status
    })),
    candidates: mergedCandidates,
    poolSize: rankedPool.length,
    limitations: [
      'Workload is reconstructed at assignment time from review assignment timestamps.',
      'Historical pause and opt-out state is approximated from current user settings because pause snapshots are not stored.',
      'Reliability is replayed using the current active formula and review history available up to that assignment time.'
    ]
  }
}

export async function getSubmissionSelectionReplay(
  submissionId: string
): Promise<SubmissionSelectionReplay | null> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      userId: true,
      reviewAssignments: {
        include: {
          reviewer: {
            select: {
              username: true,
              email: true
            }
          }
        },
        orderBy: {
          assignedAt: 'asc'
        }
      }
    }
  })

  if (!submission) {
    return null
  }

  const eventGroups = new Map<string, typeof submission.reviewAssignments>()
  for (const assignment of submission.reviewAssignments) {
    const key = assignment.assignedAt.toISOString()
    const group = eventGroups.get(key) ?? []
    group.push(assignment)
    eventGroups.set(key, group)
  }

  const historicalAssignments = submission.reviewAssignments.map(assignment => ({
    id: assignment.id,
    reviewerId: assignment.reviewerId,
    assignedAt: assignment.assignedAt,
    updatedAt: assignment.updatedAt,
    status: assignment.status
  }))

  const events: SelectionReplayEvent[] = []
  for (const [, assignments] of eventGroups) {
    events.push(
      await buildReplayEvent(
        submission.id,
        submission.userId,
        assignments,
        historicalAssignments
      )
    )
  }

  return {
    submissionId: submission.id,
    selectionLogic: 'Eligible reviewers are ranked by active workload first, then reliability, then total XP.',
    limitations: [
      'Assignment-time workload is reconstructed from historical assignment timestamps.',
      'Historical pause and opt-out state is not versioned, so availability filters use the current stored user settings.',
      'Older assignments created before ranking logic changes may not match the current selector exactly.'
    ],
    events
  }
}
