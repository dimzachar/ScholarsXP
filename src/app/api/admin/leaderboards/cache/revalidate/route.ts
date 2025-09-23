import { withPermission } from '@/lib/auth-middleware'
import { NextRequest, NextResponse } from 'next/server'
import { multiLayerCache } from '@/lib/cache/enhanced-cache'

export const POST = withPermission('admin_access')(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const scope = searchParams.get('scope') || 'all' // 'all' or 'monthly'
  const month = searchParams.get('month') || undefined

  try {
    if (scope === 'all') {
      await multiLayerCache.clear()
      return NextResponse.json({ success: true, cleared: 'all' })
    }
    if (scope === 'monthly') {
      // Best-effort: clear everything; simple and safe for admin
      await multiLayerCache.clear()
      return NextResponse.json({ success: true, cleared: 'monthly', month })
    }
    return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to revalidate' }, { status: 500 })
  }
})
