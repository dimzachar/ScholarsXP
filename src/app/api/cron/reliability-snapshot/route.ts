import { NextRequest, NextResponse } from 'next/server'
import { takeAllSnapshots } from '@/lib/reliability/snapshot-service'

export async function GET(request: NextRequest) {
  try {
    // Optional: require CRON_SECRET for production
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await takeAllSnapshots('daily_cron')

    return NextResponse.json({
      success: true,
      snapshotsCreated: result.snapshotsCreated,
      errors: result.errors.length > 0 ? result.errors : undefined,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('[CronReliabilitySnapshot] Error:', error)
    return NextResponse.json(
      { error: 'Failed to take reliability snapshots' },
      { status: 500 }
    )
  }
}
