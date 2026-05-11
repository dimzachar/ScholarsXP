import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { queryShadowLogs } from '@/lib/reviewer-fairness-shadow'
import { ALGORITHMS, type AlgorithmId } from '@/lib/reviewer-fairness-algorithms'

export const POST = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const body = await request.json()
    const { startDate, endDate, algorithmIds } = body as {
      startDate?: string
      endDate?: string
      algorithmIds?: AlgorithmId[]
    }

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      )
    }

    // Treat bare YYYY-MM-DD as day boundaries in UTC so `endDate = today`
    // includes events from today (not just up to midnight this morning).
    const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
    const start = DATE_ONLY.test(startDate)
      ? new Date(`${startDate}T00:00:00.000Z`)
      : new Date(startDate)
    const end = DATE_ONLY.test(endDate)
      ? new Date(`${endDate}T23:59:59.999Z`)
      : new Date(endDate)

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 }
      )
    }

    if (start > end) {
      return NextResponse.json(
        { error: 'startDate must be before endDate' },
        { status: 400 }
      )
    }

    // Cap at 90 days
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    if (diffDays > 90) {
      return NextResponse.json(
        { error: 'Date range cannot exceed 90 days' },
        { status: 400 }
      )
    }

    const ids = algorithmIds?.length
      ? algorithmIds.filter(id => ALGORITHMS.some(a => a.id === id))
      : undefined

    const result = await queryShadowLogs(start, end, ids)

    return NextResponse.json({ success: true, ...result })
  } catch (error: unknown) {
    const err = error as Error
    console.error('[FairnessShadow API] Query error:', err)
    return NextResponse.json(
      { error: 'Shadow query failed', details: err.message },
      { status: 500 }
    )
  }
})

export const GET = withPermission('admin_access')(async (_request: AuthenticatedRequest) => {
  return NextResponse.json({
    algorithms: ALGORITHMS,
    note: 'POST with { startDate, endDate, algorithmIds? } to query shadow logs'
  })
})
