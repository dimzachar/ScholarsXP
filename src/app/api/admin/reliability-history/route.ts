import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { getHistory } from '@/lib/reliability/snapshot-service'

export const GET = withPermission('admin_access')(
  async (request: AuthenticatedRequest) => {
    try {
      const url = new URL(request.url)
      const rawDays = parseInt(url.searchParams.get('days') || '30')
      const days = Number.isFinite(rawDays) ? rawDays : 30
      const userId = url.searchParams.get('userId') || undefined
      const rawLimit = parseInt(url.searchParams.get('limit') || '50')
      const limit = Number.isFinite(rawLimit) ? rawLimit : 50
      const rawOffset = parseInt(url.searchParams.get('offset') || '0')
      const offset = Number.isFinite(rawOffset) ? rawOffset : 0

      const result = await getHistory({ days, userId, limit, offset })

      return NextResponse.json({
        snapshots: result.snapshots,
        aggregate: result.aggregate,
        total: result.total,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
        individual: result.individual,
      })
    } catch (error) {
      console.error('[ReliabilityHistory] Error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch reliability history' },
        { status: 500 }
      )
    }
  }
)
