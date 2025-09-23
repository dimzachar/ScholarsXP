import { withPermission } from '@/lib/auth-middleware'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export const GET = withPermission('admin_access')(async (_req: NextRequest, { params }: { params: { month: string } }) => {
  const month = params.month
  const supabaseAdmin = createServiceClient()

  // standings (service client for admin)
  const { data: standingsData, error: standingsErr } = await supabaseAdmin.rpc('get_monthly_leaderboard', {
    p_month: month,
    p_limit: 1000,
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

  // cooldown context
  const prevMonths = getPreviousMonths(month, 3)
  const { data: recentWinners } = await supabaseAdmin
    .from('MonthlyWinner')
    .select('userId, month')
    .in('month', prevMonths)

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
      .select('id, username, email')
      .in('id', ids)
    userMap = new Map((users || []).map((u: any) => [u.id, u]))
  }

  const rows = standings.map((s) => {
    const blocked = winnersByUser.get(s.userId) || []
    return {
      rank: s.rank,
      userId: s.userId,
      username: userMap.get(s.userId)?.username || '',
      email: userMap.get(s.userId)?.email || '',
      points: s.total,
      eligible: blocked.length === 0 ? 'yes' : 'no',
      cooldown_reasons: blocked.join('; '),
    }
  })

  const csv = toCsv(rows)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="monthly_preview_${month}.csv"`
    }
  })
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

function toCsv(rows: any[]) {
  if (!rows.length) return 'rank,userId,username,email,points,eligible,cooldown_reasons\n'
  const headers = Object.keys(rows[0])
  const escape = (val: any) => {
    const s = String(val ?? '')
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }
  return headers.join(',') + '\n' + rows.map(r => headers.map(h => escape((r as any)[h])).join(',')).join('\n') + '\n'
}
