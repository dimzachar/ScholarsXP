import { NextRequest, NextResponse } from 'next/server'
import { weeklyStatsService } from '@/lib/database'
import { getWeekNumber } from '@/lib/utils'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const weekParam = searchParams.get('week')
    const currentWeek = weekParam ? parseInt(weekParam) : getWeekNumber(new Date())

    const weeklyStats = await weeklyStatsService.findLeaderboard(currentWeek, 10)

    const leaderboard = weeklyStats.map((stat, index) => ({
      rank: index + 1,
      username: stat.user.username,
      weeklyXp: stat.xpTotal,
      totalXp: stat.user.totalXp,
      reviewsDone: stat.reviewsDone,
      reviewsMissed: stat.reviewsMissed
    }))

    return NextResponse.json({
      week: currentWeek,
      leaderboard
    })

  } catch (error) {
    console.error('Error fetching leaderboard:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}

