/**
 * Reviewer Analytics Service
 * Provides statistics and credibility metrics for reviewers
 * Can be reused in vote page, analytics dashboard, admin panels
 */

import { prisma } from '@/lib/prisma'

export interface ReviewerStats {
  reviewerId: string
  experienceLevel: 'new' | 'intermediate' | 'experienced'
  avgXpGiven: number
  recentReviewCount: number
  zeroScoreRate: number
  highScoreRate: number
  isHighVolume: boolean
  consensusAlignment: number // % of times score was within 50 XP of final
}

export interface ReviewerStatsMap {
  [reviewerId: string]: ReviewerStats
}

/**
 * Fetch comprehensive stats for multiple reviewers
 */
export async function getReviewerStats(reviewerIds: string[]): Promise<ReviewerStatsMap> {
  if (reviewerIds.length === 0) return {}

  const statsRaw = await prisma.$queryRaw<Array<{
    reviewerId: string
    totalReviews: bigint
    avgXpGiven: string | number
    recentReviewCount: bigint
    zeroScoreCount: bigint
    highScoreCount: bigint
    alignedCount: bigint
    finalizedCount: bigint
  }>>`
    SELECT 
      pr."reviewerId",
      COUNT(*) as "totalReviews",
      AVG(pr."xpScore") as "avgXpGiven",
      COUNT(*) FILTER (WHERE pr."createdAt" >= NOW() - INTERVAL '7 days') as "recentReviewCount",
      COUNT(*) FILTER (WHERE pr."xpScore" = 0) as "zeroScoreCount",
      COUNT(*) FILTER (WHERE pr."xpScore" >= 200) as "highScoreCount",
      COUNT(*) FILTER (WHERE s."finalXp" IS NOT NULL AND ABS(pr."xpScore" - s."finalXp") <= 50) as "alignedCount",
      COUNT(*) FILTER (WHERE s."finalXp" IS NOT NULL) as "finalizedCount"
    FROM "PeerReview" pr
    LEFT JOIN "Submission" s ON pr."submissionId" = s.id
    WHERE pr."reviewerId" = ANY(${reviewerIds}::uuid[])
    GROUP BY pr."reviewerId"
  `

  return statsRaw.reduce((acc, stat) => {
    const total = Number(stat.totalReviews)
    const zeroCount = Number(stat.zeroScoreCount)
    const highCount = Number(stat.highScoreCount)
    const alignedCount = Number(stat.alignedCount)
    const finalizedCount = Number(stat.finalizedCount)

    acc[stat.reviewerId] = {
      reviewerId: stat.reviewerId,
      experienceLevel: total < 10 ? 'new' : total < 50 ? 'intermediate' : 'experienced',
      avgXpGiven: typeof stat.avgXpGiven === 'string' ? parseFloat(stat.avgXpGiven) : stat.avgXpGiven,
      recentReviewCount: Number(stat.recentReviewCount),
      zeroScoreRate: total > 0 ? zeroCount / total : 0,
      highScoreRate: total > 0 ? highCount / total : 0,
      isHighVolume: Number(stat.recentReviewCount) > 10,
      consensusAlignment: finalizedCount > 0 ? Math.round((alignedCount / finalizedCount) * 100) : 0,
    }
    return acc
  }, {} as ReviewerStatsMap)
}

/**
 * Get a single reviewer's stats
 */
export async function getReviewerStatsById(reviewerId: string): Promise<ReviewerStats | null> {
  const stats = await getReviewerStats([reviewerId])
  return stats[reviewerId] || null
}
