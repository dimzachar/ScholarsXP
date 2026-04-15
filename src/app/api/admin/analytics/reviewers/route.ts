import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'
import { REVIEWER_ROLES } from '@/lib/roles'
import { reliabilityService } from '@/lib/reliability/reliability-service'
import {
  buildReviewerAnalyticsDashboard,
  getReviewerAnalyticsTimeframeConfig,
  type ReviewerAssignmentTrendSnapshot,
  type ReviewerCurrentSnapshot,
  type ReviewerPeriodSnapshot,
  type ReviewerReviewTrendSnapshot
} from '@/lib/reviewer-dashboard'

type AssignmentAggregateRow = {
  reviewerId: string
  assignmentsReceived: number | bigint
  assignmentsCompleted: number | bigint
  assignmentsMissed: number | bigint
  assignmentsReassigned: number | bigint
  assignmentsOpen: number | bigint
  avgHoursToComplete: number | string | null
}

type ReviewAggregateRow = {
  reviewerId: string
  reviewsSubmitted: number | bigint
  onTimeReviews: number | bigint
  avgQuality: number | string | null
  avgXpGiven: number | string | null
  alignedReviews: number | bigint
  finalizedReviews: number | bigint
  zeroScoreReviews: number | bigint
  highScoreReviews: number | bigint
}

type AssignmentTrendRow = {
  bucketStart: Date
  assignmentsReceived: number | bigint
  missedAssignments: number | bigint
  uniqueAssignedReviewers: number | bigint
}

type ReviewTrendRow = {
  bucketStart: Date
  reviewsSubmitted: number | bigint
  lateReviews: number | bigint
}

