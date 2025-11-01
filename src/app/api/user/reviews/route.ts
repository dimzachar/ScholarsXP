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

    let reviews: any[] = []
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
        // For given reviews, we'll replace this with real XP from XpTransaction below
        stats.totalXpFromReviews = 0
      } else {
        // For received reviews, sum up the XP scores from peer reviews
        stats.totalXpFromReviews = scores.reduce((sum, score) => sum + score, 0)
      }
    }

    // If type is 'given', pull review reward XP from XpTransaction (type=REVIEW_REWARD)
    let reviewXpBySubmissionId: Record<string, number> = {}
    let reviewXpPartsBySubmissionId: Record<string, { base: number; bonus: number }> = {}
    if (type === 'given') {
      const submissionIds = reviews
        .map((r: any) => r?.submission?.id)
        .filter((id: any): id is string => Boolean(id))

      if (submissionIds.length > 0) {
        const { data: xpRows, error: xpErr } = await supabase
          .from('XpTransaction')
          .select('sourceId, amount, type, createdAt, description')
          .eq('userId', userId)
          .eq('type', 'REVIEW_REWARD')
          .in('sourceId', submissionIds)

        if (!xpErr && xpRows) {
          // Compute base and bonus per submission by parsing description
          const partsBySource: Record<string, { base: number; bonus: number }> = {}
          for (const row of xpRows) {
            const sid = row.sourceId as string
            if (!sid) continue
            const desc = (row as any)?.description?.toLowerCase?.() || ''
            const isBonus = desc.startsWith('quality bonus')
            const isBase = desc.startsWith('review reward')
            const entry = partsBySource[sid] || { base: 0, bonus: 0 }
            if (isBonus) entry.bonus += row.amount || 0
            else if (isBase) entry.base += row.amount || 0
            else entry.base += row.amount || 0 // fallback: count as base
            partsBySource[sid] = entry
          }

          // Total per submission = base + bonus
          reviewXpBySubmissionId = Object.fromEntries(
            Object.entries(partsBySource).map(([k, v]) => [k, (v.base || 0) + (v.bonus || 0)])
          )

          // Update stats.totalXpFromReviews using totals
          stats.totalXpFromReviews = Object.values(partsBySource).reduce((sum, v) => sum + (v.base || 0) + (v.bonus || 0), 0)

          // Keep parts map for later enrichment
          reviewXpPartsBySubmissionId = partsBySource
        } else {
          console.warn('Failed to load review reward XP transactions:', xpErr)
        }
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
        const sid = review?.submission?.id
        if (sid && reviewXpBySubmissionId[sid] !== undefined) {
          enriched.reviewRewardXp = reviewXpBySubmissionId[sid]
          const parts = reviewXpPartsBySubmissionId[sid]
          if (parts) {
            enriched.reviewRewardXpBase = parts.base || 0
            enriched.reviewRewardXpBonus = parts.bonus || 0
          }
        }
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
