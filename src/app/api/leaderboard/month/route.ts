import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/api-middleware'
import { getMonthlyLeaderboard, getCurrentMonthUTC, getMonthlyWinners } from '@/lib/leaderboard-service'
import { multiLayerCache } from '@/lib/cache/enhanced-cache'

export const GET = withErrorHandling(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') || getCurrentMonthUTC()
  const limit = Number(searchParams.get('limit') || 20)
  const page = Number(searchParams.get('page') || 1)
  const offset = (page - 1) * limit

  const cacheKey = `leaderboard:monthly:${month}:${limit}:${page}`
  let data = await multiLayerCache.get<any>(cacheKey)
  if (!data) {
    const [items, winners] = await Promise.all([
      getMonthlyLeaderboard(month, limit, offset),
      getMonthlyWinners(month).catch(() => []),
    ])
    data = { items, month, winners }
    await multiLayerCache.set(cacheKey, data, 300)
  }
  return NextResponse.json({ success: true, data }, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' }
  })
})
