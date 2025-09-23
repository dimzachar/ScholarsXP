import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { recalculateUserTotals } from '@/lib/services/xp-propagation'

export const POST = withPermission('admin_access')(async (request: AuthenticatedRequest, { params }: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await params
    const result = await recalculateUserTotals(id)

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: result.message })
  } catch (error) {
    console.error('Error recalculating user totals:', error)
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 })
  }
})

