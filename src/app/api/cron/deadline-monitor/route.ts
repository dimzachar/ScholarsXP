import { NextRequest, NextResponse } from 'next/server'
import { deadlineMonitorService } from '@/lib/deadline-monitor'

export async function GET(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('🕐 Starting deadline monitoring cron job...')

    // Process all deadline-related actions
    const result = await deadlineMonitorService.processDeadlines()

    console.log(`✅ Deadline monitoring complete: ${JSON.stringify(result)}`)

    return NextResponse.json({
      message: 'Deadline monitoring completed successfully',
      result
    })

  } catch (error) {
    console.error('Error in deadline monitoring cron:', error)
    return NextResponse.json(
      { 
        message: 'Deadline monitoring failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// Also allow POST for manual triggering by admins
export async function POST(request: NextRequest) {
  try {
    // This would need admin authentication in a real implementation
    // For now, we'll allow it for testing purposes
    
    console.log('🔧 Manual deadline monitoring triggered...')

    const result = await deadlineMonitorService.processDeadlines()

    return NextResponse.json({
      message: 'Manual deadline monitoring completed',
      result
    })

  } catch (error) {
    console.error('Error in manual deadline monitoring:', error)
    return NextResponse.json(
      { 
        message: 'Manual deadline monitoring failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
