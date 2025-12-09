import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getWeekNumber } from '@/lib/utils'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'

export const GET = withPermission('authenticated')(async (request: AuthenticatedRequest) => {

  const { searchParams } = new URL(request.url)
  const weekParam = searchParams.get('week')
  const typeParam = searchParams.get('type') // 'weekly', 'alltime', or 'both'

  const currentWeek = weekParam ? parseInt(weekParam) : getWeekNumber(new Date())
  const type = typeParam || 'both'

  // Create cache key based on user and parameters
  const cacheKey = `user-position:${request.user.id}:${currentWeek}:${type}`

  try {
    // Temporarily disable cache to debug the issue
    // let data = await multiLayerCache.get(cacheKey)

    // if (!data) {
      // Cache miss - fetch from database
      const data = await fetchUserPositionFromDatabase(request.user.id, currentWeek, type)

      // Store in cache for 2 minutes (shorter TTL since this is user-specific)
      // await multiLayerCache.set(cacheKey, data, 120)
    // }

    return NextResponse.json({ success: true, data }, {
      headers: {
        'Cache-Control': 'private, max-age=120, stale-while-revalidate=240',
        'X-Cache-Layer': 'Multi-Layer',
        'X-Cache-Key': cacheKey
      }
    })
  } catch (error) {
    console.error('User position API error:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          error: error instanceof Error ? error.message : 'Internal server error',
          code: 'USER_POSITION_ERROR',
          details: error instanceof Error ? error.stack : undefined
        }
      },
      { status: 500 }
    )
  }
})

async function fetchUserPositionFromDatabase(userId: string, currentWeek: number, type: string) {
  // Get user data first
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, email: true, totalXp: true, profileImageUrl: true }
  })

  if (!user) {
    throw new Error('User not found')
  }

  const result: any = {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      totalXp: user.totalXp,
      profileImageUrl: user.profileImageUrl
    }
  }

  // Get weekly position if requested
  if (type === 'weekly' || type === 'both') {
    // Get user's weekly XP and rank using raw SQL for efficiency
    const weeklyData = await prisma.$queryRaw<Array<{ 
      user_xp: bigint
      user_rank: bigint
      total_participants: bigint 
    }>>`
      WITH user_totals AS (
        SELECT "userId", SUM(amount) as total_xp
        FROM "XpTransaction"
        WHERE "weekNumber" = ${currentWeek}
        GROUP BY "userId"
      ),
      ranked AS (
        SELECT "userId", total_xp, RANK() OVER (ORDER BY total_xp DESC) as rank
        FROM user_totals
      )
      SELECT 
        COALESCE((SELECT total_xp FROM ranked WHERE "userId" = ${userId}::uuid), 0) as user_xp,
        COALESCE((SELECT rank FROM ranked WHERE "userId" = ${userId}::uuid), 0) as user_rank,
        (SELECT COUNT(*) FROM user_totals) as total_participants
    `

    const data = weeklyData[0]
    result.weekly = {
      rank: Number(data?.user_rank || 0),
      xp: Number(data?.user_xp || 0),
      totalParticipants: Number(data?.total_participants || 0)
    }
  }

  // Get all-time position if requested
  if (type === 'alltime' || type === 'both') {
    const [usersAbove, totalUsers] = await Promise.all([
      prisma.user.count({ where: { totalXp: { gt: user.totalXp } } }),
      prisma.user.count()
    ])

    result.allTime = {
      rank: usersAbove + 1,
      xp: user.totalXp,
      totalUsers
    }
  }

  return result
}
