import { hashCode, passesProvenBadFilter, type AlgorithmId } from '@/lib/reviewer-fairness-algorithms'
import { compareReviewerPriorityValues } from '@/lib/reviewer-ranking'

export type ReviewerAssignmentUiMode = 'baseline' | 'fairness' | 'generic'

export type ReviewerAssignmentSelectionMode =
  | 'baseline'
  | 'o3_initial'
  | 'a3_reassignment'
  | 'generic_fairness'

export interface ReplayBand<T = { id: string }> {
  key: string
  label: string
  description: string
  candidates: T[]
  candidateIds: string[]
}

export interface ReplaySeatPick {
  seat: number
  label: string
  bandKey: string
  reviewerId: string | null
}

interface PriorityReviewerSnapshot {
  id: string
  activeAssignments?: number | null
  totalXp: number
  metrics?: {
    reliabilityScore?: number | null
  }
}

interface A3ReviewerSnapshot {
  id: string
  activeAssignments?: number | null
  totalXp: number
  recentAssignments?: number
  metrics?: {
    reliabilityScore?: number | null
  }
}

interface O3ReplayCandidate {
  id: string
  missedReviews?: number | null
  hasPenalties?: boolean | null
}

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  count === 1 ? singular : plural

export function getReviewerAssignmentUiMode(
  algorithmId?: AlgorithmId | string | null
): ReviewerAssignmentUiMode {
  if (algorithmId === 'baseline') {
    return 'baseline'
  }

  if (algorithmId === 'o3_a3_combined') {
    return 'fairness'
  }

  if (algorithmId === 'o3_a3_recent_penalty_cooldown') {
    return 'fairness'
  }

  return 'generic'
}

export function getReviewerAssignmentSelectionMode(
  algorithmId?: AlgorithmId | string | null,
  isReassignment = false
): ReviewerAssignmentSelectionMode {
  if (algorithmId === 'baseline') {
    return 'baseline'
  }

  if (algorithmId === 'o3_a3_combined') {
    return isReassignment ? 'a3_reassignment' : 'o3_initial'
  }

  if (algorithmId === 'o3_a3_recent_penalty_cooldown') {
    return isReassignment ? 'a3_reassignment' : 'o3_initial'
  }

  return 'generic_fairness'
}

export function getReviewerAssignmentModeLabel(
  mode: ReviewerAssignmentUiMode | ReviewerAssignmentSelectionMode
): string {
  switch (mode) {
    case 'baseline':
      return 'Baseline queue'
    case 'fairness':
    case 'o3_initial':
    case 'a3_reassignment':
    case 'generic_fairness':
      return 'Fairness selector'
    case 'generic':
      return 'Eligible pool'
  }
}

export function getReviewerAssignmentModeDescription(
  mode: ReviewerAssignmentUiMode | ReviewerAssignmentSelectionMode
): string {
  switch (mode) {
    case 'baseline':
      return 'Deterministic top-N slice by workload, reliability, and XP.'
    case 'fairness':
    case 'o3_initial':
      return 'O3 chooses reviewers from submission-seeded fairness bands rather than a single strict queue.'
    case 'a3_reassignment':
      return '3A prefers underused reviewers within the same active-assignment tier.'
    case 'generic_fairness':
    case 'generic':
      return 'Queue-style rank is not shown because this algorithm is not a strict ordered queue.'
  }
}

