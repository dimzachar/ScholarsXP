import { compareReviewerPriorityValues } from '@/lib/reviewer-ranking'
import { isAdmin } from '@/lib/roles'

export type ReviewerAnalyticsTimeframe =
  | 'last_7_days'
  | 'last_30_days'
  | 'last_90_days'
  | 'custom_range'
  | 'all_time'

export type ReviewerTrendGranularity = 'day' | 'week' | 'month'

export type ReviewerPoolState =
  | 'eligible'
  | 'temporarily_paused'
  | 'permanently_paused'
  | 'opted_out'
  | 'below_xp_gate'
  | 'at_capacity'

export interface ReviewerTimeframeConfig {
  timeframe: ReviewerAnalyticsTimeframe
  startDate: Date
  endDate: Date
  granularity: ReviewerTrendGranularity
}

export interface ReviewerCurrentSnapshot {
  id: string
  username: string | null
  email: string
  role: string
  totalXp: number
  missedReviews: number
  totalReviewsAllTime: number
  activeAssignmentsNow: number
  reliabilityScore?: number | null
  lastActiveAt?: string | Date | null
  reviewPausedUntil?: string | Date | null
  reviewPausedPermanently?: boolean
  preferences?: unknown
}

export interface ReviewerPeriodSnapshot {
  reviewerId: string
  assignmentsReceived: number
  assignmentsCompleted: number
  assignmentsMissed: number
  assignmentsReassigned: number
  assignmentsOpen: number
  reviewsSubmitted: number
  onTimeReviews: number
  avgHoursToComplete: number | null
  avgQuality: number | null
  avgXpGiven: number | null
  alignedReviews: number
  finalizedReviews: number
  zeroScoreReviews: number
  highScoreReviews: number
}

export interface ReviewerAssignmentTrendSnapshot {
  bucketStart: string | Date
  assignmentsReceived: number
  missedAssignments: number
  uniqueAssignedReviewers: number
}

export interface ReviewerReviewTrendSnapshot {
  bucketStart: string | Date
  reviewsSubmitted: number
  lateReviews: number
}

export interface ReviewerDashboardSummary {
  totalReviewerRoles: number
  eligibleNow: number
  temporarilyPausedNow: number
  permanentlyPausedNow: number
  optedOutNow: number
  belowXpGateNow: number
  atCapacityNow: number
  reviewersAssignedInPeriod: number
  reviewersSubmittingReviewsInPeriod: number
  eligibleWithoutAssignmentsInPeriod: number
  zeroReviewersAllTime: number
  activeAssignmentsNow: number
  totalAssignmentsInPeriod: number
  totalCompletedAssignmentsInPeriod: number
  totalMissedAssignmentsInPeriod: number
  totalReviewsSubmittedInPeriod: number
  avgAssignmentsPerAssignedReviewer: number
  medianAssignmentsPerAssignedReviewer: number
  top3AssignmentSharePct: number
  top5AssignmentSharePct: number
  distributionCoveragePct: number
  underusedReliableCount: number
  highRiskCount: number
}

export interface ReviewerDistributionPoint {
  label: string
  value: number
}

export interface ReviewerTrendPoint {
  bucketStart: string
  assignmentsReceived: number
  reviewsSubmitted: number
  missedAssignments: number
  lateReviews: number
  uniqueAssignedReviewers: number
}

export interface ReviewerDashboardRow {
  id: string
  label: string
  role: string
  email: string
  totalXp: number
  totalReviewsAllTime: number
  missedReviewsLifetime: number
  reliabilityScore: number | null
  activeAssignmentsNow: number
  lastActiveAt: string | null
  daysSinceLastActive: number | null
  reviewerOptOutActive: boolean
  reviewerOptOutUntil: string | null
  currentPoolState: ReviewerPoolState
  currentPoolReasons: string[]
  isEligibleNow: boolean
  currentPriority: number | null
  periodAssignmentsReceived: number
  periodAssignmentsCompleted: number
  periodAssignmentsMissed: number
  periodAssignmentsReassigned: number
  periodAssignmentsOpen: number
  periodReviewsSubmitted: number
  periodAssignmentSharePct: number
  periodOnTimeRatePct: number | null
  periodConsensusAlignmentPct: number | null
  avgHoursToComplete: number | null
  avgQuality: number | null
  avgXpGiven: number | null
  zeroScoreRatePct: number | null
  highScoreRatePct: number | null
}

