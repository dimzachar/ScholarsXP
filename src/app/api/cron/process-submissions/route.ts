import { NextRequest, NextResponse } from 'next/server'
import { submissionProcessingQueue } from '@/lib/submission-processing-queue'

/**
 * Background job endpoint for processing queued submissions
 * Called by Supabase pg_cron every minute
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🔄 [CRON] Starting submission processing job...')
    
    // Process the submission queue
    const result = await submissionProcessingQueue.processQueue()
    
    console.log(`✅ [CRON] Submission processing complete: ${result.processed} processed, ${result.failed} failed`)
    
    return NextResponse.json({
      success: true,
      processed: result.processed,
      failed: result.failed,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ [CRON] Error in submission processing job:', error)
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}

/**
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'submission-processing-cron',
    timestamp: new Date().toISOString()
  })
}
