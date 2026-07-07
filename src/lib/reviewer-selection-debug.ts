import { prisma } from '@/lib/prisma'
import { REVIEWER_ROLES, isAdmin } from '@/lib/roles'
import { reliabilityService } from '@/lib/reliability/reliability-service'
import { compareReviewerPriorityValues } from '@/lib/reviewer-ranking'
import {
  buildA3ReassignmentTiers,
  buildGenericPoolGroups,
  buildO3ReplayBands,
  buildO3ReplaySeatPicks,
  getReviewerAssignmentModeDescription,
  getReviewerAssignmentSelectionMode,
  type ReplayBand,
  type ReviewerAssignmentSelectionMode
} from '@/lib/reviewer-assignment-ui'
import { getActiveFairnessAlgorithm } from '@/lib/reviewer-fairness-algorithms'
import { getHistoricalPenaltyCheck, getHistoricalRecentAssignmentCounts } from '@/lib/reviewer-pool-reconstruction'

const MIN_REVIEWER_XP = 50
const MAX_ACTIVE_ASSIGNMENTS = 5

type HistoricalAssignmentCount = {
  reviewerId: string
  activeAssignments: number
}

export interface SelectionReplayCandidate {
  id: string
  username: string
  email: string
  role: string
  totalXp: number
  reliabilityScore: number
  activeAssignmentsBefore: number
  recentAssignmentsBefore?: number
  missedReviews?: number
  hasPenalties?: boolean
  currentAssignmentStatus?: string
  selected: boolean
  inPool: boolean
  priority?: number
  reasons: string[]
}

export interface SelectionReplayEvent {
  key: string
  assignedAt: string
  algorithmId: string
  selectionMode: ReviewerAssignmentSelectionMode
  isReassignment: boolean
  selectedCount: number
  selectedReviewerIds: string[]
  selectedAssignments: Array<{
    assignmentId: string
    reviewerId: string
    reviewerName: string
    status: string
  }>
  baselineOrderedPool: SelectionReplayCandidate[]
  bands: ReplayBand<SelectionReplayCandidate>[]
  seatPicks: Array<{
    seat: number
    label: string
    bandKey: string
    reviewerId: string | null
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
      AND (
        "status" IN ('PENDING', 'IN_PROGRESS')
        OR ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "completedAt" > ${targetTime})
        OR ("status" IN ('MISSED', 'REASSIGNED') AND "updatedAt" > ${targetTime})
      )
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

  const reliabilityMap = await reliabilityService.getReliabilityScores(reviewerIds, targetTime)
  return new Map(
    reviewerIds.map(reviewerId => [
      reviewerId,
      reliabilityMap.get(reviewerId)?.score ?? 0
    ])
  )
}

