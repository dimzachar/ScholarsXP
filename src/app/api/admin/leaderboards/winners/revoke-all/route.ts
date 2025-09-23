import { withPermission } from '@/lib/auth-middleware'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { invalidateAllLeaderboardCache } from '@/lib/cache/leaderboard-cache-utils'
import { revokeAllMonthlyWinnersJS } from '@/lib/services/monthly-awards'

// Bulk revoke all winners for ALL months and reverse their XP awards
export const POST = withPermission('admin_access')(async (_req: NextRequest) => {
  const supabaseAdmin = createServiceClient()

  const { data, error } = await supabaseAdmin.rpc('revoke_all_monthly_winners')
  if (error) {
    const count = await revokeAllMonthlyWinnersJS(supabaseAdmin)
    if (count <= 0) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  try {
    await supabaseAdmin.from('AutomationLog').insert({
      jobName: 'monthly_award_revoke_all_global',
      jobType: 'xp_aggregation',
      triggeredBy: 'admin',
      status: 'SUCCESS',
      result: JSON.stringify({ scope: 'all_months', revoked: data })
    })
  } catch {}

  await invalidateAllLeaderboardCache()
  return NextResponse.json({ success: true })
})
