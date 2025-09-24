import { withPermission } from '@/lib/auth-middleware'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { invalidateAllLeaderboardCache } from '@/lib/cache/leaderboard-cache-utils'

// Upserts a winner for the month to the specified userId (admin override)
export const POST = withPermission('admin_access')(async (request: NextRequest, { params }: { params: { month: string } }) => {
  const month = params.month
  const body = await request.json().catch(() => ({}))
  const { userId, reason, rank: rankRaw, xpAwarded: xpRaw } = body || {}
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  const rank = Math.max(1, Math.min(3, Number(rankRaw || 1)))
  const defaultXp = rank === 1 ? 2000 : rank === 2 ? 1500 : 1000
  const xpAwarded = Number.isFinite(Number(xpRaw)) ? Number(xpRaw) : defaultXp

  // Try modern upsert on (month,rank); fallback to legacy onConflict: 'month'
  let data: any = null
  let error: any = null
  try {
    const supabaseAdmin = createServiceClient()
    const resp = await supabaseAdmin
      .from('MonthlyWinner')
      .upsert({ month, userId, rank, xpAwarded }, { onConflict: 'month,rank' })
      .select('id, userId, month, awardedAt, rank, xpAwarded')
      .single()
    data = resp.data
    error = resp.error
  } catch (e: any) {
    error = e
  }

  if (error) {
    // Fallback: legacy schema (no rank/xpAwarded or no unique(month,rank))
    const supabaseAdmin = createServiceClient()
    const legacy = await supabaseAdmin
      .from('MonthlyWinner')
      .upsert({ month, userId }, { onConflict: 'month' })
      .select('id, userId, month, awardedAt')
      .single()
    if (legacy.error) return NextResponse.json({ error: legacy.error.message }, { status: 500 })
    data = { ...legacy.data, rank: null, xpAwarded: null }
  }

  // Optionally log to AutomationLog (best-effort)
  try {
    const supabaseAdmin = createServiceClient()
    await supabaseAdmin.from('AutomationLog').insert({
      jobName: 'monthly_award_override',
      jobType: 'xp_aggregation',
      triggeredBy: 'admin',
      status: 'SUCCESS',
      result: JSON.stringify({ month, userId, reason, rank, xpAwarded }),
    })
  } catch {}

  await invalidateAllLeaderboardCache()
  return NextResponse.json({ success: true, data })
})
