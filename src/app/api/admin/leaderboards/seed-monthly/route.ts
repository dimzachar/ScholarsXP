import { NextRequest, NextResponse } from 'next/server'
import { withPermission } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase-server'
import { invalidateAllLeaderboardCache } from '@/lib/cache/leaderboard-cache-utils'

function isoWeekNumber(d: Date) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

// Admin-only helper to seed a few XpTransaction rows across target months
// Usage: POST /api/admin/leaderboards/seed-monthly?months=2025-07,2025-08,2025-09&users=3&perUser=5
export const POST = withPermission('admin_access')(async (req: NextRequest) => {
  const supabaseAdmin = createServiceClient()
  const { searchParams } = new URL(req.url)
  const monthsParam = searchParams.get('months') || '2025-07,2025-08,2025-09'
  const usersCount = Math.max(1, Math.min(10, Number(searchParams.get('users') || 3)))
  const perUser = Math.max(1, Math.min(20, Number(searchParams.get('perUser') || 5)))

  const months = monthsParam.split(',').map((m) => m.trim()).filter(Boolean)

  // Pick some users
  const { data: users, error: usersErr } = await supabaseAdmin
    .from('User')
    .select('id, username')
    .limit(usersCount)

  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })
  if (!users || users.length === 0) return NextResponse.json({ error: 'No users found to seed' }, { status: 400 })

  let inserted = 0
  const failures: Array<{ userId: string; month: string; error: string }> = []

  for (const month of months) {
    // Pick the 1st day of month (UTC)
    const [y, m] = month.split('-').map(Number)
    if (!y || !m || m < 1 || m > 12) {
      failures.push({ userId: '-', month, error: 'Invalid month format' })
      continue
    }
    for (const u of users) {
      for (let i = 0; i < perUser; i++) {
        // Spread transactions across the month (days 2..27)
        const day = 2 + ((i * 5) % 26)
        const createdAt = new Date(Date.UTC(y, m - 1, day, 12, 0, 0))
        const weekNumber = isoWeekNumber(createdAt)
        const amount = 10 + ((i * 7 + (createdAt.getUTCDate() % 5)) % 40) // 10..49
        const { error } = await supabaseAdmin
          .from('XpTransaction')
          .insert({
            userId: u.id,
            amount,
            type: 'ADMIN_ADJUSTMENT',
            sourceId: null,
            description: `Seed monthly test ${month}`,
            weekNumber,
            createdAt: createdAt.toISOString(),
            sourceType: 'SEED',
            adminId: null,
          })
        if (error) failures.push({ userId: u.id, month, error: error.message })
        else inserted++
      }
    }
  }

  try { await invalidateAllLeaderboardCache() } catch {}

  return NextResponse.json({ success: true, data: { inserted, failures } })
})

