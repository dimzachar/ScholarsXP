import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { getUserMonthlyStats, getCurrentMonthUTC } from '@/lib/leaderboard-service'

export const GET = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month') || getCurrentMonthUTC()

    const stats = await getUserMonthlyStats(userId, month)

    return NextResponse.json({
      month,
      ...stats
    }, {
      headers: {
        'Cache-Control': 'private, max-age=60' // Cache for 1 minute
      }
    })
  } catch (error) {
    console.error('Monthly stats API error:', error)
    return NextResponse.json({ error: 'Failed to fetch monthly stats' }, { status: 500 })
  }
})
