import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { createAuthenticatedClient } from '@/lib/supabase-server'

export const GET = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'given' // 'given', 'received'
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')
    const sortBy = searchParams.get('sortBy') || 'createdAt'
    const sortOrder = searchParams.get('sortOrder') || 'desc'

    const userId = request.user.id

    // Create authenticated Supabase client that respects RLS policies
    const accessToken = request.user.access_token ||
                       request.headers.get('authorization')?.replace('Bearer ', '') ||
                       request.cookies.get('sb-access-token')?.value || ''

    const supabase = createAuthenticatedClient(
      accessToken,
      request.user.refresh_token || request.cookies.get('sb-refresh-token')?.value
    )

    let reviews = []
    let totalCount = 0

    if (type === 'given') {
      // Reviews given by the user
      const { data, error } = await supabase
        .from('PeerReview')
        .select(`
          id,
          xpScore,
          comments,
          timeSpent,
          qualityRating,
          isLate,
          createdAt,
          submission:Submission(
            id,
            url,
            platform,
            taskTypes,
            status,
            user:User(username)
          )
        `)
        .eq('reviewerId', userId)
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range(offset, offset + limit - 1)

      if (error) {
        console.error('Error fetching given reviews:', error)
        return NextResponse.json(
          { message: 'Failed to fetch reviews' },
          { status: 500 }
        )
      }

      reviews = data || []

      // Get total count
      const { count } = await supabase
        .from('PeerReview')
        .select('*', { count: 'exact', head: true })
        .eq('reviewerId', userId)

      totalCount = count || 0

    } else if (type === 'received') {
      // Reviews received by the user (on their submissions)
      const { data, error } = await supabase
        .from('PeerReview')
        .select(`
          id,
          xpScore,
          comments,
          timeSpent,
          qualityRating,
          isLate,
          createdAt,
          reviewer:User(username),
          submission:Submission!inner(
            id,
            url,
            platform,
            taskTypes,
            status
          )
        `)
        .eq('submission.userId', userId)
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range(offset, offset + limit - 1)

      if (error) {
        console.error('Error fetching received reviews:', error)
        return NextResponse.json(
          { message: 'Failed to fetch reviews' },
          { status: 500 }
        )
      }

      reviews = data || []

      // Get total count
      const { count } = await supabase
        .from('PeerReview')
        .select('*, submission!inner(*)', { count: 'exact', head: true })
        .eq('submission.userId', userId)

      totalCount = count || 0
    }

    // Calculate statistics
    const stats = {
      total: totalCount,
      averageScore: 0,
      averageQuality: 0,
      lateReviews: 0,
      averageTimeSpent: 0,
      totalXpFromReviews: 0
    }

    if (reviews.length > 0) {
      const scores = reviews.map(r => r.xpScore).filter(score => score !== null)
      const qualities = reviews.filter(r => r.qualityRating).map(r => r.qualityRating)
      const timeSpentValues = reviews.filter(r => r.timeSpent).map(r => r.timeSpent)

      stats.averageScore = scores.length > 0 
        ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
        : 0

      stats.averageQuality = qualities.length > 0
        ? Math.round((qualities.reduce((sum, quality) => sum + quality, 0) / qualities.length) * 10) / 10
        : 0

      stats.lateReviews = reviews.filter(r => r.isLate).length

      stats.averageTimeSpent = timeSpentValues.length > 0
        ? Math.round(timeSpentValues.reduce((sum, time) => sum + time, 0) / timeSpentValues.length)
        : 0

      if (type === 'given') {
        // For given reviews, calculate XP earned from reviewing
        stats.totalXpFromReviews = reviews.length * 5 // Base assumption, could be more sophisticated
      } else {
        // For received reviews, sum up the XP scores
        stats.totalXpFromReviews = scores.reduce((sum, score) => sum + score, 0)
      }
    }

    // Enrich reviews with additional context
    const enrichedReviews = reviews.map(review => {
      const enriched: any = {
        ...review,
        reviewType: type,
        daysAgo: Math.floor((Date.now() - new Date(review.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      }

      if (type === 'given') {
        enriched.submissionAuthor = review.submission?.user?.username
        enriched.submissionPlatform = review.submission?.platform
        enriched.submissionTaskTypes = review.submission?.taskTypes
      } else {
        enriched.reviewerName = review.reviewer?.username
      }

      return enriched
    })

    // Get review assignments for additional context (if type is 'given')
    let assignmentStats = null
    if (type === 'given') {
      const { data: assignments } = await supabase
        .from('ReviewAssignment')
        .select('status')
        .eq('reviewerId', userId)

      if (assignments) {
        assignmentStats = {
          total: assignments.length,
          completed: assignments.filter(a => a.status === 'COMPLETED').length,
          missed: assignments.filter(a => a.status === 'MISSED').length,
          pending: assignments.filter(a => ['PENDING', 'IN_PROGRESS'].includes(a.status)).length
        }
      }
    }

    return NextResponse.json({
      reviews: enrichedReviews,
      stats,
      assignmentStats,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: totalCount > offset + limit,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: Math.floor(offset / limit) + 1
      },
      filters: {
        type,
        sortBy,
        sortOrder
      }
    })

  } catch (error) {
    console.error('Error in user reviews endpoint:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})
