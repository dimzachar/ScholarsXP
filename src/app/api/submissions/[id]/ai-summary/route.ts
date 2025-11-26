import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase-server'
import { generateReviewSummary } from '@/lib/ai-summary'
import { QueryCache, CacheTTL } from '@/lib/cache/query-cache'

export const GET = withPermission('authenticated')(async (
  request: AuthenticatedRequest,
  props: { params: Promise<{ id: string }> }
) => {
  console.log(`🔍 AI Summary API called - raw params:`, props)

  try {
    const params = await props.params
    const submissionId = params.id
    const userId = request.user.id

    // console.log(`🔍 AI Summary API called for submission ${submissionId} by user ${userId}`)

    // Check cache first
    const cacheKey = QueryCache.createKey('submission_ai_summary', { submissionId })
    // console.log(`🔑 Cache key created: ${cacheKey}`)

    const cachedSummary = await QueryCache.get<string>(cacheKey)
    // console.log(`💾 Cache result:`, cachedSummary ? 'HIT' : 'MISS')

    // Don't use cached error messages
    if (cachedSummary && !cachedSummary.startsWith('Failed to generate')) {
      // console.log(`✅ Returning cached summary (length: ${cachedSummary.length})`)
      return NextResponse.json({ summary: cachedSummary, cached: true })
    } else if (cachedSummary) {
      // console.log(`⚠️ Cached value is an error message, regenerating...`)
    }

    // console.log(`📊 Fetching submission data from database...`)
    const supabase = createServiceClient()

    // Fetch submission and reviews
    const { data: submission, error: subError } = await supabase
      .from('Submission')
      .select('title, status, userId')
      .eq('id', submissionId)
      .single()

    // console.log(`📊 Submission fetch result:`, { found: !!submission, error: !!subError })

    if (subError || !submission) {
      // console.log(`❌ Submission not found`)
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    // Only allow owner to see summary
    if (submission.userId !== userId) {
      // console.log(`❌ Unauthorized access attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // console.log(`📊 Fetching reviews...`)
    // Check if finalized or has enough reviews
    const { data: reviews, error: reviewError } = await supabase
      .from('PeerReview')
      .select('comments, xpScore, qualityRating')
      .eq('submissionId', submissionId)

    // console.log(`📊 Reviews fetch result:`, { count: reviews?.length || 0, error: !!reviewError })

    if (reviewError) {
      // console.log(`❌ Failed to fetch reviews`)
      return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 })
    }

    const reviewCount = reviews?.length || 0
    const isFinalized = submission.status === 'FINALIZED' || submission.status === 'COMPLETED'

    // console.log(`📊 Status check:`, { reviewCount, isFinalized, status: submission.status })

    if (!isFinalized && reviewCount < 3) {
      // console.log(`⚠️ Not enough reviews for summary: ${reviewCount} reviews, status: ${submission.status}`)
      return NextResponse.json({ summary: null, message: 'Not enough reviews for summary' })
    }

    // console.log(`🚀 Generating summary for submission ${submissionId} (${reviewCount} reviews)`)

    // Generate summary
    const summary = await generateReviewSummary(submission.title || 'Untitled Submission', reviews || [])

    // console.log(`✅ Summary generated (length: ${summary.length})`)
    // console.log(`📝 Summary preview: ${summary.substring(0, 100)}...`)

    // Only cache successful summaries, not error messages
    if (!summary.startsWith('Failed to generate') && !summary.startsWith('No detailed feedback')) {
      await QueryCache.set(cacheKey, summary, CacheTTL.SUBMISSION_DETAILS * 12)
      // console.log(`💾 Summary cached`)
    } else {
      // console.log(`⚠️ Not caching error/empty message`)
    }

    return NextResponse.json({ summary, cached: false })

  } catch (error) {
    // console.error('❌ Error in AI summary API:', error)
    // console.error('Error details:', {
    //   message: error instanceof Error ? error.message : 'Unknown error',
    //   stack: error instanceof Error ? error.stack : undefined,
    //   type: typeof error
    // })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
