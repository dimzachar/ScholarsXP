import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { invalidateAllLeaderboardCache } from '@/lib/cache/leaderboard-cache-utils'
import { topUpMonthlyWinnerXpJS } from '@/lib/services/monthly-awards'
import { prisma } from '@/lib/prisma'

export const POST = withPermission('admin_access')(async (req: AuthenticatedRequest) => {
  try {
    const supabaseAdmin = createServiceClient()
    // Get months with activity (last 24)
    const { data: monthsData, error: monthsErr } = await supabaseAdmin.rpc('list_months_with_xp', { p_limit: 24 })
    if (monthsErr) throw new Error(monthsErr.message)
    const months: string[] = (monthsData || []).map((m: any) => m.month)
    // Process oldest -> newest so cooldown applies across months correctly
    const monthsAsc = [...months].sort()

    const awarded: string[] = []
    const skipped: string[] = []
    const errors: Array<{ month: string; error: string }> = []

    for (const m of monthsAsc) {
      // Skip only if month already has all 3 winners
      const { count: winnersCount, error: countErr } = await supabaseAdmin
        .from('MonthlyWinner')
        .select('id', { count: 'exact', head: true })
        .eq('month', m)
      if (countErr) { errors.push({ month: m, error: countErr.message }); continue }
      const hasAllThree = (winnersCount || 0) >= 3
      if (hasAllThree) { skipped.push(m) }

      // Attempt award with cooldown logic only if not already full
      if (!hasAllThree) {
        const { data: result, error } = await supabaseAdmin.rpc('award_monthly_winner', { p_month: m })
        if (error) { errors.push({ month: m, error: error.message }); continue }
        if (Array.isArray(result) ? result[0] : result) {
          awarded.push(m)
        } else {
          // No eligible candidate, consider skipped
          skipped.push(m)
        }
      }

      // Always run top-up for this month to reconcile XP (idempotent)
      try {
        await supabaseAdmin.rpc('top_up_monthly_winner_xp', { p_month: m })
      } catch (e: any) {
        errors.push({ month: m, error: `top_up_failed: ${e?.message || 'unknown'}` })
      }
      // JS fallback (idempotent) to guarantee XP top-up if SQL func missing/outdated
      try { await topUpMonthlyWinnerXpJS(m, supabaseAdmin) } catch {}
    }

    // Best-effort log
    try {
      await supabaseAdmin.from('AutomationLog').insert({
        jobName: 'monthly_award_bulk',
        jobType: 'xp_aggregation',
        triggeredBy: 'admin',
        status: 'SUCCESS',
        result: JSON.stringify({ awarded, skipped, errors })
      })
    } catch {}

    await invalidateAllLeaderboardCache()

    // Best-effort admin action log
    try {
      await prisma.adminAction.create({
        data: {
          adminId: req.user.id,
          action: 'SYSTEM_CONFIG',
          targetType: 'system',
          targetId: 'monthly_winners',
          details: { subAction: 'LEADERBOARD_WINNER_BULK_AWARD', awarded, skipped, errors },
        }
      })
    } catch (e) {
      console.warn('Bulk award admin action log failed:', e)
    }

    return NextResponse.json({ success: true, data: { awarded, skipped, errors } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Bulk award failed' }, { status: 500 })
  }
})
