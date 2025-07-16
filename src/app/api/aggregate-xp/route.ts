import { NextRequest, NextResponse } from 'next/server'
import { aggregateXP, processReadySubmissions } from '@/lib/xp-aggregator'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'

export const POST = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const { submissionId, processAll } = await request.json()

    if (processAll) {
      // Process all ready submissions
      const processedCount = await processReadySubmissions()
      
      return NextResponse.json({
        message: `Processed ${processedCount} submissions`,
        processedCount
      })
    }

    if (!submissionId) {
      return NextResponse.json(
        { message: 'Submission ID is required when not processing all' },
        { status: 400 }
      )
    }

    // Process specific submission
    const result = await aggregateXP(submissionId)

    return NextResponse.json({
      message: 'XP aggregation completed successfully',
      result
    })

  } catch (error) {
    console.error('Error in XP aggregation endpoint:', error)
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
})