export function buildBaselineQueueViewModel<T extends PriorityReviewerSnapshot>(
  reviewers: T[]
): {
  rankedReviewers: Array<T & { rank: number }>
  buckets: Array<{ activeAssignments: number; reviewers: Array<T & { rank: number }> }>
} {
  const rankedReviewers = [...reviewers]
    .sort((a, b) =>
      compareReviewerPriorityValues(
        {
          activeAssignments: a.activeAssignments,
          reliabilityScore: a.metrics?.reliabilityScore,
          totalXp: a.totalXp
        },
        {
          activeAssignments: b.activeAssignments,
          reliabilityScore: b.metrics?.reliabilityScore,
          totalXp: b.totalXp
        }
      )
    )
    .map((reviewer, index) => ({ ...reviewer, rank: index + 1 }))

  const bucketMap = rankedReviewers.reduce((acc, reviewer) => {
    const activeAssignments = reviewer.activeAssignments ?? 0
    const bucket = acc.get(activeAssignments) ?? []
    bucket.push(reviewer)
    acc.set(activeAssignments, bucket)
    return acc
  }, new Map<number, Array<T & { rank: number }>>())

  const buckets = Array.from(bucketMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([activeAssignments, reviewersInBucket]) => ({ activeAssignments, reviewers: reviewersInBucket }))

  return { rankedReviewers, buckets }
}

export function buildAvailabilityFairnessBands<T extends PriorityReviewerSnapshot>(
  reviewers: T[]
): ReplayBand<T>[] {
  const rankedReviewers = [...reviewers].sort((a, b) =>
    compareReviewerPriorityValues(
      {
        activeAssignments: a.activeAssignments,
        reliabilityScore: a.metrics?.reliabilityScore,
        totalXp: a.totalXp
      },
      {
        activeAssignments: b.activeAssignments,
        reliabilityScore: b.metrics?.reliabilityScore,
        totalXp: b.totalXp
      }
    )
  )

  const seat1 = rankedReviewers.slice(0, 2)
  const remainingAfterSeat1 = rankedReviewers.slice(seat1.length)
  const seat2 = remainingAfterSeat1.slice(0, 5)
  const fairnessBand = remainingAfterSeat1.slice(seat2.length)

  const bands: ReplayBand<T>[] = []

  if (seat1.length > 0) {
    bands.push({
      key: 'o3-seat-1',
      label: 'Seat 1 band',
      description: 'Seat 1 is chosen from the top-2 baseline-ordered reviewers.',
      candidates: seat1,
      candidateIds: seat1.map(reviewer => reviewer.id)
    })
  }

  if (seat2.length > 0) {
    bands.push({
      key: 'o3-seat-2',
      label: 'Seat 2 band',
      description: 'Seat 2 is chosen from the top-5 remaining baseline-ordered reviewers.',
      candidates: seat2,
      candidateIds: seat2.map(reviewer => reviewer.id)
    })
  }

  if (fairnessBand.length > 0) {
    bands.push({
      key: 'o3-fairness-band',
      label: 'Fairness band',
      description: 'Seat 3+ is chosen from the remaining fairness band.',
      candidates: fairnessBand,
      candidateIds: fairnessBand.map(reviewer => reviewer.id)
    })
  }

  return bands
}

export function buildO3ReplayBands<T extends O3ReplayCandidate>(
  baselineOrderedPool: T[],
  submissionId: string,
  selectedCount = 3
): ReplayBand<T>[] {
  return buildO3ReplayTrace(baselineOrderedPool, submissionId, selectedCount).bands
}

export function buildO3ReplaySeatPicks<T extends O3ReplayCandidate>(
  baselineOrderedPool: T[],
  submissionId: string,
  selectedCount = 3
): ReplaySeatPick[] {
  return buildO3ReplayTrace(baselineOrderedPool, submissionId, selectedCount).seatPicks
}

export function getO3ReplayCandidateSelectionLabel(
  reviewerId: string,
  bandKey: ReplaySeatPick['bandKey'],
  seatPicks: ReplaySeatPick[] = []
): string | null {
  const pick = seatPicks.find(item => item.reviewerId === reviewerId)
  if (!pick) {
    return null
  }

  if (pick.bandKey === bandKey) {
    return `Seat ${pick.seat} pick`
  }

  return `Selected later (Seat ${pick.seat})`
}

