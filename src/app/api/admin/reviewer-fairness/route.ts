import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { runSimulation } from '@/lib/reviewer-fairness-simulator'
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

    const start = new Date(startDate)
    const end = new Date(endDate)

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

    const ids = algorithmIds?.length
      ? algorithmIds.filter(id => ALGORITHMS.some(a => a.id === id))
      : undefined

    console.log(`[ReviewerFairness] Running simulation: ${startDate} ΓåÆ ${endDate}`)
    const result = await runSimulation(start, end, ids)
    console.log(`[ReviewerFairness] Simulation complete: ${result.totalSubmissions} submissions, ${result.algorithms.length} algorithms`)

    return NextResponse.json({ success: true, ...result })
  } catch (error: unknown) {
    const err = error as Error
    console.error('[ReviewerFairness] Simulation error:', err)
    return NextResponse.json(
      { error: 'Simulation failed', details: err.message },
      { status: 500 }
    )
  }
})

export const GET = withPermission('admin_access')(async (_request: AuthenticatedRequest) => {
  return NextResponse.json({
    algorithms: ALGORITHMS,
    defaultDateRange: {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0]
    }
  })
})