export interface ReviewerAnalyticsDashboard {
  generatedAt: string
  timeframe: ReviewerAnalyticsTimeframe
  dateRange: {
    start: string
    end: string
  }
  granularity: ReviewerTrendGranularity
  summary: ReviewerDashboardSummary
  currentPoolBreakdown: ReviewerDistributionPoint[]
  assignmentLoadBreakdown: ReviewerDistributionPoint[]
  reliabilityBreakdown: ReviewerDistributionPoint[]
  trends: ReviewerTrendPoint[]
  concentration: ReviewerDashboardRow[]
  insights: {
    nextUp: ReviewerDashboardRow[]
    underusedReliable: ReviewerDashboardRow[]
    heavyLifters: ReviewerDashboardRow[]
    riskWatch: ReviewerDashboardRow[]
  }
  reviewers: ReviewerDashboardRow[]
}

const MIN_REVIEWER_XP = 50
const MAX_ACTIVE_ASSIGNMENTS = 5

export function getReviewerAnalyticsTimeframeConfig(
  timeframe: string | null | undefined,
  customStartDate?: string | null,
  customEndDate?: string | null,
  now: Date = new Date()
): ReviewerTimeframeConfig {
  const normalized: ReviewerAnalyticsTimeframe =
    timeframe === 'last_7_days' ||
    timeframe === 'last_30_days' ||
    timeframe === 'last_90_days' ||
    timeframe === 'custom_range' ||
    timeframe === 'all_time'
      ? timeframe
      : 'last_30_days'

  if (normalized === 'custom_range' && customStartDate && customEndDate) {
    const startDate = new Date(`${customStartDate}T00:00:00.000Z`)
    const endDate = new Date(`${customEndDate}T23:59:59.999Z`)

    if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime()) && startDate <= endDate) {
      const rangeDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000))

      let granularity: ReviewerTrendGranularity = 'day'
      if (rangeDays > 120) {
        granularity = 'month'
      } else if (rangeDays > 21) {
        granularity = 'week'
      }

      return {
        timeframe: normalized,
        startDate,
        endDate,
        granularity
      }
    }
  }

  switch (normalized) {
    case 'last_7_days':
      return {
        timeframe: normalized,
        startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        endDate: now,
        granularity: 'day'
      }
    case 'last_90_days':
      return {
        timeframe: normalized,
        startDate: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000),
        endDate: now,
        granularity: 'week'
      }
    case 'all_time':
      return {
        timeframe: normalized,
        startDate: new Date('2020-01-01T00:00:00.000Z'),
        endDate: now,
        granularity: 'month'
      }
    case 'last_30_days':
    default:
      return {
        timeframe: 'last_30_days',
        startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        endDate: now,
        granularity: 'week'
      }
  }
}

export function getReviewerDisplayName(username: string | null, email: string): string {
  return username || email.split('@')[0] || 'Unknown reviewer'
}

export function parseReviewerOptOutState(
  preferences: unknown,
  now: Date = new Date()
): {
  reviewerOptOutActive: boolean
  reviewerOptOutUntil: string | null
} {
  if (!preferences) {
    return {
      reviewerOptOutActive: false,
      reviewerOptOutUntil: null
    }
  }

  let parsed: Record<string, unknown>

  if (typeof preferences === 'string') {
    try {
      parsed = JSON.parse(preferences)
    } catch {
      return {
        reviewerOptOutActive: false,
        reviewerOptOutUntil: null
      }
    }
  } else {
    parsed = preferences as Record<string, unknown>
  }

  const optOutFlag = parsed.reviewerOptOut === true
  const optOutUntilValue = parsed.reviewerOptOutUntil

  if (optOutFlag) {
    return {
      reviewerOptOutActive: true,
      reviewerOptOutUntil: null
    }
  }

  if (typeof optOutUntilValue === 'string' && optOutUntilValue) {
    const parsedDate = new Date(optOutUntilValue)
    if (!Number.isNaN(parsedDate.getTime()) && parsedDate.getTime() > now.getTime()) {
      return {
        reviewerOptOutActive: true,
        reviewerOptOutUntil: parsedDate.toISOString()
      }
    }
  }

  if (optOutUntilValue instanceof Date && optOutUntilValue.getTime() > now.getTime()) {
    return {
      reviewerOptOutActive: true,
      reviewerOptOutUntil: optOutUntilValue.toISOString()
    }
  }

  return {
    reviewerOptOutActive: false,
    reviewerOptOutUntil: null
  }
}

