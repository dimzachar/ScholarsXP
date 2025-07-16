import { NextRequest, NextResponse } from 'next/server'
import { processWeeklyReset, checkMissedReviews, getWeeklyInsights } from '@/lib/weekly-manager'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'

export const POST = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const { action } = await request.json()

    switch (action) {
      case 'reset':
        const resetResult = await processWeeklyReset()
        return NextResponse.json({
          message: 'Weekly reset completed successfully',
          result: resetResult
        })

      case 'check_missed_reviews':
        const missedCount = await checkMissedReviews()
        return NextResponse.json({
          message: 'Missed reviews check completed',
          missedReviewsCount: missedCount
        })

      default:
        return NextResponse.json(
          { message: 'Invalid action. Use "reset" or "check_missed_reviews"' },
          { status: 400 }
        )
    }

  } catch (error) {
    console.error('Error in weekly management endpoint:', error)
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
})

export const GET = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    const weekParam = searchParams.get('week')
    const weekNumber = weekParam ? parseInt(weekParam) : undefined

    const insights = await getWeeklyInsights(weekNumber)

    return NextResponse.json(insights)

  } catch (error) {
    console.error('Error getting weekly insights:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})