export function getO3ReplayBandDisplayCandidates<T extends { id: string }>(
  candidates: T[],
  bandKey: ReplaySeatPick['bandKey'],
  seatPicks: ReplaySeatPick[] = [],
  limit = 8
): T[] {
  const cappedLimit = Math.max(limit, 1)
  const preview = candidates.slice(0, cappedLimit)
  const selectedLaterCandidates = seatPicks
    .filter(pick => pick.bandKey === bandKey && pick.reviewerId)
    .map(pick => candidates.find(candidate => candidate.id === pick.reviewerId))
    .filter((candidate): candidate is T => Boolean(candidate))
    .filter(candidate => !preview.some(previewCandidate => previewCandidate.id === candidate.id))

  if (selectedLaterCandidates.length === 0) {
    return preview
  }

  if (preview.length < cappedLimit) {
    return [...preview, ...selectedLaterCandidates].slice(0, cappedLimit)
  }

  const slotsToKeep = Math.max(cappedLimit - selectedLaterCandidates.length, 0)
  return [...preview.slice(0, slotsToKeep), ...selectedLaterCandidates].slice(0, cappedLimit)
}

export function getO3ReplayBandOrderLabel(
  bandKey: ReplaySeatPick['bandKey'],
  index: number
): string {
  const prefix = bandKey === 'o3-seat-1'
    ? 'In seat-1 band'
    : bandKey === 'o3-seat-2'
      ? 'In seat-2 band'
      : 'In fairness band'

  return `${prefix} · Order ${index + 1}`
}

function buildO3ReplayTrace<T extends O3ReplayCandidate>(
  baselineOrderedPool: T[],
  submissionId: string,
  selectedCount = 3
): {
  bands: ReplayBand<T>[]
  seatPicks: ReplaySeatPick[]
} {
  const bands: ReplayBand<T>[] = []
  const seatPicks: ReplaySeatPick[] = []
  const reviewerCount = Math.min(Math.max(selectedCount, 0), baselineOrderedPool.length)

  if (reviewerCount === 0) {
    return { bands, seatPicks }
  }

  const selectedIds = new Set<string>()

  const seat1Band = baselineOrderedPool.slice(0, Math.min(2, baselineOrderedPool.length))
  if (seat1Band.length > 0) {
    bands.push({
      key: 'o3-seat-1',
      label: 'Seat 1: top-2 band',
      description: 'The first pick is a submission-seeded hash draw from the top two reviewers in the baseline ordering.',
      candidates: seat1Band,
      candidateIds: seat1Band.map(reviewer => reviewer.id)
    })

    const seat1Hash = hashCode(submissionId + 'seat1')
    const seat1Pick = seat1Band[seat1Hash % seat1Band.length]
    selectedIds.add(seat1Pick.id)
    seatPicks.push({
      seat: 1,
      label: `Seat 1 (${seat1Hash}-seeded)`,
      bandKey: 'o3-seat-1',
      reviewerId: seat1Pick.id
    })
  }

  if (reviewerCount >= 2) {
    const seat2Band = baselineOrderedPool
      .filter(reviewer => !selectedIds.has(reviewer.id))
      .slice(0, 5)

    if (seat2Band.length > 0) {
      bands.push({
        key: 'o3-seat-2',
        label: 'Seat 2: top-5 remaining band',
        description: 'The second pick is a submission-seeded hash draw from up to five remaining reviewers after the actual seat 1 winner is removed.',
        candidates: seat2Band,
        candidateIds: seat2Band.map(reviewer => reviewer.id)
      })

      const seat2Hash = hashCode(submissionId + 'seat2')
      const seat2Pick = seat2Band[seat2Hash % seat2Band.length]
      selectedIds.add(seat2Pick.id)
      seatPicks.push({
        seat: 2,
        label: `Seat 2 (${seat2Hash}-seeded)`,
        bandKey: 'o3-seat-2',
        reviewerId: seat2Pick.id
      })
    }
  }

  if (reviewerCount >= 3) {
    const fairnessBand = baselineOrderedPool.filter(reviewer => !selectedIds.has(reviewer.id))
    if (fairnessBand.length > 0) {
      bands.push({
        key: 'o3-fairness-band',
        label: 'Seat 3+: remaining fairness band',
        description: 'Seat 3 and beyond are submission-seeded hash draws from whoever remains after seats 1 and 2. When possible, the pool is first narrowed to reviewers who pass the proven-bad filter; otherwise it falls back to the full remaining pool.',
        candidates: fairnessBand,
        candidateIds: fairnessBand.map(reviewer => reviewer.id)
      })
    }

    for (let seat = 3; seat <= reviewerCount; seat++) {
      const remaining = baselineOrderedPool.filter(reviewer => !selectedIds.has(reviewer.id))
      if (remaining.length === 0) {
        break
      }

      const filtered = remaining.filter(reviewer => passesProvenBadFilter({
        id: reviewer.id,
        activeAssignments: 0,
        reliabilityScore: 0,
        totalXp: 0,
        missedReviews: reviewer.missedReviews ?? 0,
        hasPenalties: reviewer.hasPenalties ?? false,
      }))
      const effectiveBand = filtered.length > 0 ? filtered : remaining
      const seatHash = hashCode(submissionId + `seat${seat}`)
      const pick = effectiveBand[seatHash % effectiveBand.length]
      selectedIds.add(pick.id)
      seatPicks.push({
        seat,
        label: `Seat ${seat} (${seatHash}-seeded)`,
        bandKey: 'o3-fairness-band',
        reviewerId: pick.id
      })
    }
  }

  return { bands, seatPicks }
}