export function getReviewerPoolStatus(
  reviewer: ReviewerCurrentSnapshot,
  now: Date = new Date()
): {
  state: ReviewerPoolState
  reasons: string[]
  reviewerOptOutActive: boolean
  reviewerOptOutUntil: string | null
} {
  const reasons: string[] = []
  const { reviewerOptOutActive, reviewerOptOutUntil } = parseReviewerOptOutState(reviewer.preferences, now)

  const reviewPausedUntil = reviewer.reviewPausedUntil
    ? new Date(reviewer.reviewPausedUntil)
    : null
  const hasTemporaryStrikePause = Boolean(
    reviewPausedUntil && !Number.isNaN(reviewPausedUntil.getTime()) && reviewPausedUntil.getTime() > now.getTime()
  )

  const hasPermanentPause = reviewer.reviewPausedPermanently === true
  const belowXpGate = reviewer.totalXp < MIN_REVIEWER_XP && !isAdmin(reviewer.role)
  const atCapacity = reviewer.activeAssignmentsNow >= MAX_ACTIVE_ASSIGNMENTS

  if (hasPermanentPause) {
    reasons.push('Permanently banned from reviewing')
  }

  if (hasTemporaryStrikePause) {
    reasons.push(`Paused until ${reviewPausedUntil?.toISOString() ?? ''}`)
  }

  if (reviewerOptOutActive) {
    reasons.push(reviewerOptOutUntil ? `Opted out until ${reviewerOptOutUntil}` : 'Opted out of assignments')
  }

  if (belowXpGate) {
    reasons.push(`Below minimum XP threshold (${reviewer.totalXp}/${MIN_REVIEWER_XP})`)
  }

  if (atCapacity) {
    reasons.push(`At capacity (${reviewer.activeAssignmentsNow}/${MAX_ACTIVE_ASSIGNMENTS} active assignments)`)
  }

  let state: ReviewerPoolState = 'eligible'
  if (hasPermanentPause) {
    state = 'permanently_paused'
  } else if (hasTemporaryStrikePause) {
    state = 'temporarily_paused'
  } else if (reviewerOptOutActive) {
    state = 'opted_out'
  } else if (belowXpGate) {
    state = 'below_xp_gate'
  } else if (atCapacity) {
    state = 'at_capacity'
  }

  return {
    state,
    reasons,
    reviewerOptOutActive,
    reviewerOptOutUntil
  }
}

export function calculateMedian(values: number[]): number {
  if (values.length === 0) {
    return 0
  }

  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }

  return sorted[middle]
}

