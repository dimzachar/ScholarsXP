import { withRole } from '@/lib/auth-middleware'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export const GET = withRole('ADMIN')(async (req: NextRequest) => {
  const supabaseAdmin = createServiceClient()
  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') || '').trim()
  const limit = Math.min(20, Math.max(1, Number(searchParams.get('limit') || 10)))

  if (!q) {
    return NextResponse.json({ success: true, data: [] })
  }

  // Search by username or email (case-insensitive)
  const { data, error } = await supabaseAdmin
    .from('User')
    .select('id, username, email')
    .or(`username.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
})