function isReassignmentEvent(
  eventAssignments: Array<{ status: string }>,
  allAssignments: Array<{ status: string; updatedAt: Date }>,
  targetTime: Date
): boolean {
  if (eventAssignments.some(assignment => assignment.status === 'REASSIGNED')) {
    return true
  }

  const reassignmentWindowMs = 10_000
  return allAssignments.some(assignment => {
    if (assignment.status !== 'REASSIGNED') {
      return false
    }

    const deltaMs = Math.abs(assignment.updatedAt.getTime() - targetTime.getTime())
    return deltaMs <= reassignmentWindowMs
  })
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
      missedReviews: true,
      preferences: true,
      reviewPausedUntil: true,
      reviewPausedPermanently: true
    }
  })

  const reviewerIds = reviewers.map(reviewer => reviewer.id)
  const algorithmId = getActiveFairnessAlgorithm()
  const isReassignment = isReassignmentEvent(eventAssignments, allAssignments, targetTime)
  const selectionMode = getReviewerAssignmentSelectionMode(algorithmId, isReassignment)
  const [activeAssignmentCounts, reliabilityScores, recentAssignmentCounts, penaltyChecks] = await Promise.all([
    getHistoricalActiveAssignmentCounts(reviewerIds, targetTime),
    getHistoricalReliabilityScores(reviewerIds, targetTime),
    getHistoricalRecentAssignmentCounts(reviewerIds, targetTime),
    getHistoricalPenaltyCheck(reviewerIds, targetTime)
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
      recentAssignmentsBefore: recentAssignmentCounts.get(reviewer.id) ?? 0,
      missedReviews: reviewer.missedReviews,
      hasPenalties: penaltyChecks.get(reviewer.id) ?? false,
      currentAssignmentStatus: selectedStatusMap.get(reviewer.id),
      selected: eventSelectedIds.has(reviewer.id),
      inPool: reasons.length === 0,
      reasons
    }
  })

  const rankedPool = candidates
    .filter(candidate => candidate.inPool)
    .sort((a, b) => {
      return compareReviewerPriorityValues(
        {
          activeAssignments: a.activeAssignmentsBefore,
          reliabilityScore: a.reliabilityScore,
          totalXp: a.totalXp
        },
        {
          activeAssignments: b.activeAssignmentsBefore,
          reliabilityScore: b.reliabilityScore,
          totalXp: b.totalXp
        }
      )
    })
    .map((candidate, index) => ({
      ...candidate,
      priority: index + 1
    }))

  const rankedPoolMap = new Map(rankedPool.map(candidate => [candidate.id, candidate.priority]))
  const baselineOrderedPool = rankedPool
  const a3ReplayPool = baselineOrderedPool.map(candidate => ({
    ...candidate,
    activeAssignments: candidate.activeAssignmentsBefore
  }))
  const genericReplayPool = baselineOrderedPool.map(candidate => ({
    ...candidate,
    activeAssignments: candidate.activeAssignmentsBefore
  }))
  const bands: ReplayBand<SelectionReplayCandidate>[] =
    selectionMode === 'o3_initial'
      ? buildO3ReplayBands(baselineOrderedPool, submissionId, eventAssignments.length)
      : selectionMode === 'a3_reassignment'
        ? buildA3ReassignmentTiers(a3ReplayPool, recentAssignmentCounts)
        : selectionMode === 'generic_fairness'
          ? buildGenericPoolGroups(genericReplayPool)
          : []
  const seatPicks =
    selectionMode === 'o3_initial'
      ? buildO3ReplaySeatPicks(baselineOrderedPool, submissionId, eventAssignments.length)
      : []
  const seatByReviewerId = new Map(
    seatPicks
      .filter(pick => pick.reviewerId)
      .map(pick => [pick.reviewerId as string, pick.seat])
  )
  const selectedAssignments = [...eventAssignments]
    .sort((a, b) => {
      const aSeat = seatByReviewerId.get(a.reviewerId) ?? Number.MAX_SAFE_INTEGER
      const bSeat = seatByReviewerId.get(b.reviewerId) ?? Number.MAX_SAFE_INTEGER
      if (aSeat !== bSeat) {
        return Number(aSeat) - Number(bSeat)
      }
      return a.reviewerId.localeCompare(b.reviewerId)
    })
    .map(assignment => ({
      assignmentId: assignment.id,
      reviewerId: assignment.reviewerId,
      reviewerName: assignment.reviewer.username || assignment.reviewer.email.split('@')[0],
      status: assignment.status
    }))

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

  const selectionLogic = getReviewerAssignmentModeDescription(selectionMode)

  return {
    key: `${submissionId}:${targetTime.toISOString()}`,
    assignedAt: targetTime.toISOString(),
    algorithmId,
    selectionMode,
    isReassignment,
    selectedCount: eventAssignments.length,
    selectedReviewerIds: eventAssignments.map(assignment => assignment.reviewerId),
    selectedAssignments,
    baselineOrderedPool,
    bands,
    seatPicks,
    candidates: mergedCandidates,
    poolSize: rankedPool.length,
    limitations: [
      `Assignment used ${algorithmId === 'baseline' ? 'the baseline queue selector' : selectionLogic.toLowerCase()}.`,
      'Workload is reconstructed at assignment time from review assignment timestamps.',
      'Historical pause and opt-out state is approximated from current user settings because pause snapshots are not stored.',
      'Reliability is replayed with the current active formula using review, vote validation, accuracy, and penalty history available up to that assignment time; user-level missed-review counters use the current stored value because historical counter snapshots are not stored.'
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

  const algorithmId = getActiveFairnessAlgorithm()
  const selectionMode = getReviewerAssignmentSelectionMode(algorithmId)

  return {
    submissionId: submission.id,
    selectionLogic: getReviewerAssignmentModeDescription(selectionMode),
    limitations: [
      'Assignment-time workload is reconstructed from historical assignment timestamps.',
      'Historical pause and opt-out state is not versioned, so availability filters use the current stored user settings.',
      'Older assignments created before ranking logic changes may not match the current selector exactly.'
    ],
    events
  }
}
