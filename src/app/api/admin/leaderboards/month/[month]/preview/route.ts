import { NextRequest, NextResponse } from 'next/server'
import { withPermission } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase-server'

// Returns monthly standings annotated with cooldown eligibility and reasons
export const GET = withPermission('admin_access')(async (_request: NextRequest, context: { params: Promise<{ month: string }> }) => {
  const { month } = await context.params
  const supabaseAdmin = createServiceClient()

  // Fetch standings using service client (bypass RLS for admin)
  const { data: standingsData, error: standingsErr } = await supabaseAdmin.rpc('get_monthly_leaderboard', {
    p_month: month,
    p_limit: 50,
    p_offset: 0,
  })
  if (standingsErr) {
    return NextResponse.json({ error: standingsErr.message }, { status: 500 })
  }

  const standings = (standingsData || []).map((row: any, idx: number) => ({
    rank: idx + 1,
    userId: row.userId as string,
    total: Number(row.total),
  }))

  // Fetch winners for last 3 months to calculate cooldown
  const prevMonths = getPreviousMonths(month, 3)
  const { data: recentWinners, error } = await supabaseAdmin
    .from('MonthlyWinner')
    .select('userId, month')
    .in('month', prevMonths)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const winnersByUser = new Map<string, string[]>()
  for (const w of recentWinners || []) {
    const list = winnersByUser.get(w.userId) || []
    list.push(w.month)
    winnersByUser.set(w.userId, list)
  }

  // Enrich users
  let userMap = new Map<string, any>()
  if (standings.length) {
    const ids = standings.map((s) => s.userId)
    const { data: users } = await supabaseAdmin
      .from('User')
      .select('id, username, email, profileImageUrl, totalXp')
      .in('id', ids)
    userMap = new Map((users || []).map((u: any) => [u.id, u]))
  }

  const items = standings.map((s) => {
    const blockedMonths = winnersByUser.get(s.userId) || []
    const eligible = blockedMonths.length === 0
    const reasons = eligible ? [] : [`Won in ${blockedMonths.join(', ')}`]
    return {
      rank: s.rank,
      userId: s.userId,
      user: userMap.get(s.userId) || null,
      points: s.total,
      eligible,
      reasons,
    }
  })

  // Current winners (top 3). Fallback to single row if extended columns not present
  // Fetch winners and enrich with user profiles for username display
  let winners: any[] = []
  const res = await supabaseAdmin
    .from('MonthlyWinner')
    .select('id, userId, month, awardedAt, rank, xpAwarded')
    .eq('month', month)
    .order('rank', { ascending: true })
  if (res.error) {
    const { data: single } = await supabaseAdmin
      .from('MonthlyWinner')
      .select('id, userId, month, awardedAt')
      .eq('month', month)
      .maybeSingle()
    winners = single ? [single] : []
  } else {
    winners = res.data || []
  }

  if (winners.length) {
    const uids = winners.map(w => w.userId)
    const { data: users } = await supabaseAdmin
      .from('User')
      .select('id, username, email, profileImageUrl')
      .in('id', uids)
    const umap = new Map((users || []).map((u: any) => [u.id, u]))
    winners = winners.map(w => ({ ...w, user: umap.get(w.userId) || null }))
  }

  const winner = winners?.[0] || null
  return NextResponse.json({ success: true, data: { month, items, winner, winners } })
})

function getPreviousMonths(month: string, count: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1, 1))
  const out: string[] = []
  for (let i = 1; i <= count; i++) {
    const dd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1))
    const mm = (dd.getUTCMonth() + 1).toString().padStart(2, '0')
    out.push(`${dd.getUTCFullYear()}-${mm}`)
  }
  return out
}
