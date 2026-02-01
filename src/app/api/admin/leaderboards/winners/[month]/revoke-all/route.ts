import { withPermission } from '@/lib/auth-middleware'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { invalidateAllLeaderboardCache } from '@/lib/cache/leaderboard-cache-utils'
import { revokeMonthlyWinnersJS } from '@/lib/services/monthly-awards'

// Bulk revoke all winners for a month and reverse their XP awards
export const POST = withPermission('admin_access')(async (_req: NextRequest, context: { params: Promise<{ month: string }> }) => {
  const { month } = await context.params
  const supabaseAdmin = createServiceClient()

  const { data, error } = await supabaseAdmin.rpc('revoke_monthly_winners', { p_month: month })
  if (error) {
    const count = await revokeMonthlyWinnersJS(month, supabaseAdmin)
    if (count <= 0) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  try {
    await supabaseAdmin.from('AutomationLog').insert({
      jobName: 'monthly_award_revoke_all',
      jobType: 'xp_aggregation',
      triggeredBy: 'admin',
      status: 'SUCCESS',
      result: JSON.stringify({ month, revoked: data })
    })
  } catch {}

  await invalidateAllLeaderboardCache()
  return NextResponse.json({ success: true })
})
