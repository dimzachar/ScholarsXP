import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase-server'
import { generateReviewSummary } from '@/lib/ai-summary'
import { QueryCache, CacheTTL } from '@/lib/cache/query-cache'

export const GET = withPermission('authenticated')(async (
  request: AuthenticatedRequest,
  props: { params: Promise<{ id: string }> }
) => {
  // console.log(`🔍 AI Summary API called - raw params:`, props)

  try {
    const params = await props.params
    const submissionId = params.id
    const userId = request.user.id

    // console.log(`🔍 AI Summary API called for submission ${submissionId} by user ${userId}`)

    const supabase = createServiceClient()

    // Fetch submission with aiSummary
    const { data: submission, error: subError } = await supabase
      .from('Submission')
      .select('title, status, userId, aiSummary, summaryGeneratedAt')
      .eq('id', submissionId)
      .single()

    if (subError || !submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }

    // Only allow owner to see summary
    if (submission.userId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Check if we already have a summary in the database
    if (submission.aiSummary && !submission.aiSummary.startsWith('Failed to generate')) {
      // console.log(`✅ Returning DB cached summary`)
      return NextResponse.json({
        summary: submission.aiSummary,
        cached: true,
        generatedAt: submission.summaryGeneratedAt
      })
    }

    // If no summary in DB, we need to generate it
    // Check if finalized or has enough reviews
    const { data: reviews, error: reviewError } = await supabase
      .from('PeerReview')
      .select('comments, xpScore, qualityRating')
      .eq('submissionId', submissionId)

    if (reviewError) {
      return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 })
    }

    const reviewCount = reviews?.length || 0
    const isFinalized = submission.status === 'FINALIZED' || submission.status === 'COMPLETED'

    if (!isFinalized && reviewCount < 3) {
      return NextResponse.json({ summary: null, message: 'Not enough reviews for summary' })
    }

    // Generate summary
    const summary = await generateReviewSummary(submission.title || 'Untitled Submission', reviews || [])

    // Save to database if successful
    if (!summary.startsWith('Failed to generate') && !summary.startsWith('No detailed feedback')) {
      await supabase
        .from('Submission')
        .update({
          aiSummary: summary,
          summaryGeneratedAt: new Date().toISOString()
        })
        .eq('id', submissionId)

      // console.log(`💾 Summary saved to database`)
    }

    return NextResponse.json({ summary, cached: false })

  } catch (error) {
    console.error('❌ Error in AI summary API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
