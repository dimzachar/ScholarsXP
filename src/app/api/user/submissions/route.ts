import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { createAuthenticatedClient } from '@/lib/supabase-server'

export const GET = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // 'all', 'pending', 'finalized', etc.
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')
    const sortBy = searchParams.get('sortBy') || 'createdAt' // 'createdAt', 'finalXp', 'status'
    const sortOrder = searchParams.get('sortOrder') || 'desc' // 'asc', 'desc'

    const userId = request.user.id

    // Create authenticated Supabase client that respects RLS policies
    const accessToken = request.user.access_token ||
                       request.headers.get('authorization')?.replace('Bearer ', '') ||
                       request.cookies.get('sb-access-token')?.value || ''

    const supabase = createAuthenticatedClient(
      accessToken,
      request.user.refresh_token || request.cookies.get('sb-refresh-token')?.value
    )

    // Build query
    let query = supabase
      .from('Submission')
      .select(`
        id,
        url,
        platform,
        taskTypes,
        aiXp,
        originalityScore,
        peerXp,
        finalXp,
        status,
        reviewDeadline,
        consensusScore,
        reviewCount,
        flagCount,
        createdAt,
        updatedAt,
        weekNumber,
        peerReviews:PeerReview(
          id,
          xpScore,
          comments,
          qualityRating,
          isLate,
          createdAt,
          reviewer:User(username)
        )
      `)
      .eq('userId', userId)

    // Apply status filter
    if (status && status !== 'all') {
      query = query.eq('status', status.toUpperCase())
    }

    // Apply sorting
    const validSortFields = ['createdAt', 'finalXp', 'status', 'aiXp']
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt'
    const ascending = sortOrder === 'asc'
    
    query = query.order(sortField, { ascending })

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data: submissions, error } = await query

    if (error) {
      console.error('Error fetching user submissions:', error)
      return NextResponse.json(
        { message: 'Failed to fetch submissions' },
        { status: 500 }
      )
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('Submission')
      .select('*', { count: 'exact', head: true })
      .eq('userId', userId)

    if (status && status !== 'all') {
      countQuery = countQuery.eq('status', status.toUpperCase())
    }

    const { count, error: countError } = await countQuery

    if (countError) {
      console.error('Error counting submissions:', countError)
    }

    // Calculate statistics
    const stats = {
      total: count || 0,
      pending: 0,
      aiReviewed: 0,
      underReview: 0,
      finalized: 0,
      flagged: 0,
      rejected: 0,
      totalXpEarned: 0,
      averageXpPerSubmission: 0
    }

    if (submissions) {
      submissions.forEach(submission => {
        switch (submission.status) {
          case 'PENDING':
            stats.pending++
            break
          case 'AI_REVIEWED':
            stats.aiReviewed++
            break
          case 'UNDER_PEER_REVIEW':
            stats.underReview++
            break
          case 'FINALIZED':
            stats.finalized++
            if (submission.finalXp) {
              stats.totalXpEarned += submission.finalXp
            }
            break
          case 'FLAGGED':
            stats.flagged++
            break
          case 'REJECTED':
            stats.rejected++
            break
        }
      })

      if (stats.finalized > 0) {
        stats.averageXpPerSubmission = Math.round(stats.totalXpEarned / stats.finalized)
      }
    }

    // Enrich submissions with additional data
    const enrichedSubmissions = submissions?.map(submission => ({
      ...submission,
      reviewSummary: {
        totalReviews: submission.peerReviews?.length || 0,
        averageScore: submission.peerReviews?.length > 0
          ? Math.round(submission.peerReviews.reduce((sum: number, review: any) => sum + review.xpScore, 0) / submission.peerReviews.length)
          : null,
        lateReviews: submission.peerReviews?.filter((review: any) => review.isLate).length || 0,
        averageQuality: submission.peerReviews?.filter((review: any) => review.qualityRating).length > 0
          ? Math.round((submission.peerReviews
              .filter((review: any) => review.qualityRating)
              .reduce((sum: number, review: any) => sum + review.qualityRating, 0) / 
              submission.peerReviews.filter((review: any) => review.qualityRating).length) * 10) / 10
          : null
      },
      timeToReview: submission.reviewDeadline && submission.status === 'UNDER_PEER_REVIEW'
        ? Math.max(0, Math.floor((new Date(submission.reviewDeadline).getTime() - Date.now()) / (1000 * 60 * 60)))
        : null
    })) || []

    return NextResponse.json({
      submissions: enrichedSubmissions,
      stats,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
        totalPages: Math.ceil((count || 0) / limit),
        currentPage: Math.floor(offset / limit) + 1
      },
      filters: {
        status,
        sortBy: sortField,
        sortOrder
      }
    })

  } catch (error) {
    console.error('Error in user submissions endpoint:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})
