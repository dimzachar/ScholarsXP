import { withPermission } from '@/lib/auth-middleware'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { invalidateAllLeaderboardCache } from '@/lib/cache/leaderboard-cache-utils'
import { revokeMonthlyWinnerByIdJS } from '@/lib/services/monthly-awards'

export const DELETE = withPermission('admin_access')(async (_req: NextRequest, context: { params: Promise<{ winnerId: string }> }) => {
  const { winnerId: id } = await context.params
  const supabaseAdmin = createServiceClient()
  const { error } = await supabaseAdmin.rpc('revoke_monthly_winner_by_id', { p_winner_id: id })
  if (error) {
    // Fallback to JS implementation
    const ok = await revokeMonthlyWinnerByIdJS(id, supabaseAdmin)
    if (!ok) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  try {
    await supabaseAdmin.from('AutomationLog').insert({
      jobName: 'monthly_award_revoke',
      jobType: 'xp_aggregation',
      triggeredBy: 'admin',
      status: 'SUCCESS',
      result: JSON.stringify({ id, action: 'revoked_with_reversal' })
    })
  } catch {}

  await invalidateAllLeaderboardCache()
  return NextResponse.json({ success: true })
})
