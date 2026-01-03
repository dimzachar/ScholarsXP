import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { getWeekNumber } from '@/lib/utils'

export const GET = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // 'all', 'pending', 'finalized', etc.
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')
    const sortBy = searchParams.get('sortBy') || 'createdAt' // 'createdAt', 'finalXp', 'status'
    const sortOrder = searchParams.get('sortOrder') || 'desc' // 'asc', 'desc'

    const userId = request.user.id

    // Create service client for database queries (auth handled by middleware)
    const { createServiceClient } = await import('@/lib/supabase-server')
    const supabase = createServiceClient()

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

    // Get user's discord handle to fetch legacy submissions
    const { data: userProfile, error: userError } = await supabase
      .from('User')
      .select('discordHandle')
      .eq('id', userId)
      .single()

    let legacySubmissions = []
    if (!userError && userProfile?.discordHandle) {
      // Fetch legacy submissions for this user
      const { data: legacyData, error: legacyError } = await supabase
        .from('LegacySubmission')
        .select('id, url, discordHandle, submittedAt, role, notes, importedAt, aiXp, peerXp, finalXp')
        .eq('discordHandle', userProfile.discordHandle)
        .order('importedAt', { ascending: false })

      if (!legacyError && legacyData) {
        // Convert legacy submissions to submission format
        legacySubmissions = legacyData.map(legacy => {
          // Calculate correct week number from submission timestamp
          const submissionDate = legacy.submittedAt || legacy.importedAt
          const weekNumber = submissionDate ? getWeekNumber(new Date(submissionDate)) : 1

          return {
            id: legacy.id,
            url: legacy.url,
            platform: 'LEGACY',
            taskTypes: ['LEGACY'],
            aiXp: legacy.aiXp || 0,
            originalityScore: null,
            peerXp: legacy.peerXp,
            finalXp: legacy.finalXp,
            status: 'LEGACY_IMPORTED',
            reviewDeadline: null,
            consensusScore: null,
            reviewCount: 0,
            flagCount: 0,
            createdAt: submissionDate,
            updatedAt: legacy.importedAt,
            weekNumber: weekNumber,
            peerReviews: [] // Legacy submissions don't have peer reviews
          }
        })
      }
    }

    // Combine regular and legacy submissions
    const allSubmissions = [...(submissions || []), ...legacySubmissions]

    // Apply status filter to combined results if needed
    const filteredSubmissions = status && status !== 'all'
      ? allSubmissions.filter(sub => sub.status === status.toUpperCase())
      : allSubmissions

    // Apply sorting to combined results
    const sortedSubmissions = filteredSubmissions.sort((a, b) => {
      const aValue = a[sortField]
      const bValue = b[sortField]

      if (sortField === 'createdAt') {
        const aDate = new Date(aValue).getTime()
        const bDate = new Date(bValue).getTime()
        return ascending ? aDate - bDate : bDate - aDate
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return ascending ? aValue - bValue : bValue - aValue
      }

      return ascending
        ? String(aValue).localeCompare(String(bValue))
        : String(bValue).localeCompare(String(aValue))
    })

    // Apply pagination to sorted results
    const paginatedSubmissions = sortedSubmissions.slice(offset, offset + limit)

    // Get total count for pagination (regular + legacy)
    let countQuery = supabase
      .from('Submission')
      .select('*', { count: 'exact', head: true })
      .eq('userId', userId)

    if (status && status !== 'all') {
      countQuery = countQuery.eq('status', status.toUpperCase())
    }

    const { count: regularCount, error: countError } = await countQuery

    if (countError) {
      console.error('Error counting submissions:', countError)
    }

    // Count legacy submissions using discordHandle or username
    let legacyCount = 0
    if (!userError && userProfile) {
      const discordHandle = userProfile.discordHandle || userProfile.username
      if (discordHandle) {
        const { count: legacyCountResult, error: legacyCountError } = await supabase
          .from('LegacySubmission')
          .select('*', { count: 'exact', head: true })
          .eq('discordHandle', discordHandle)

        if (!legacyCountError) {
          legacyCount = legacyCountResult || 0
        }
      }
    }

    const totalCount = (regularCount || 0) + legacyCount

    // Calculate statistics using all submissions (regular + legacy)
    const stats = {
      total: totalCount,
      pending: 0,
      aiReviewed: 0,
      underReview: 0,
      finalized: 0,
      flagged: 0,
      rejected: 0,
      legacyImported: 0,
      totalXpEarned: 0,
      averageXpPerSubmission: 0
    }

    // Count all submissions for statistics
    allSubmissions.forEach(submission => {
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
          break
        case 'FLAGGED':
          stats.flagged++
          break
        case 'REJECTED':
          stats.rejected++
          break
        case 'LEGACY_IMPORTED':
          stats.legacyImported++
          break
      }

      // Add XP from this submission
      if (submission.finalXp) {
        stats.totalXpEarned += submission.finalXp
      } else if (submission.aiXp) {
        stats.totalXpEarned += submission.aiXp
      }
    })

    // Calculate average XP per submission
    if (stats.total > 0) {
      stats.averageXpPerSubmission = Math.round(stats.totalXpEarned / stats.total)
    }

    // Enrich paginated submissions with additional data
    const enrichedSubmissions = paginatedSubmissions.map(submission => ({
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
    }))

    return NextResponse.json({
      submissions: enrichedSubmissions,
      stats,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: totalCount > offset + limit,
        totalPages: Math.ceil(totalCount / limit),
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
