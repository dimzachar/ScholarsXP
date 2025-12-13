import { withPermission } from '@/lib/auth-middleware'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export const GET = withPermission('admin_access')(async (_req: NextRequest) => {
  const supabaseAdmin = createServiceClient()
  const { data: winners, error } = await supabaseAdmin
    .from('MonthlyWinner')
    .select('id, userId, month, awardedAt, rank, xpAwarded')
    .order('month', { ascending: false })
    .order('rank', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (winners || []).map(w => w.userId)
  const { data: users } = await supabaseAdmin
    .from('User')
    .select('id, username, email')
    .in('id', ids)
  const userMap = new Map((users || []).map(u => [u.id, u]))

  const rows = (winners || []).map(w => ({
    month: w.month,
    rank: w.rank ?? '',
    xpAwarded: w.xpAwarded ?? '',
    userId: w.userId,
    username: userMap.get(w.userId)?.username || '',
    awardedAt: w.awardedAt,
  }))

  const csv = toCsv(rows)
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="monthly_winners.csv"'
    }
  })
})

function toCsv(rows: any[]) {
  if (!rows.length) return 'month,userId,username,awardedAt\n'
  const headers = Object.keys(rows[0])
  const escape = (val: any) => {
    const s = String(val ?? '')
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }
  return headers.join(',') + '\n' + rows.map(r => headers.map(h => escape((r as any)[h])).join(',')).join('\n') + '\n'
}
