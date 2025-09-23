import { getWeekNumber } from '@/lib/utils'

type SupabaseClientLike = any

function getMonthBounds(month: string) {
  // month is 'YYYY-MM'
  const [y, m] = month.split('-').map((v) => parseInt(v, 10))
  const start = new Date(Date.UTC(y, (m - 1), 1, 0, 0, 0))
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0)) // first day of next month
  const awardTs = new Date(end.getTime() - 1000) // last second of month
  return { start, end, awardTs }
}

export async function topUpMonthlyWinnerXpJS(month: string, supabaseAdmin: SupabaseClientLike): Promise<number> {
  try {
    const { start, end, awardTs } = getMonthBounds(month)

    const { data: winners, error: winErr } = await supabaseAdmin
      .from('MonthlyWinner')
      .select('id,userId,rank,xpAwarded,month')
      .eq('month', month)

    if (winErr || !Array.isArray(winners) || winners.length === 0) return 0

    let inserted = 0
    for (const w of winners) {
      // Check if matching XP transaction exists in bounds
      const { data: txExists, error: txErr } = await supabaseAdmin
        .from('XpTransaction')
        .select('id')
        .eq('userId', w.userId)
        .eq('amount', w.xpAwarded)
        .gte('createdAt', start.toISOString())
        .lt('createdAt', end.toISOString())
        .or(`type.eq.MONTHLY_WINNER_BONUS,description.ilike.%${month}%`)
        .limit(1)

      if (txErr) continue
      const hasTx = Array.isArray(txExists) && txExists.length > 0
      if (!hasTx) {
        // Try to insert transaction (best-effort)
        const txInsert = await supabaseAdmin.from('XpTransaction').insert({
          userId: w.userId,
          amount: w.xpAwarded,
          type: 'MONTHLY_WINNER_BONUS',
          description: `Monthly leaderboard bonus for ${month} - rank #${w.rank}`,
          weekNumber: getWeekNumber(awardTs),
          createdAt: awardTs.toISOString()
        })
        // Best-effort: bump currentWeekXp only when we added the missing TX
        try {
          const { data: userRows } = await supabaseAdmin
            .from('User')
            .select('id,currentWeekXp')
            .eq('id', w.userId)
            .limit(1)
          const u = Array.isArray(userRows) && userRows[0]
          if (u) {
            await supabaseAdmin
              .from('User')
              .update({
                currentWeekXp: (u.currentWeekXp || 0) + (w.xpAwarded || 0),
                updatedAt: new Date().toISOString()
              })
              .eq('id', w.userId)
          }
        } catch {}
        if (!txInsert.error) inserted++
      }

      // Always reconcile totalXp to sum of transactions (idempotent)
      try {
        const { data: txs } = await supabaseAdmin
          .from('XpTransaction')
          .select('amount')
          .eq('userId', w.userId)
        const calc = (txs || []).reduce((s: number, r: any) => s + (r.amount || 0), 0)
        const { data: urows } = await supabaseAdmin
          .from('User')
          .select('id,totalXp')
          .eq('id', w.userId)
          .limit(1)
        const u2 = Array.isArray(urows) && urows[0]
        if (u2 && (u2.totalXp ?? 0) !== calc) {
          await supabaseAdmin
            .from('User')
            .update({ totalXp: calc, updatedAt: new Date().toISOString() })
            .eq('id', w.userId)
        }
      } catch {}
    }
    return inserted
  } catch {
    return 0
  }
}

export async function revokeMonthlyWinnerByIdJS(winnerId: string, supabaseAdmin: SupabaseClientLike): Promise<boolean> {
  try {
    const { data: rows } = await supabaseAdmin
      .from('MonthlyWinner')
      .select('id,userId,rank,xpAwarded,month')
      .eq('id', winnerId)
      .limit(1)
    const w = Array.isArray(rows) && rows[0]
    if (!w) return true // nothing to revoke

    const { start, end, awardTs } = getMonthBounds(w.month)

    // Insert reversal transaction (best-effort)
    await supabaseAdmin.from('XpTransaction').insert({
      userId: w.userId,
      amount: -w.xpAwarded,
      type: 'MONTHLY_WINNER_BONUS_REVERSAL',
      description: `Reversal of monthly leaderboard bonus for ${w.month} - rank #${w.rank}`,
      weekNumber: getWeekNumber(awardTs),
      createdAt: awardTs.toISOString()
    })

    // Reconcile totals after reversal: set totalXp to sum of transactions; adjust week best-effort
    try {
      const { data: txs } = await supabaseAdmin
        .from('XpTransaction')
        .select('amount')
        .eq('userId', w.userId)
      const calc = (txs || []).reduce((s: number, r: any) => s + (r.amount || 0), 0)
      const { data: urows } = await supabaseAdmin
        .from('User')
        .select('id,currentWeekXp')
        .eq('id', w.userId)
        .limit(1)
      const u = Array.isArray(urows) && urows[0]
      if (u) {
        const newWeek = Math.max((u.currentWeekXp || 0) - (w.xpAwarded || 0), 0)
        await supabaseAdmin
          .from('User')
          .update({ totalXp: calc, currentWeekXp: newWeek, updatedAt: new Date().toISOString() })
          .eq('id', w.userId)
      }
    } catch {}

    // Finally delete winner row
    await supabaseAdmin.from('MonthlyWinner').delete().eq('id', winnerId)
    return true
  } catch {
    return false
  }
}

export async function revokeMonthlyWinnersJS(month: string, supabaseAdmin: SupabaseClientLike): Promise<number> {
  try {
    const { data: winners } = await supabaseAdmin
      .from('MonthlyWinner')
      .select('id')
      .eq('month', month)
    const list = (winners || []) as Array<{ id: string }>
    let revoked = 0
    for (const w of list) {
      const ok = await revokeMonthlyWinnerByIdJS(w.id, supabaseAdmin)
      if (ok) revoked++
    }
    return revoked
  } catch {
    return 0
  }
}

export async function revokeAllMonthlyWinnersJS(supabaseAdmin: SupabaseClientLike): Promise<number> {
  try {
    const { data: winners } = await supabaseAdmin
      .from('MonthlyWinner')
      .select('id')
    const list = (winners || []) as Array<{ id: string }>
    let revoked = 0
    for (const w of list) {
      const ok = await revokeMonthlyWinnerByIdJS(w.id, supabaseAdmin)
      if (ok) revoked++
    }
    return revoked
  } catch {
    return 0
  }
}
