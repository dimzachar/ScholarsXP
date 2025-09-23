import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandling } from '@/lib/api-middleware'
import { getCurrentMonthUTC } from '@/lib/leaderboard-service'
import { multiLayerCache } from '@/lib/cache/enhanced-cache'
import { createServiceClient } from '@/lib/supabase-server'
import { withPublicOptimization } from '@/middleware/api-optimization'

export const GET = withPublicOptimization(withErrorHandling(async (_request: NextRequest) => {
  const cacheKey = `leaderboard:months`
  let data = await multiLayerCache.get<any>(cacheKey)
  if (!data) {
    // Months with XP transactions (use service client to avoid RLS gaps)
    const supabaseAdmin = createServiceClient()
    const { data: monthsXpRows } = await supabaseAdmin.rpc('list_months_with_xp', { p_limit: 24 })
    const monthsWithXp: string[] = (monthsXpRows || []).map((row: any) => row.month)

    // Also include months that have a recorded winner (in case XP was imported differently)
    const { data: winnerRows } = await supabaseAdmin
      .from('MonthlyWinner')
      .select('month')

    const monthsWithWinners = (winnerRows || []).map((r: any) => r.month)

    // Ensure current month is present, even if no data yet
    const current = getCurrentMonthUTC()
    const set = new Set<string>([...monthsWithXp, ...monthsWithWinners, current])
    data = { months: Array.from(set).sort().reverse() }
    await multiLayerCache.set(cacheKey, data, 300)
  }
  return NextResponse.json({ success: true, data })
}))