export function buildA3ReassignmentTiers<T extends A3ReviewerSnapshot>(
  reviewers: T[],
  recentAssignmentCounts: Map<string, number> = new Map()
): ReplayBand<T>[] {
  const sortedReviewers = [...reviewers].sort((a, b) => {
    const activeDiff = (a.activeAssignments ?? 0) - (b.activeAssignments ?? 0)
    if (activeDiff !== 0) return activeDiff

    const aRecent = recentAssignmentCounts.get(a.id) ?? a.recentAssignments ?? 0
    const bRecent = recentAssignmentCounts.get(b.id) ?? b.recentAssignments ?? 0
    if (aRecent !== bRecent) return aRecent - bRecent

    const reliabilityDiff = (b.metrics?.reliabilityScore ?? 0) - (a.metrics?.reliabilityScore ?? 0)
    if (reliabilityDiff !== 0) return reliabilityDiff

    return b.totalXp - a.totalXp
  })

  const tierMap = sortedReviewers.reduce((acc, reviewer) => {
    const activeAssignments = reviewer.activeAssignments ?? 0
    const bucket = acc.get(activeAssignments) ?? []
    bucket.push(reviewer)
    acc.set(activeAssignments, bucket)
    return acc
  }, new Map<number, T[]>())

  return Array.from(tierMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([activeAssignments, candidates]) => ({
      key: `a3-tier-${activeAssignments}`,
      label: `${activeAssignments} active ${pluralize(activeAssignments, 'assignment')}`,
      description:
        '3A prefers reviewers with fewer recent assignments inside this active-assignment tier, then applies reliability and XP tie-breakers.',
      candidates,
      candidateIds: candidates.map(reviewer => reviewer.id)
    }))
}

export function buildGenericPoolGroups<T extends { id: string; activeAssignments?: number | null }>(
  reviewers: T[]
): ReplayBand<T>[] {
  const sortedReviewers = [...reviewers].sort((a, b) => (a.activeAssignments ?? 0) - (b.activeAssignments ?? 0))
  const groupMap = sortedReviewers.reduce((acc, reviewer) => {
    const activeAssignments = reviewer.activeAssignments ?? 0
    const bucket = acc.get(activeAssignments) ?? []
    bucket.push(reviewer)
    acc.set(activeAssignments, bucket)
    return acc
  }, new Map<number, T[]>())

  return Array.from(groupMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([activeAssignments, candidates]) => ({
      key: `generic-pool-${activeAssignments}`,
      label: `${activeAssignments} active ${pluralize(activeAssignments, 'assignment')}`,
      description: 'Eligible reviewers grouped by current active workload for context only.',
      candidates,
      candidateIds: candidates.map(reviewer => reviewer.id)
    }))
}
