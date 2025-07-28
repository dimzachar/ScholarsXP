import { NextRequest, NextResponse } from 'next/server'
import { supabaseClient } from '@/lib/supabase'
import { getWeekNumber } from '@/lib/utils'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { multiLayerCache } from '@/lib/cache/enhanced-cache'

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
  try {
    const supabase = supabaseClient

    console.log('Fetching user data for userId:', userId)

    // Get user data first
    const { data: user, error: userError } = await supabase
      .from('User')
      .select('id, username, email, totalXp, profileImageUrl')
      .eq('id', userId)
      .single()

    console.log('User query result:', { user, userError })

    if (userError) {
      console.error('Error fetching user:', userError)
      throw new Error(`User fetch error: ${userError.message}`)
    }

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
      try {
        console.log('Fetching weekly stats for user:', user.id, 'week:', currentWeek)

        // Get user's weekly stats
        const { data: weeklyStats, error: weeklyError } = await supabase
          .from('WeeklyStats')
          .select('xpTotal')
          .eq('userId', user.id)
          .eq('weekNumber', currentWeek)
          .single()

        console.log('Weekly stats query result:', { weeklyStats, weeklyError })

        if (weeklyError && weeklyError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
          console.error('Error getting weekly stats:', weeklyError)
        }

        const weeklyXp = weeklyStats?.xpTotal || 0
        console.log('Weekly XP for user:', weeklyXp)

        // Get user's weekly rank by counting users with higher weekly XP
        const { count: weeklyRank, error: weeklyRankError } = await supabase
          .from('WeeklyStats')
          .select('*', { count: 'exact', head: true })
          .eq('weekNumber', currentWeek)
          .gt('xpTotal', weeklyXp)

        if (weeklyRankError) {
          console.error('Error getting weekly rank:', weeklyRankError)
        }

        // Get total weekly participants
        const { count: totalWeeklyParticipants, error: totalWeeklyError } = await supabase
          .from('WeeklyStats')
          .select('*', { count: 'exact', head: true })
          .eq('weekNumber', currentWeek)

        if (totalWeeklyError) {
          console.error('Error getting total weekly participants:', totalWeeklyError)
        }

        result.weekly = {
          rank: (weeklyRank || 0) + 1, // Add 1 because count gives users above, so rank is count + 1
          xp: weeklyXp,
          totalParticipants: totalWeeklyParticipants || 0
        }
      } catch (error) {
        console.error('Error processing weekly data:', error)
        result.weekly = {
          rank: 0,
          xp: 0,
          totalParticipants: 0
        }
      }
    }

    // Get all-time position if requested
    if (type === 'alltime' || type === 'both') {
      try {
        // Get user's all-time rank by counting users with higher total XP
        const { count: allTimeRank, error: allTimeRankError } = await supabase
          .from('User')
          .select('*', { count: 'exact', head: true })
          .gt('totalXp', user.totalXp)

        if (allTimeRankError) {
          console.error('Error getting all-time rank:', allTimeRankError)
        }

        // Get total users count
        const { count: totalUsers, error: totalUsersError } = await supabase
          .from('User')
          .select('*', { count: 'exact', head: true })

        if (totalUsersError) {
          console.error('Error getting total users:', totalUsersError)
        }

        result.allTime = {
          rank: (allTimeRank || 0) + 1, // Add 1 because count gives users above, so rank is count + 1
          xp: user.totalXp,
          totalUsers: totalUsers || 0
        }
      } catch (error) {
        console.error('Error processing all-time data:', error)
        result.allTime = {
          rank: 0,
          xp: user.totalXp,
          totalUsers: 0
        }
      }
    }

    return result
  } catch (error) {
    console.error('Error in fetchUserPositionFromDatabase:', error)
    throw error
  }
}
