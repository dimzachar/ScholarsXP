import { NextResponse } from 'next/server'
import { withPermission } from '@/lib/auth-middleware'
import { invalidateAllLeaderboardCache } from '@/lib/cache/leaderboard-cache-utils'
import { createServiceClient } from '@/lib/supabase-server'
import { topUpMonthlyWinnerXpJS } from '@/lib/services/monthly-awards'

export const POST = withPermission('admin_access')(async (_request, { params }: { params: { month: string } }) => {
  const month = params.month
  const supabaseAdmin = createServiceClient()
  // Award top 3 winners and return all rows
  const { data, error } = await supabaseAdmin.rpc('award_monthly_winners', { p_month: month })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const winnersRaw = Array.isArray(data) ? data : [data]
  // Normalize RPC result: map month_text -> month for consumers
  const winners = (winnersRaw || []).map((row: any) => {
    if (!row) return row
    const { month_text, ...rest } = row
    return { ...rest, month: month_text }
  })
  // Ensure XP credited even if part of award failed
  try {
    await supabaseAdmin.rpc('top_up_monthly_winner_xp', { p_month: month })
  } catch {}
  // JS fallback (idempotent)
  try { await topUpMonthlyWinnerXpJS(month, supabaseAdmin) } catch {}
  await invalidateAllLeaderboardCache()
  return NextResponse.json({ success: true, data: winners })
})
