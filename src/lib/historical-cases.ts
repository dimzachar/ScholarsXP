/**
 * Historical Cases Service
 * Provides past divergent case data for precedent analysis
 * Can be reused in vote page, analytics, case studies
 */

import { prisma } from '@/lib/prisma'

export interface HistoricalCase {
  finalXp: number
  minReviewXp: number
  maxReviewXp: number
  reviewCount: number
  createdAt: string
}

export interface HistoricalCasesResult {
  cases: HistoricalCase[]
  avgFinalXp: number
  count: number
}

/**
 * Get historical divergent cases for a platform
 * These are finalized submissions that had significant score variance
 */
export async function getHistoricalDivergentCases(
  platform: string,
  limit: number = 10
): Promise<HistoricalCasesResult> {
  const casesRaw = await prisma.$queryRaw<Array<{
    finalXp: number
    minReviewXp: number
    maxReviewXp: number
    reviewCount: bigint
    createdAt: Date
  }>>`
    SELECT 
      s."finalXp",
      MIN(pr."xpScore") as "minReviewXp",
      MAX(pr."xpScore") as "maxReviewXp",
      COUNT(pr.id) as "reviewCount",
      s."createdAt"
    FROM "Submission" s
    JOIN "PeerReview" pr ON s.id = pr."submissionId"
    WHERE s.platform = ${platform}
    AND s.status = 'FINALIZED'
    AND s."finalXp" IS NOT NULL
    GROUP BY s.id, s."finalXp", s."createdAt"
    HAVING STDDEV(pr."xpScore") > 50
    ORDER BY s."createdAt" DESC
    LIMIT ${limit}
  `

  const cases = casesRaw.map(c => ({
    finalXp: c.finalXp,
    minReviewXp: c.minReviewXp,
    maxReviewXp: c.maxReviewXp,
    reviewCount: Number(c.reviewCount),
    createdAt: c.createdAt.toISOString(),
  }))

  const avgFinalXp = cases.length > 0
    ? cases.reduce((sum, c) => sum + c.finalXp, 0) / cases.length
    : 0

  return {
    cases,
    avgFinalXp,
    count: cases.length,
  }
}

/**
 * Get historical cases across all platforms (for analytics)
 */
export async function getAllHistoricalDivergentCases(limit: number = 50): Promise<{
  byPlatform: { [platform: string]: HistoricalCasesResult }
  total: number
}> {
  const casesRaw = await prisma.$queryRaw<Array<{
    platform: string
    finalXp: number
    minReviewXp: number
    maxReviewXp: number
    reviewCount: bigint
    createdAt: Date
  }>>`
    SELECT 
      s.platform,
      s."finalXp",
      MIN(pr."xpScore") as "minReviewXp",
      MAX(pr."xpScore") as "maxReviewXp",
      COUNT(pr.id) as "reviewCount",
      s."createdAt"
    FROM "Submission" s
    JOIN "PeerReview" pr ON s.id = pr."submissionId"
    WHERE s.status = 'FINALIZED'
    AND s."finalXp" IS NOT NULL
    GROUP BY s.id, s.platform, s."finalXp", s."createdAt"
    HAVING STDDEV(pr."xpScore") > 50
    ORDER BY s."createdAt" DESC
    LIMIT ${limit}
  `

  const byPlatform: { [platform: string]: HistoricalCase[] } = {}
  
  casesRaw.forEach(c => {
    if (!byPlatform[c.platform]) byPlatform[c.platform] = []
    byPlatform[c.platform].push({
      finalXp: c.finalXp,
      minReviewXp: c.minReviewXp,
      maxReviewXp: c.maxReviewXp,
      reviewCount: Number(c.reviewCount),
      createdAt: c.createdAt.toISOString(),
    })
  })

  const result: { [platform: string]: HistoricalCasesResult } = {}
  for (const [platform, cases] of Object.entries(byPlatform)) {
    const avgFinalXp = cases.reduce((sum, c) => sum + c.finalXp, 0) / cases.length
    result[platform] = { cases, avgFinalXp, count: cases.length }
  }

  return {
    byPlatform: result,
    total: casesRaw.length,
  }
}
