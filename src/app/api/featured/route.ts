import { NextResponse } from 'next/server'
import { getFeatured } from '@/lib/featured-service'
import { withPublicOptimization } from '@/middleware/api-optimization'

export const revalidate = 60

export const GET = withPublicOptimization(async (request: Request) => {
  const { searchParams } = new URL(request.url)
  const range = (searchParams.get('range') || 'week').toLowerCase()
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 24)))
  const rankerParam = (searchParams.get('ranker') || 'baseline').toLowerCase()
  const authorBoost = (searchParams.get('authorBoost') || 'false').toLowerCase() === 'true'
  const autoTune = (searchParams.get('autoTune') || 'false').toLowerCase() === 'true'

  const ranker = ['baseline', 'eb', 'zscore', 'conf'].includes(rankerParam) ? (rankerParam as any) : 'baseline'

  if (!['week', 'month', 'all'].includes(range)) {
    return NextResponse.json({ success: false, error: 'Invalid range' }, { status: 400 })
  }

  try {
    const items = await getFeatured(range as any, limit, { ranker, authorBoost, autoTune })
    return NextResponse.json({ success: true, data: { range, ranker, authorBoost, autoTune, items } })
  } catch (e: any) {
    console.error('Featured API error', e)
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
})
