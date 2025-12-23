import { NextRequest, NextResponse } from 'next/server'
import { getWeekNumber } from '@/lib/utils'
import { withErrorHandling } from '@/lib/api-middleware'
import { multiLayerCache } from '@/lib/cache/enhanced-cache'
import { withPublicOptimization } from '@/middleware/api-optimization'
import { leaderboardService } from '@/lib/leaderboard-service'

const CACHE_VERSION = 'v13' // Optimized single-query leaderboard service

export const GET = withPublicOptimization(withErrorHandling(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const weekParam = searchParams.get('week')
  const limitParam = searchParams.get('limit')
  const pageParam = searchParams.get('page')
  const typeParam = searchParams.get('type') // 'weekly', 'alltime', or 'both'

  const currentWeek = weekParam ? parseInt(weekParam) : getWeekNumber(new Date())
  const limit = limitParam ? parseInt(limitParam) : 20
  const page = pageParam ? parseInt(pageParam) : 1
  const offset = (page - 1) * limit
  const type = typeParam || 'both'

  const cacheKey = `leaderboard:${CACHE_VERSION}:${currentWeek}:${limit}:${page}:${type}`

  try {
    let data = await multiLayerCache.get(cacheKey)

    if (!data) {
      data = await fetchLeaderboardData(currentWeek, limit, offset, type)
      await multiLayerCache.set(cacheKey, data, 300) // 5 min cache
    }

    return NextResponse.json({ success: true, data }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0, s-maxage=0',
        'X-Cache-Version': CACHE_VERSION
      }
    })
  } catch (error) {
    console.error('Leaderboard API error:', error)
    throw error
  }
}))

async function fetchLeaderboardData(currentWeek: number, limit: number, offset: number, type: string) {
  const results: any = {}

  // Fetch in parallel based on type
  const promises: Promise<void>[] = []

  if (type === 'weekly' || type === 'both') {
    promises.push(
      leaderboardService.getWeeklyLeaderboard(currentWeek, limit, type === 'weekly' ? offset : 0)
        .then(({ entries, stats, pagination }) => {
          results.weeklyStats = {
            ...stats,
            topPerformers: entries,
            pagination
          }
        })
    )
  }

  if (type === 'alltime' || type === 'both') {
    promises.push(
      leaderboardService.getAllTimeLeaderboard(limit, type === 'alltime' ? offset : 0)
        .then(({ entries, stats, pagination }) => {
          results.allTimeStats = stats
          results.allTimeLeaders = entries
          results.allTimePagination = pagination
        })
    )
  }

  await Promise.all(promises)

  return results
}
