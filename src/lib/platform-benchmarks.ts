/**
 * Platform Benchmarks Service
 * Provides XP statistics per platform for comparison
 * Can be reused in vote page, analytics, submission insights
 */

import { prisma } from '@/lib/prisma'

export interface PlatformBenchmark {
  platform: string
  avgXp: number
  totalSubmissions: number
  minXp: number
  maxXp: number
}

export interface PlatformBenchmarkMap {
  [platform: string]: PlatformBenchmark
}

/**
 * Fetch benchmarks for multiple platforms
 */
export async function getPlatformBenchmarks(platforms: string[]): Promise<PlatformBenchmarkMap> {
  if (platforms.length === 0) return {}

  const benchmarksRaw = await prisma.$queryRaw<Array<{
    platform: string
    avgXp: string | number
    totalSubmissions: bigint
    minXp: number
    maxXp: number
  }>>`
    SELECT 
      s.platform,
      AVG(s."finalXp") as "avgXp",
      COUNT(*) as "totalSubmissions",
      MIN(s."finalXp") as "minXp",
      MAX(s."finalXp") as "maxXp"
    FROM "Submission" s
    WHERE s.platform = ANY(${platforms}::text[])
    AND s.status = 'FINALIZED'
    AND s."finalXp" IS NOT NULL
    GROUP BY s.platform
  `

  return benchmarksRaw.reduce((acc, bench) => {
    acc[bench.platform] = {
      platform: bench.platform,
      avgXp: typeof bench.avgXp === 'string' ? parseFloat(bench.avgXp) : (bench.avgXp || 0),
      totalSubmissions: Number(bench.totalSubmissions),
      minXp: bench.minXp || 0,
      maxXp: bench.maxXp || 0,
    }
    return acc
  }, {} as PlatformBenchmarkMap)
}

/**
 * Get benchmark for a single platform
 */
export async function getPlatformBenchmark(platform: string): Promise<PlatformBenchmark | null> {
  const benchmarks = await getPlatformBenchmarks([platform])
  return benchmarks[platform] || null
}

/**
 * Get all platform benchmarks (for analytics dashboard)
 */
export async function getAllPlatformBenchmarks(): Promise<PlatformBenchmark[]> {
  const benchmarksRaw = await prisma.$queryRaw<Array<{
    platform: string
    avgXp: string | number
    totalSubmissions: bigint
    minXp: number
    maxXp: number
  }>>`
    SELECT 
      s.platform,
      AVG(s."finalXp") as "avgXp",
      COUNT(*) as "totalSubmissions",
      MIN(s."finalXp") as "minXp",
      MAX(s."finalXp") as "maxXp"
    FROM "Submission" s
    WHERE s.status = 'FINALIZED'
    AND s."finalXp" IS NOT NULL
    GROUP BY s.platform
    ORDER BY "totalSubmissions" DESC
  `

  return benchmarksRaw.map(bench => ({
    platform: bench.platform,
    avgXp: typeof bench.avgXp === 'string' ? parseFloat(bench.avgXp) : (bench.avgXp || 0),
    totalSubmissions: Number(bench.totalSubmissions),
    minXp: bench.minXp || 0,
    maxXp: bench.maxXp || 0,
  }))
}
