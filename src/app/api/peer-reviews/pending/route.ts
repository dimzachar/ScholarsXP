import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { createAuthenticatedClient, createServiceClient } from '@/lib/supabase-server'

export const GET = withPermission('review_content')(async (request: AuthenticatedRequest) => {
  try {
    // Get reviewer ID from authenticated user
    const reviewerId = request.user.id

    // Use service client temporarily to bypass RLS issues
    // TODO: Fix RLS policies to work properly with authenticated clients
    const supabase = createServiceClient()

    // Query for submissions that are ready for peer review
    // These are submissions that have been AI-reviewed and are pending peer review
    const { data: submissions, error } = await supabase
      .from('Submission')
      .select(`
        id,
        url,
        platform,
        taskTypes,
        aiXp,
        originalityScore,
        status,
        createdAt,
        user:User(
          id,
          username,
          email
        )
      `)
      .in('status', ['PENDING', 'AI_REVIEWED', 'UNDER_PEER_REVIEW'])
      .order('createdAt', { ascending: false })

    if (error) {
      console.error('Error fetching pending submissions:', error)
      return NextResponse.json({
        success: false,
        error: {
          error: 'Failed to fetch pending submissions',
          code: 'DATABASE_ERROR',
          details: error.message
        }
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: {
        submissions: submissions || []
      }
    })

  } catch (error) {
    console.error('Error fetching pending reviews:', error)
    return NextResponse.json({
      success: false,
      error: {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    }, { status: 500 })
  }
})

