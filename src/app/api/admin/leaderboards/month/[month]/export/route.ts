import { withPermission } from '@/lib/auth-middleware'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { buildParthenonLeaderboard, type ParthenonUser } from '@/lib/parthenon-xp'

type StandingRow = {
  rank: number
  userId: string
  total: number
}

type CsvValue = string | number
type CsvRow = Record<string, CsvValue>

export const GET = withPermission('admin_access')(async (req: NextRequest, context: { params: Promise<{ month: string }> }) => {
  const { month } = await context.params
  const supabaseAdmin = createServiceClient()
  const exportList = req.nextUrl.searchParams.get('list')
  const isParthenonXpExport = exportList === 'parthenon-xp'

  // standings (service client for admin)
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
  let userMap = new Map<string, ParthenonUser>()
  if (standings.length) {
    const ids = standings.map((s) => s.userId)
    const { data: users } = await supabaseAdmin
      .from('User')
      .select('id, username, discordId, discordHandle')
      .in('id', ids)
    userMap = new Map((users || []).map((u: ParthenonUser) => [u.id, u]))
  }

  const rows = isParthenonXpExport
    ? buildParthenonXpRows(standings, userMap)
    : buildMonthlyPreviewRows(standings, winnersByUser, userMap)

  const csv = toCsv(
    rows,
    isParthenonXpExport
      ? ['username', 'discordId', 'discordHandle', 'points', 's_max', 'n', 'p_pts', 'parthenon_xp']
      : ['rank', 'userId', 'username', 'points', 'eligible', 'cooldown_reasons']
  )

  const filename = isParthenonXpExport
    ? `parthenon_xp_${month}.csv`
    : `monthly_preview_${month}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  })
})

export function buildMonthlyPreviewRows(
  standings: StandingRow[],
  winnersByUser: Map<string, string[]>,
  userMap: Map<string, ParthenonUser>
): CsvRow[] {
  return standings.map((standing) => {
    const blocked = winnersByUser.get(standing.userId) || []

    return {
      rank: standing.rank,
      userId: standing.userId,
      username: userMap.get(standing.userId)?.username || '',
      points: standing.total,
      eligible: blocked.length === 0 ? 'yes' : 'no',
      cooldown_reasons: blocked.join('; '),
    }
  })
}

export function buildParthenonXpRows(
  standings: StandingRow[],
  userMap: Map<string, ParthenonUser>
): CsvRow[] {
  const leaderboard = buildParthenonLeaderboard(
    standings.map((standing) => ({
      rank: standing.rank,
      userId: standing.userId,
      points: standing.total,
    })),
    userMap
  )

  return leaderboard.items
    .filter((item) => item.parthenon_xp > 0)
    .map((item) => ({
      username: item.username,
      discordId: formatSpreadsheetText(item.discordId),
      discordHandle: item.discordHandle,
      points: item.points,
      s_max: item.s_max,
      n: item.n,
      p_pts: item.p_pts,
      parthenon_xp: item.parthenon_xp,
    }))
}

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

function formatSpreadsheetText(value?: string | null) {
  if (!value) return ''
  return /^\d+$/.test(value) ? `="${value}"` : value
}

export function toCsv(rows: CsvRow[], headers: string[]) {
  if (!rows.length) return headers.join(',') + '\n'
  const escape = (val: CsvValue | undefined) => {
    const s = String(val ?? '')
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }
  return headers.join(',') + '\n' + rows.map((row) => headers.map((header) => escape(row[header])).join(',')).join('\n') + '\n'
}
