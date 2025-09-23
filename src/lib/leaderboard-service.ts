import { supabaseClient } from '@/lib/supabase'
import { createServiceClient } from '@/lib/supabase-server'

export type MonthlyStanding = {
  userId: string
  total: number
  user?: { id: string; username: string | null; email?: string; profileImageUrl?: string | null; totalXp?: number }
}

export type MonthlyWinner = {
  id: string
  userId: string
  month: string
  awardedAt: string
  rank: number
  xpAwarded: number
}

export async function listMonthsWithData(limit = 12): Promise<string[]> {
  const { data, error } = await supabaseClient.rpc('list_months_with_xp', { p_limit: limit })
  if (error) {
    console.error('listMonthsWithData error:', error)
    return []
  }
  // data is array of { month: string, events: number }
  return (data || []).map((row: any) => row.month)
}

export function getCurrentMonthUTC(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = (now.getUTCMonth() + 1).toString().padStart(2, '0')
  return `${y}-${m}`
}

export async function getMonthlyLeaderboard(month: string, limit = 20, offset = 0): Promise<MonthlyStanding[]> {
  // Validation: basic YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Invalid month format, expected YYYY-MM')
  // Use service client to avoid RLS gaps on aggregated RPC over XpTransaction
  const supabaseAdmin = createServiceClient()
  const { data, error } = await supabaseAdmin.rpc('get_monthly_leaderboard', {
    p_month: month,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) {
    console.error('getMonthlyLeaderboard error:', error)
    return []
  }

  const standings = (data || []).map((row: any) => ({ userId: row.userId, total: Number(row.total) }))

  // Enrich with user data (batch fetch)
  if (standings.length === 0) return []
  const ids = standings.map((s) => s.userId)
  const { data: users, error: userErr } = await supabaseAdmin
    .from('User')
    .select('id, username, email, totalXp, profileImageUrl')
    .in('id', ids)
  if (userErr) {
    console.warn('Could not enrich monthly standings with user data:', userErr)
    return standings
  }
  const userMap = new Map((users || []).map((u) => [u.id, u]))
  return standings.map((s) => ({ ...s, user: userMap.get(s.userId) }))
}

export async function getMonthlyWinners(month: string): Promise<MonthlyWinner[]> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Invalid month format, expected YYYY-MM')
  // Try selecting extended columns; fallback to legacy schema
  const { data, error } = await supabaseClient
    .from('MonthlyWinner')
    .select('id, userId, month, awardedAt, rank, xpAwarded')
    .eq('month', month)
    .order('rank', { ascending: true })
  if (error) {
    const legacy = await supabaseClient
      .from('MonthlyWinner')
      .select('id, userId, month, awardedAt')
      .eq('month', month)
      .maybeSingle()
    if (legacy.error) throw legacy.error
    const row = legacy.data
    return row ? [{ id: row.id, userId: row.userId, month: row.month, awardedAt: row.awardedAt, rank: 1, xpAwarded: 0 }] : []
  }
  return (data || []) as unknown as MonthlyWinner[]
}

export async function awardMonthlyWinners(month: string): Promise<MonthlyWinner[]> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Invalid month format, expected YYYY-MM')
  const { data, error } = await supabaseClient.rpc('award_monthly_winners', { p_month: month })
  if (error) throw error
  const rows = Array.isArray(data) ? data : [data]
  // Normalize RPC result: map month_text -> month to honor MonthlyWinner shape
  return (rows || []).map((row: any) => {
    if (!row) return row
    const { month_text, ...rest } = row
    return { ...rest, month: month_text } as MonthlyWinner
  })
}
