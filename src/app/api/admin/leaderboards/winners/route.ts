import { withPermission } from '@/lib/auth-middleware'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export const GET = withPermission('admin_access')(async (request: NextRequest) => {
  const supabaseAdmin = createServiceClient()
  const { searchParams } = new URL(request.url)
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 20)))
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const offset = (page - 1) * limit

  // Try selecting extended columns; fallback if columns not present
  const query = supabaseAdmin
    .from('MonthlyWinner')
    .select('id, userId, month, awardedAt, rank, xpAwarded')
    .order('month', { ascending: false })
    .order('rank', { ascending: true })
    .range(offset, offset + limit - 1)

  const { data: initialData, error } = await query
  let data = initialData
  if (error) {
    // Fallback for older schema (no rank/xpAwarded)
    const fallback = await supabaseAdmin
      .from('MonthlyWinner')
      .select('id, userId, month, awardedAt')
      .order('month', { ascending: false })
      .range(offset, offset + limit - 1)
    if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 })
    data = (fallback.data || []).map((d: any) => ({ ...d, rank: null, xpAwarded: null }))
  }

  // total count for pagination
  const { count } = await supabaseAdmin
    .from('MonthlyWinner')
    .select('*', { count: 'exact', head: true })

  // Enrich with user
  const ids = (data || []).map((d) => d.userId)
  const { data: users } = await supabaseAdmin
    .from('User')
    .select('id, username, email, profileImageUrl')
    .in('id', ids)
  const userMap = new Map((users || []).map((u) => [u.id, u]))

  const items = (data || []).map((row) => ({
    ...row,
    user: userMap.get(row.userId) || null,
  }))

  return NextResponse.json({ success: true, data: { items, page, limit, totalCount: count || 0 } })
})