function toNumber(value: string | number | bigint | null | undefined): number {
  if (value === null || value === undefined) {
    return 0
  }

  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'bigint') {
    return Number(value)
  }

  const parsed = Number(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

async function getAssignmentTrends(
  reviewerIds: string[],
  startDate: Date,
  endDate: Date,
  granularity: 'day' | 'week' | 'month'
): Promise<ReviewerAssignmentTrendSnapshot[]> {
  if (reviewerIds.length === 0) {
    return []
  }

  let rows: AssignmentTrendRow[]

  switch (granularity) {
    case 'day':
      rows = await prisma.$queryRaw<AssignmentTrendRow[]>`
        SELECT
          date_trunc('day', ra."assignedAt") AS "bucketStart",
          COUNT(*)::int AS "assignmentsReceived",
          COUNT(*) FILTER (WHERE ra.status = 'MISSED')::int AS "missedAssignments",
          COUNT(DISTINCT ra."reviewerId")::int AS "uniqueAssignedReviewers"
        FROM "ReviewAssignment" ra
        WHERE ra."reviewerId" = ANY(${reviewerIds}::uuid[])
          AND ra."assignedAt" >= ${startDate}
          AND ra."assignedAt" <= ${endDate}
        GROUP BY 1
        ORDER BY 1 ASC
      `
      break
    case 'month':
      rows = await prisma.$queryRaw<AssignmentTrendRow[]>`
        SELECT
          date_trunc('month', ra."assignedAt") AS "bucketStart",
          COUNT(*)::int AS "assignmentsReceived",
          COUNT(*) FILTER (WHERE ra.status = 'MISSED')::int AS "missedAssignments",
          COUNT(DISTINCT ra."reviewerId")::int AS "uniqueAssignedReviewers"
        FROM "ReviewAssignment" ra
        WHERE ra."reviewerId" = ANY(${reviewerIds}::uuid[])
          AND ra."assignedAt" >= ${startDate}
          AND ra."assignedAt" <= ${endDate}
        GROUP BY 1
        ORDER BY 1 ASC
      `
      break
    case 'week':
    default:
      rows = await prisma.$queryRaw<AssignmentTrendRow[]>`
        SELECT
          date_trunc('week', ra."assignedAt") AS "bucketStart",
          COUNT(*)::int AS "assignmentsReceived",
          COUNT(*) FILTER (WHERE ra.status = 'MISSED')::int AS "missedAssignments",
          COUNT(DISTINCT ra."reviewerId")::int AS "uniqueAssignedReviewers"
        FROM "ReviewAssignment" ra
        WHERE ra."reviewerId" = ANY(${reviewerIds}::uuid[])
          AND ra."assignedAt" >= ${startDate}
          AND ra."assignedAt" <= ${endDate}
        GROUP BY 1
        ORDER BY 1 ASC
      `
      break
  }

  return rows.map(row => ({
    bucketStart: row.bucketStart,
    assignmentsReceived: toNumber(row.assignmentsReceived),
    missedAssignments: toNumber(row.missedAssignments),
    uniqueAssignedReviewers: toNumber(row.uniqueAssignedReviewers)
  }))
}

async function getReviewTrends(
  reviewerIds: string[],
  startDate: Date,
  endDate: Date,
  granularity: 'day' | 'week' | 'month'
): Promise<ReviewerReviewTrendSnapshot[]> {
  if (reviewerIds.length === 0) {
    return []
  }

  let rows: ReviewTrendRow[]

  switch (granularity) {
    case 'day':
      rows = await prisma.$queryRaw<ReviewTrendRow[]>`
        SELECT
          date_trunc('day', pr."createdAt") AS "bucketStart",
          COUNT(*)::int AS "reviewsSubmitted",
          COUNT(*) FILTER (WHERE pr."isLate" = true)::int AS "lateReviews"
        FROM "PeerReview" pr
        WHERE pr."reviewerId" = ANY(${reviewerIds}::uuid[])
          AND pr."createdAt" >= ${startDate}
          AND pr."createdAt" <= ${endDate}
        GROUP BY 1
        ORDER BY 1 ASC
      `
      break
    case 'month':
      rows = await prisma.$queryRaw<ReviewTrendRow[]>`
        SELECT
          date_trunc('month', pr."createdAt") AS "bucketStart",
          COUNT(*)::int AS "reviewsSubmitted",
          COUNT(*) FILTER (WHERE pr."isLate" = true)::int AS "lateReviews"
        FROM "PeerReview" pr
        WHERE pr."reviewerId" = ANY(${reviewerIds}::uuid[])
          AND pr."createdAt" >= ${startDate}
          AND pr."createdAt" <= ${endDate}
        GROUP BY 1
        ORDER BY 1 ASC
      `
      break
    case 'week':
    default:
      rows = await prisma.$queryRaw<ReviewTrendRow[]>`
        SELECT
          date_trunc('week', pr."createdAt") AS "bucketStart",
          COUNT(*)::int AS "reviewsSubmitted",
          COUNT(*) FILTER (WHERE pr."isLate" = true)::int AS "lateReviews"
        FROM "PeerReview" pr
        WHERE pr."reviewerId" = ANY(${reviewerIds}::uuid[])
          AND pr."createdAt" >= ${startDate}
          AND pr."createdAt" <= ${endDate}
        GROUP BY 1
        ORDER BY 1 ASC
      `
      break
  }

  return rows.map(row => ({
    bucketStart: row.bucketStart,
    reviewsSubmitted: toNumber(row.reviewsSubmitted),
    lateReviews: toNumber(row.lateReviews)
  }))
}

export const GET = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    const timeframeConfig = getReviewerAnalyticsTimeframeConfig(
      searchParams.get('timeframe'),
      searchParams.get('startDate'),
      searchParams.get('endDate')
    )

    const reviewers = await prisma.user.findMany({
      where: {
        role: {
          in: REVIEWER_ROLES
        }
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        totalXp: true,
        missedReviews: true,
        lastActiveAt: true,
        reviewPausedUntil: true,
        reviewPausedPermanently: true,
        preferences: true,
        _count: {
          select: {
            peerReviews: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    })

    const reviewerIds = reviewers.map(reviewer => reviewer.id)

    const [activeAssignments, reliabilityMap, assignmentAggregates, reviewAggregates, assignmentTrends, reviewTrends] =
      await Promise.all([
        reviewerIds.length > 0
          ? prisma.reviewAssignment.groupBy({
              by: ['reviewerId'],
              where: {
                reviewerId: { in: reviewerIds },
                status: { in: ['PENDING', 'IN_PROGRESS'] }
              },
              _count: { _all: true }
            })
          : Promise.resolve([]),
        reviewerIds.length > 0
          ? reliabilityService.getReliabilityScores(reviewerIds)
          : Promise.resolve(new Map()),
        reviewerIds.length > 0
          ? prisma.$queryRaw<AssignmentAggregateRow[]>`
              SELECT
                ra."reviewerId",
                COUNT(*)::int AS "assignmentsReceived",
                COUNT(*) FILTER (WHERE ra.status = 'COMPLETED')::int AS "assignmentsCompleted",
                COUNT(*) FILTER (WHERE ra.status = 'MISSED')::int AS "assignmentsMissed",
                COUNT(*) FILTER (WHERE ra.status = 'REASSIGNED')::int AS "assignmentsReassigned",
                COUNT(*) FILTER (WHERE ra.status IN ('PENDING', 'IN_PROGRESS'))::int AS "assignmentsOpen",
                ROUND(
                  AVG(EXTRACT(EPOCH FROM (ra."completedAt" - ra."assignedAt")) / 3600.0)::numeric,
                  1
                ) AS "avgHoursToComplete"
              FROM "ReviewAssignment" ra
              WHERE ra."reviewerId" = ANY(${reviewerIds}::uuid[])
                AND ra."assignedAt" >= ${timeframeConfig.startDate}
                AND ra."assignedAt" <= ${timeframeConfig.endDate}
              GROUP BY ra."reviewerId"
            `
          : Promise.resolve([]),
        reviewerIds.length > 0
          ? prisma.$queryRaw<ReviewAggregateRow[]>`
              SELECT
                pr."reviewerId",
                COUNT(*)::int AS "reviewsSubmitted",
                COUNT(*) FILTER (WHERE pr."isLate" = false)::int AS "onTimeReviews",
                ROUND(AVG(pr."qualityRating")::numeric, 2) AS "avgQuality",
                ROUND(AVG(pr."xpScore")::numeric, 1) AS "avgXpGiven",
                COUNT(*) FILTER (
                  WHERE s."finalXp" IS NOT NULL
                    AND ABS(pr."xpScore" - s."finalXp") <= 50
                )::int AS "alignedReviews",
                COUNT(*) FILTER (WHERE s."finalXp" IS NOT NULL)::int AS "finalizedReviews",
                COUNT(*) FILTER (WHERE pr."xpScore" = 0)::int AS "zeroScoreReviews",
                COUNT(*) FILTER (WHERE pr."xpScore" >= 200)::int AS "highScoreReviews"
              FROM "PeerReview" pr
              LEFT JOIN "Submission" s ON s.id = pr."submissionId"
              WHERE pr."reviewerId" = ANY(${reviewerIds}::uuid[])
                AND pr."createdAt" >= ${timeframeConfig.startDate}
                AND pr."createdAt" <= ${timeframeConfig.endDate}
              GROUP BY pr."reviewerId"
            `
          : Promise.resolve([]),
        getAssignmentTrends(
          reviewerIds,
          timeframeConfig.startDate,
          timeframeConfig.endDate,
          timeframeConfig.granularity
        ),
        getReviewTrends(
          reviewerIds,
          timeframeConfig.startDate,
          timeframeConfig.endDate,
          timeframeConfig.granularity
        )
      ])

    const activeAssignmentMap = new Map(
      activeAssignments.map(item => [item.reviewerId, item._count._all])
    )

    const reviewAggregateMap = new Map(reviewAggregates.map(item => [item.reviewerId, item]))
    const periodMetrics: ReviewerPeriodSnapshot[] = assignmentAggregates.map(item => {
      const reviewMetrics = reviewAggregateMap.get(item.reviewerId)

      return {
        reviewerId: item.reviewerId,
        assignmentsReceived: toNumber(item.assignmentsReceived),
        assignmentsCompleted: toNumber(item.assignmentsCompleted),
        assignmentsMissed: toNumber(item.assignmentsMissed),
        assignmentsReassigned: toNumber(item.assignmentsReassigned),
        assignmentsOpen: toNumber(item.assignmentsOpen),
        reviewsSubmitted: toNumber(reviewMetrics?.reviewsSubmitted),
        onTimeReviews: toNumber(reviewMetrics?.onTimeReviews),
        avgHoursToComplete: item.avgHoursToComplete === null ? null : toNumber(item.avgHoursToComplete),
        avgQuality: reviewMetrics?.avgQuality === null || reviewMetrics?.avgQuality === undefined
          ? null
          : toNumber(reviewMetrics.avgQuality),
        avgXpGiven: reviewMetrics?.avgXpGiven === null || reviewMetrics?.avgXpGiven === undefined
          ? null
          : toNumber(reviewMetrics.avgXpGiven),
        alignedReviews: toNumber(reviewMetrics?.alignedReviews),
        finalizedReviews: toNumber(reviewMetrics?.finalizedReviews),
        zeroScoreReviews: toNumber(reviewMetrics?.zeroScoreReviews),
        highScoreReviews: toNumber(reviewMetrics?.highScoreReviews)
      }
    })

    for (const reviewAggregate of reviewAggregates) {
      if (!periodMetrics.some(metric => metric.reviewerId === reviewAggregate.reviewerId)) {
        periodMetrics.push({
          reviewerId: reviewAggregate.reviewerId,
          assignmentsReceived: 0,
          assignmentsCompleted: 0,
          assignmentsMissed: 0,
          assignmentsReassigned: 0,
          assignmentsOpen: 0,
          reviewsSubmitted: toNumber(reviewAggregate.reviewsSubmitted),
          onTimeReviews: toNumber(reviewAggregate.onTimeReviews),
          avgHoursToComplete: null,
          avgQuality: reviewAggregate.avgQuality === null || reviewAggregate.avgQuality === undefined
            ? null
            : toNumber(reviewAggregate.avgQuality),
          avgXpGiven: reviewAggregate.avgXpGiven === null || reviewAggregate.avgXpGiven === undefined
            ? null
            : toNumber(reviewAggregate.avgXpGiven),
          alignedReviews: toNumber(reviewAggregate.alignedReviews),
          finalizedReviews: toNumber(reviewAggregate.finalizedReviews),
          zeroScoreReviews: toNumber(reviewAggregate.zeroScoreReviews),
          highScoreReviews: toNumber(reviewAggregate.highScoreReviews)
        })
      }
    }

    const currentReviewers: ReviewerCurrentSnapshot[] = reviewers.map(reviewer => ({
      id: reviewer.id,
      username: reviewer.username,
      email: reviewer.email,
      role: reviewer.role,
      totalXp: reviewer.totalXp,
      missedReviews: reviewer.missedReviews,
      totalReviewsAllTime: reviewer._count.peerReviews,
      activeAssignmentsNow: activeAssignmentMap.get(reviewer.id) || 0,
      reliabilityScore: reliabilityMap.get(reviewer.id)?.score ?? null,
      lastActiveAt: reviewer.lastActiveAt?.toISOString() ?? null,
      reviewPausedUntil: reviewer.reviewPausedUntil?.toISOString() ?? null,
      reviewPausedPermanently: reviewer.reviewPausedPermanently,
      preferences: reviewer.preferences
    }))

    const dashboard = buildReviewerAnalyticsDashboard({
      currentReviewers,
      periodMetrics,
      assignmentTrends,
      reviewTrends,
      timeframe: timeframeConfig.timeframe,
      dateRange: {
        start: timeframeConfig.startDate.toISOString(),
        end: timeframeConfig.endDate.toISOString()
      },
      granularity: timeframeConfig.granularity
    })

    return NextResponse.json(
      {
        success: true,
        data: dashboard
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=120, stale-while-revalidate=300'
        }
      }
    )
  } catch (error) {
    console.error('Reviewer analytics API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch reviewer analytics'
      },
      { status: 500 }
    )
  }
})