export function calculateTopShare(values: number[], topN: number): number {
  const total = values.reduce((sum, value) => sum + value, 0)

  if (total <= 0) {
    return 0
  }

  const topValues = [...values]
    .sort((a, b) => b - a)
    .slice(0, topN)

  const topTotal = topValues.reduce((sum, value) => sum + value, 0)
  return (topTotal / total) * 100
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function createTrendMap<T extends { bucketStart: string | Date }>(rows: T[]): Map<string, T> {
  return new Map(rows.map(row => [toIsoString(row.bucketStart), row]))
}

function createRowPreview(row: ReviewerDashboardRow): ReviewerDashboardRow {
  return row
}

function getAssignmentBucketLabel(value: number): string {
  if (value === 0) return '0'
  if (value <= 2) return '1-2'
  if (value <= 5) return '3-5'
  if (value <= 10) return '6-10'
  return '11+'
}

function getReliabilityBucketLabel(value: number | null): string {
  if (value === null || Number.isNaN(value)) return 'Unknown'

  const percent = value * 100
  if (percent < 60) return '<60%'
  if (percent < 70) return '60-69%'
  if (percent < 80) return '70-79%'
  return '80%+'
}

function getPoolStateLabel(state: ReviewerPoolState): string {
  switch (state) {
    case 'eligible':
      return 'Eligible now'
    case 'temporarily_paused':
      return 'Temporary pause'
    case 'permanently_paused':
      return 'Permanent ban'
    case 'opted_out':
      return 'Opted out'
    case 'below_xp_gate':
      return 'Below XP gate'
    case 'at_capacity':
      return 'At capacity'
    default:
      return state
  }
}

function getDaysSince(dateValue: string | Date | null | undefined, now: Date): number | null {
  if (!dateValue) {
    return null
  }

  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
}

function getRiskScore(row: ReviewerDashboardRow): number {
  let score = 0

  switch (row.currentPoolState) {
    case 'permanently_paused':
      score += 100
      break
    case 'temporarily_paused':
      score += 70
      break
    case 'opted_out':
      score += 40
      break
    case 'at_capacity':
      score += 10
      break
    default:
      break
  }

  score += row.periodAssignmentsMissed * 25

  if (row.missedReviewsLifetime >= 4) {
    score += 20
  }

  if (row.periodOnTimeRatePct !== null && row.periodReviewsSubmitted >= 3 && row.periodOnTimeRatePct < 80) {
    score += 15
  }

  return score
}

export function buildReviewerAnalyticsDashboard(input: {
  currentReviewers: ReviewerCurrentSnapshot[]
  periodMetrics: ReviewerPeriodSnapshot[]
  assignmentTrends: ReviewerAssignmentTrendSnapshot[]
  reviewTrends: ReviewerReviewTrendSnapshot[]
  timeframe: ReviewerAnalyticsTimeframe
  dateRange: {
    start: string
    end: string
  }
  granularity: ReviewerTrendGranularity
  generatedAt?: string
  now?: Date
}): ReviewerAnalyticsDashboard {
  const now = input.now ?? new Date()
  const periodMetricMap = new Map(input.periodMetrics.map(metric => [metric.reviewerId, metric]))

  const rows = input.currentReviewers.map((reviewer): ReviewerDashboardRow => {
    const metrics = periodMetricMap.get(reviewer.id)
    const poolStatus = getReviewerPoolStatus(reviewer, now)
    const displayName = getReviewerDisplayName(reviewer.username, reviewer.email)

    const periodAssignmentsReceived = metrics?.assignmentsReceived ?? 0
    const periodReviewsSubmitted = metrics?.reviewsSubmitted ?? 0
    const periodOnTimeRatePct = periodReviewsSubmitted > 0
      ? (100 * (metrics?.onTimeReviews ?? 0)) / periodReviewsSubmitted
      : null
    const periodConsensusAlignmentPct = (metrics?.finalizedReviews ?? 0) > 0
      ? (100 * (metrics?.alignedReviews ?? 0)) / (metrics?.finalizedReviews ?? 0)
      : null
    const zeroScoreRatePct = periodReviewsSubmitted > 0
      ? (100 * (metrics?.zeroScoreReviews ?? 0)) / periodReviewsSubmitted
      : null
    const highScoreRatePct = periodReviewsSubmitted > 0
      ? (100 * (metrics?.highScoreReviews ?? 0)) / periodReviewsSubmitted
      : null

    return {
      id: reviewer.id,
      label: displayName,
      role: reviewer.role,
      email: reviewer.email,
      totalXp: reviewer.totalXp,
      totalReviewsAllTime: reviewer.totalReviewsAllTime,
      missedReviewsLifetime: reviewer.missedReviews,
      reliabilityScore: reviewer.reliabilityScore ?? null,
      activeAssignmentsNow: reviewer.activeAssignmentsNow,
      lastActiveAt: reviewer.lastActiveAt ? new Date(reviewer.lastActiveAt).toISOString() : null,
      daysSinceLastActive: getDaysSince(reviewer.lastActiveAt, now),
      reviewerOptOutActive: poolStatus.reviewerOptOutActive,
      reviewerOptOutUntil: poolStatus.reviewerOptOutUntil,
      currentPoolState: poolStatus.state,
      currentPoolReasons: poolStatus.reasons,
      isEligibleNow: poolStatus.state === 'eligible',
      currentPriority: null,
      periodAssignmentsReceived,
      periodAssignmentsCompleted: metrics?.assignmentsCompleted ?? 0,
      periodAssignmentsMissed: metrics?.assignmentsMissed ?? 0,
      periodAssignmentsReassigned: metrics?.assignmentsReassigned ?? 0,
      periodAssignmentsOpen: metrics?.assignmentsOpen ?? 0,
      periodReviewsSubmitted,
      periodAssignmentSharePct: 0,
      periodOnTimeRatePct,
      periodConsensusAlignmentPct,
      avgHoursToComplete: metrics?.avgHoursToComplete ?? null,
      avgQuality: metrics?.avgQuality ?? null,
      avgXpGiven: metrics?.avgXpGiven ?? null,
      zeroScoreRatePct,
      highScoreRatePct
    }
  })

  const eligibleRows = rows
    .filter(row => row.isEligibleNow)
    .sort((a, b) => compareReviewerPriorityValues(
      {
        activeAssignments: a.activeAssignmentsNow,
        reliabilityScore: a.reliabilityScore,
        totalXp: a.totalXp
      },
      {
        activeAssignments: b.activeAssignmentsNow,
        reliabilityScore: b.reliabilityScore,
        totalXp: b.totalXp
      }
    ))

  eligibleRows.forEach((row, index) => {
    row.currentPriority = index + 1
  })

  const totalAssignmentsInPeriod = rows.reduce((sum, row) => sum + row.periodAssignmentsReceived, 0)
  const totalCompletedAssignmentsInPeriod = rows.reduce((sum, row) => sum + row.periodAssignmentsCompleted, 0)
  const totalMissedAssignmentsInPeriod = rows.reduce((sum, row) => sum + row.periodAssignmentsMissed, 0)
  const totalReviewsSubmittedInPeriod = rows.reduce((sum, row) => sum + row.periodReviewsSubmitted, 0)

  rows.forEach(row => {
    row.periodAssignmentSharePct = totalAssignmentsInPeriod > 0
      ? (100 * row.periodAssignmentsReceived) / totalAssignmentsInPeriod
      : 0
  })

  rows.sort((a, b) => {
    if (a.currentPriority !== null && b.currentPriority !== null) {
      return a.currentPriority - b.currentPriority
    }
    if (a.currentPriority !== null) return -1
    if (b.currentPriority !== null) return 1
    if (a.periodAssignmentsReceived !== b.periodAssignmentsReceived) {
      return b.periodAssignmentsReceived - a.periodAssignmentsReceived
    }
    return (b.reliabilityScore ?? 0) - (a.reliabilityScore ?? 0)
  })

  const assignedCounts = rows
    .map(row => row.periodAssignmentsReceived)
    .filter(count => count > 0)

  const medianAssignmentsPerAssignedReviewer = calculateMedian(assignedCounts)
  const avgAssignmentsPerAssignedReviewer = assignedCounts.length > 0
    ? totalAssignmentsInPeriod / assignedCounts.length
    : 0

  const underuseThreshold = assignedCounts.length > 0
    ? Math.max(1, Math.floor(medianAssignmentsPerAssignedReviewer / 2))
    : 0

  const underusedReliable = rows
    .filter(row =>
      row.isEligibleNow &&
      (row.reliabilityScore ?? 0) >= 0.6 &&
      row.activeAssignmentsNow <= 1 &&
      row.periodAssignmentsReceived <= underuseThreshold
    )
    .sort((a, b) => {
      if (a.periodAssignmentsReceived !== b.periodAssignmentsReceived) {
        return a.periodAssignmentsReceived - b.periodAssignmentsReceived
      }
      if ((a.reliabilityScore ?? 0) !== (b.reliabilityScore ?? 0)) {
        return (b.reliabilityScore ?? 0) - (a.reliabilityScore ?? 0)
      }
      return b.totalXp - a.totalXp
    })
    .slice(0, 8)
    .map(createRowPreview)

  const heavyLifters = rows
    .filter(row => row.periodAssignmentsReceived > 0)
    .sort((a, b) => {
      if (a.periodAssignmentsReceived !== b.periodAssignmentsReceived) {
        return b.periodAssignmentsReceived - a.periodAssignmentsReceived
      }
      if (a.periodReviewsSubmitted !== b.periodReviewsSubmitted) {
        return b.periodReviewsSubmitted - a.periodReviewsSubmitted
      }
      return b.activeAssignmentsNow - a.activeAssignmentsNow
    })
    .slice(0, 8)
    .map(createRowPreview)

  const riskWatch = rows
    .filter(row => getRiskScore(row) > 0)
    .sort((a, b) => {
      const riskDelta = getRiskScore(b) - getRiskScore(a)
      if (riskDelta !== 0) {
        return riskDelta
      }
      if (a.periodAssignmentsMissed !== b.periodAssignmentsMissed) {
        return b.periodAssignmentsMissed - a.periodAssignmentsMissed
      }
      return b.missedReviewsLifetime - a.missedReviewsLifetime
    })
    .slice(0, 8)
    .map(createRowPreview)

  const nextUp = eligibleRows
    .slice(0, 8)
    .map(createRowPreview)

  const currentPoolBreakdown = ([
    'eligible',
    'temporarily_paused',
    'permanently_paused',
    'opted_out',
    'below_xp_gate',
    'at_capacity'
  ] as ReviewerPoolState[]).map(state => ({
    label: getPoolStateLabel(state),
    value: rows.filter(row => row.currentPoolState === state).length
  }))

  const assignmentLoadBuckets = ['0', '1-2', '3-5', '6-10', '11+']
  const assignmentLoadBreakdown = assignmentLoadBuckets.map(label => ({
    label,
    value: rows.filter(row => getAssignmentBucketLabel(row.periodAssignmentsReceived) === label).length
  }))

  const reliabilityBuckets = ['Unknown', '<60%', '60-69%', '70-79%', '80%+']
  const reliabilityBreakdown = reliabilityBuckets.map(label => ({
    label,
    value: rows.filter(row => getReliabilityBucketLabel(row.reliabilityScore) === label).length
  }))

  const assignmentTrendMap = createTrendMap(input.assignmentTrends)
  const reviewTrendMap = createTrendMap(input.reviewTrends)
  const trendKeys = Array.from(new Set([
    ...assignmentTrendMap.keys(),
    ...reviewTrendMap.keys()
  ])).sort()

  const trends = trendKeys.map(bucketStart => {
    const assignmentTrend = assignmentTrendMap.get(bucketStart)
    const reviewTrend = reviewTrendMap.get(bucketStart)

    return {
      bucketStart,
      assignmentsReceived: assignmentTrend?.assignmentsReceived ?? 0,
      reviewsSubmitted: reviewTrend?.reviewsSubmitted ?? 0,
      missedAssignments: assignmentTrend?.missedAssignments ?? 0,
      lateReviews: reviewTrend?.lateReviews ?? 0,
      uniqueAssignedReviewers: assignmentTrend?.uniqueAssignedReviewers ?? 0
    }
  })

  const eligibleReviewersNow = rows.filter(row => row.isEligibleNow)
  const eligibleReviewersAssignedInPeriod = eligibleReviewersNow.filter(
    row => row.periodAssignmentsReceived > 0
  )

  const summary: ReviewerDashboardSummary = {
    totalReviewerRoles: rows.length,
    eligibleNow: currentPoolBreakdown.find(item => item.label === 'Eligible now')?.value ?? 0,
    temporarilyPausedNow: currentPoolBreakdown.find(item => item.label === 'Temporary pause')?.value ?? 0,
    permanentlyPausedNow: currentPoolBreakdown.find(item => item.label === 'Permanent ban')?.value ?? 0,
    optedOutNow: currentPoolBreakdown.find(item => item.label === 'Opted out')?.value ?? 0,
    belowXpGateNow: currentPoolBreakdown.find(item => item.label === 'Below XP gate')?.value ?? 0,
    atCapacityNow: currentPoolBreakdown.find(item => item.label === 'At capacity')?.value ?? 0,
    reviewersAssignedInPeriod: rows.filter(row => row.periodAssignmentsReceived > 0).length,
    reviewersSubmittingReviewsInPeriod: rows.filter(row => row.periodReviewsSubmitted > 0).length,
    eligibleWithoutAssignmentsInPeriod: rows.filter(row => row.isEligibleNow && row.periodAssignmentsReceived === 0).length,
    zeroReviewersAllTime: rows.filter(row => row.totalReviewsAllTime === 0).length,
    activeAssignmentsNow: rows.reduce((sum, row) => sum + row.activeAssignmentsNow, 0),
    totalAssignmentsInPeriod,
    totalCompletedAssignmentsInPeriod,
    totalMissedAssignmentsInPeriod,
    totalReviewsSubmittedInPeriod,
    avgAssignmentsPerAssignedReviewer,
    medianAssignmentsPerAssignedReviewer,
    top3AssignmentSharePct: calculateTopShare(rows.map(row => row.periodAssignmentsReceived), 3),
    top5AssignmentSharePct: calculateTopShare(rows.map(row => row.periodAssignmentsReceived), 5),
    distributionCoveragePct: eligibleReviewersNow.length > 0
      ? (100 * eligibleReviewersAssignedInPeriod.length) / eligibleReviewersNow.length
      : 0,
    underusedReliableCount: underusedReliable.length,
    highRiskCount: riskWatch.length
  }

  const concentration = rows
    .filter(row => row.periodAssignmentsReceived > 0)
    .sort((a, b) => b.periodAssignmentsReceived - a.periodAssignmentsReceived)
    .slice(0, 10)
    .map(createRowPreview)

  return {
    generatedAt: input.generatedAt ?? now.toISOString(),
    timeframe: input.timeframe,
    dateRange: input.dateRange,
    granularity: input.granularity,
    summary,
    currentPoolBreakdown,
    assignmentLoadBreakdown,
    reliabilityBreakdown,
    trends,
    concentration,
    insights: {
      nextUp,
      underusedReliable,
      heavyLifters,
      riskWatch
    },
    reviewers: rows
  }
}
