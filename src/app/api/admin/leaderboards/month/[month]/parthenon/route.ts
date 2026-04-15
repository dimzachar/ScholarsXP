import { NextRequest, NextResponse } from 'next/server'
import { withPermission } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase-server'
import { buildParthenonLeaderboard, type ParthenonUser } from '@/lib/parthenon-xp'

type StandingRow = {
  rank: number
  userId: string
  points: number
}

export const GET = withPermission('admin_access')(async (_request: NextRequest, context: { params: Promise<{ month: string }> }) => {
  const { month } = await context.params
  const supabaseAdmin = createServiceClient()

  const { data: standingsData, error: standingsErr } = await supabaseAdmin.rpc('get_monthly_leaderboard', {
    p_month: month,
    p_limit: 1000,
    p_offset: 0,
  })

  if (standingsErr) {
    return NextResponse.json({ error: standingsErr.message }, { status: 500 })
  }

  const standings: StandingRow[] = (standingsData || []).map((row: { userId: string; total: number | string }, idx: number) => ({
    rank: idx + 1,
    userId: row.userId,
    points: Number(row.total),
  }))

  let userMap = new Map<string, ParthenonUser>()
  if (standings.length) {
    const ids = standings.map((standing) => standing.userId)
    const { data: users, error: usersErr } = await supabaseAdmin
      .from('User')
      .select('id, username, discordId, discordHandle')
      .in('id', ids)

    if (usersErr) {
      return NextResponse.json({ error: usersErr.message }, { status: 500 })
    }

    userMap = new Map((users || []).map((user: ParthenonUser) => [user.id, user]))
  }

  const leaderboard = buildParthenonLeaderboard(standings, userMap)

  return NextResponse.json({
    success: true,
    data: {
      month,
      items: leaderboard.items,
      sMax: leaderboard.sMax,
      participantCount: leaderboard.participantCount,
    }
  })
})
