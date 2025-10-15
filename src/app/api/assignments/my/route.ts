import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { withErrorHandling, createSuccessResponse } from '@/lib/api-middleware'

export const GET = withPermission('review_content')(
  withErrorHandling(async (request: AuthenticatedRequest) => {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') // 'pending', 'completed', 'all'
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    const reviewerId = request.user.id

    // Create authenticated Supabase client that respects RLS policies
    const accessToken = request.user.access_token ||
                       request.headers.get('authorization')?.replace('Bearer ', '') ||
                       request.cookies.get('sb-access-token')?.value || ''

    const supabase = createAuthenticatedClient(
      accessToken,
      request.user.refresh_token || request.cookies.get('sb-refresh-token')?.value
    )

    // Build query based on status filter
    let query = supabase
      .from('ReviewAssignment')
      .select(`
        *,
        submission:Submission(
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
        )
      `)
      .eq('reviewerId', reviewerId)
      .order('assignedAt', { ascending: false })

    // Apply status filter
    if (status === 'pending') {
      query = query.in('status', ['PENDING', 'IN_PROGRESS'])
    } else if (status === 'completed') {
      query = query.eq('status', 'COMPLETED')
    } else if (status === 'missed') {
      query = query.eq('status', 'MISSED')
    }
    // 'all' or no filter shows everything

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data: assignments, error } = await query

    if (error) {
      console.error('Error fetching assignments:', error)
      throw error
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('ReviewAssignment')
      .select('*', { count: 'exact', head: true })
      .eq('reviewerId', reviewerId)

    if (status === 'pending') {
      countQuery = countQuery.in('status', ['PENDING', 'IN_PROGRESS'])
    } else if (status === 'completed') {
      countQuery = countQuery.eq('status', 'COMPLETED')
    } else if (status === 'missed') {
      countQuery = countQuery.eq('status', 'MISSED')
    }

    const { count, error: countError } = await countQuery

    if (countError) {
      console.error('Error counting assignments:', countError)
    }

    // Calculate time remaining for pending assignments
    const now = new Date()
    const enrichedAssignments = assignments?.map(assignment => {
      let timeRemaining = null
      let isOverdue = false
      let weekendExtension = false

      if (['PENDING', 'IN_PROGRESS'].includes(assignment.status)) {
        const deadline = new Date(assignment.deadline)
        const timeDiff = deadline.getTime() - now.getTime()

        if (timeDiff > 0) {
          const hours = Math.floor(timeDiff / (1000 * 60 * 60))
          const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60))
          timeRemaining = { hours, minutes }
        } else {
          isOverdue = true
        }

        if (assignment.assignedAt) {
          const assignedAt = new Date(assignment.assignedAt)
          const baseDeadline = new Date(assignedAt)
          baseDeadline.setHours(baseDeadline.getHours() + 48)

          const weekendAdjusted = new Date(baseDeadline)
          const baseDay = weekendAdjusted.getDay()

          if (baseDay === 0) {
            weekendAdjusted.setDate(weekendAdjusted.getDate() + 1)
          } else if (baseDay === 6) {
            weekendAdjusted.setDate(weekendAdjusted.getDate() + 2)
          }

          if (weekendAdjusted.getTime() !== baseDeadline.getTime()) {
            const actualDeadline = deadline.getTime()
            const adjustedTime = weekendAdjusted.getTime()
            weekendExtension = Math.abs(actualDeadline - adjustedTime) <= 5 * 60 * 1000
          }
        }
      }

      return {
        ...assignment,
        timeRemaining,
        isOverdue,
        weekendExtension,
        submission: {
          ...assignment.submission,
          user: {
            ...assignment.submission.user,
            // Don't expose email to reviewers for privacy
            email: undefined
          }
        }
      }
    }) || []

    return createSuccessResponse({
      assignments: enrichedAssignments,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit
      },
      summary: {
        pending: enrichedAssignments.filter(a => ['PENDING', 'IN_PROGRESS'].includes(a.status)).length,
        overdue: enrichedAssignments.filter(a => a.isOverdue).length
      }
    })
  })
)
