import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface ReviewerPoolOptions {
  maxActiveAssignments?: number
  excludeUserIds?: string[]
  taskTypes?: string[]
  minReviewerRating?: number
  minimumReviewers?: number
  allowPartialAssignment?: boolean
}

export interface ReviewerCandidate {
  id: string
  username: string
  email: string
  role: string
  totalXp: number
  missedReviews: number
  activeAssignments: number
  averageReviewTime?: number
  reviewQualityScore?: number
  lastActiveAt?: Date
}

export interface AssignmentResult {
  success: boolean
  assignedReviewers: ReviewerCandidate[]
  errors: string[]
  warnings: string[]
}

/**
 * Service for managing reviewer pool and assignments
 * Implements workload balancing and conflict detection
 */
export class ReviewerPoolService {
  private readonly MAX_ACTIVE_ASSIGNMENTS = 5
  private readonly MIN_REVIEWERS_REQUIRED = 3
  private readonly REVIEWER_ROLES = ['REVIEWER', 'ADMIN']

  /**
   * Get available reviewers for a submission
   */
  async getAvailableReviewers(
    submissionId: string,
    submissionUserId: string,
    options: ReviewerPoolOptions = {}
  ): Promise<ReviewerCandidate[]> {
    const {
      maxActiveAssignments = this.MAX_ACTIVE_ASSIGNMENTS,
      excludeUserIds = [],
      taskTypes = [],
      minReviewerRating = 0
    } = options

    // Exclude submission author and any specified user IDs
    const excludedIds = [submissionUserId, ...excludeUserIds]

    try {
      // Get users with reviewer privileges
      const { data: users, error: usersError } = await supabase
        .from('User')
        .select(`
          id,
          username,
          email,
          role,
          totalXp,
          missedReviews,
          lastActiveAt,
          preferences
        `)
        .in('role', this.REVIEWER_ROLES)
        .not('id', 'in', `(${excludedIds.map(id => `"${id}"`).join(',')})`)

      if (usersError) {
        console.error('Error fetching users:', usersError)
        return []
      }

      if (!users || users.length === 0) {
        return []
      }

      // Get active assignments count for each user
      const userIds = users.map(user => user.id)
      const { data: assignments, error: assignmentsError } = await supabase
        .from('ReviewAssignment')
        .select('reviewerId')
        .in('reviewerId', userIds)
        .in('status', ['PENDING', 'IN_PROGRESS'])

      if (assignmentsError) {
        console.error('Error fetching assignments:', assignmentsError)
        return []
      }

      // Count active assignments per reviewer
      const assignmentCounts = assignments?.reduce((acc, assignment) => {
        acc[assignment.reviewerId] = (acc[assignment.reviewerId] || 0) + 1
        return acc
      }, {} as Record<string, number>) || {}

      // Filter and transform users to reviewer candidates
      const candidates: ReviewerCandidate[] = users
        .filter(user => !this.isReviewerOptedOut(user.preferences))
        .map(user => ({
          id: user.id,
          username: user.username || user.email.split('@')[0],
          email: user.email,
          role: user.role,
          totalXp: user.totalXp,
          missedReviews: user.missedReviews,
          activeAssignments: assignmentCounts[user.id] || 0,
          lastActiveAt: user.lastActiveAt ? new Date(user.lastActiveAt) : undefined
        }))
        .filter(candidate => {
          // Filter by workload
          if (candidate.activeAssignments >= maxActiveAssignments) {
            return false
          }

          // Filter by missed reviews (exclude users with too many missed reviews)
          if (candidate.missedReviews > 3) {
            return false
          }

          // Filter by minimum XP (ensure reviewer has some experience)
          if (candidate.totalXp < 50 && candidate.role !== 'ADMIN') {
            return false
          }

          return true
        })

      // Sort by workload (ascending) and then by XP (descending)
      candidates.sort((a, b) => {
        if (a.activeAssignments !== b.activeAssignments) {
          return a.activeAssignments - b.activeAssignments
        }
        return b.totalXp - a.totalXp
      })

      return candidates

    } catch (error) {
      console.error('Error in getAvailableReviewers:', error)
      return []
    }
  }

  /**
   * Assign reviewers to a submission using round-robin with workload balancing
   */
  async assignReviewers(
    submissionId: string,
    submissionUserId: string,
    options: ReviewerPoolOptions = {}
  ): Promise<AssignmentResult> {
    const result: AssignmentResult = {
      success: false,
      assignedReviewers: [],
      errors: [],
      warnings: []
    }

    try {
      // Get available reviewers
      const availableReviewers = await this.getAvailableReviewers(
        submissionId,
        submissionUserId,
        options
      )

      const minimumReviewers = options.minimumReviewers ?? this.MIN_REVIEWERS_REQUIRED

      if (availableReviewers.length < minimumReviewers) {
        if (availableReviewers.length === 0) {
          result.errors.push(`No eligible reviewers available. Need at least ${minimumReviewers}`)
          return result
        }

        if (!options.allowPartialAssignment) {
          result.errors.push(`Insufficient reviewers available. Found ${availableReviewers.length}, need ${minimumReviewers}`)
          return result
        }

        result.warnings.push(`Insufficient reviewers available. Assigning ${availableReviewers.length} of ${minimumReviewers} requested`)
      }

      // Select reviewers (already sorted by workload and XP)
      const reviewerCount = Math.min(availableReviewers.length, minimumReviewers)
      const selectedReviewers = availableReviewers.slice(0, reviewerCount)

      // Calculate deadline (72 hours from now, excluding weekends)
      const deadline = this.calculateReviewDeadline()

      // Create review assignments
      const assignments = selectedReviewers.map(reviewer => ({
        submissionId,
        reviewerId: reviewer.id,
        deadline: deadline.toISOString(),
        status: 'PENDING' as const,
        assignedAt: new Date().toISOString()
      }))

      const { data: createdAssignments, error: assignmentError } = await supabase
        .from('ReviewAssignment')
        .insert(assignments)
        .select()

      if (assignmentError) {
        result.errors.push(`Failed to create assignments: ${assignmentError.message}`)
        return result
      }

      // Update submission status and deadline
      const { error: submissionError } = await supabase
        .from('Submission')
        .update({
          status: 'UNDER_PEER_REVIEW',
          reviewDeadline: deadline.toISOString(),
          reviewCount: selectedReviewers.length
        })
        .eq('id', submissionId)

      if (submissionError) {
        result.warnings.push(`Failed to update submission status: ${submissionError.message}`)
      }

      result.success = true
      result.assignedReviewers = selectedReviewers

      console.log(`✅ Successfully assigned ${selectedReviewers.length} reviewers to submission ${submissionId}`)

      return result

    } catch (error) {
      console.error('Error in assignReviewers:', error)
      result.errors.push(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return result
    }
  }

  /**
   * Calculate review deadline (72 hours, excluding weekends)
   */
  private calculateReviewDeadline(): Date {
    const now = new Date()
    const deadline = new Date(now)

    // Add 72 hours
    deadline.setHours(deadline.getHours() + 72)
    
    // If deadline falls on weekend, extend to Monday
    const dayOfWeek = deadline.getDay()
    if (dayOfWeek === 0) { // Sunday
      deadline.setDate(deadline.getDate() + 1) // Move to Monday
    } else if (dayOfWeek === 6) { // Saturday
      deadline.setDate(deadline.getDate() + 2) // Move to Monday
    }
    
    return deadline
  }

  /**
   * Get reviewer workload statistics
   */
  async getReviewerWorkload(reviewerId: string): Promise<{
    activeAssignments: number
    completedThisWeek: number
    averageCompletionTime: number
    missedReviews: number
  }> {
    try {
      // Get active assignments
      const { data: activeAssignments } = await supabase
        .from('ReviewAssignment')
        .select('id')
        .eq('reviewerId', reviewerId)
        .in('status', ['PENDING', 'IN_PROGRESS'])

      // Get completed reviews this week
      const weekStart = new Date()
      weekStart.setDate(weekStart.getDate() - weekStart.getDay()) // Start of week
      weekStart.setHours(0, 0, 0, 0)

      const { data: completedThisWeek } = await supabase
        .from('ReviewAssignment')
        .select('id')
        .eq('reviewerId', reviewerId)
        .eq('status', 'COMPLETED')
        .gte('completedAt', weekStart.toISOString())

      // Get user missed reviews count
      const { data: user } = await supabase
        .from('User')
        .select('missedReviews')
        .eq('id', reviewerId)
        .single()

      return {
        activeAssignments: activeAssignments?.length || 0,
        completedThisWeek: completedThisWeek?.length || 0,
        averageCompletionTime: 0, // TODO: Calculate from historical data
        missedReviews: user?.missedReviews || 0
      }

    } catch (error) {
      console.error('Error getting reviewer workload:', error)
      return {
        activeAssignments: 0,
        completedThisWeek: 0,
        averageCompletionTime: 0,
        missedReviews: 0
      }
    }
  }

  /**
   * Check if a user can be assigned as a reviewer
   */
  async canAssignReviewer(
    reviewerId: string,
    submissionUserId: string,
    options: ReviewerPoolOptions = {}
  ): Promise<{ canAssign: boolean; reason?: string }> {
    // Check if reviewer is the submission author
    if (reviewerId === submissionUserId) {
      return { canAssign: false, reason: 'Cannot review own submission' }
    }

    // Get reviewer details
    const { data: reviewer } = await supabase
      .from('User')
      .select('role, totalXp, missedReviews, preferences')
      .eq('id', reviewerId)
      .single()

    if (!reviewer) {
      return { canAssign: false, reason: 'Reviewer not found' }
    }

    if (this.isReviewerOptedOut(reviewer.preferences)) {
      return { canAssign: false, reason: 'Reviewer is temporarily unavailable' }
    }

    // Check role
    if (!this.REVIEWER_ROLES.includes(reviewer.role)) {
      return { canAssign: false, reason: 'User does not have reviewer privileges' }
    }

    // Check experience
    if (reviewer.totalXp < 50 && reviewer.role !== 'ADMIN') {
      return { canAssign: false, reason: 'Insufficient experience (minimum 50 XP required)' }
    }

    // Check missed reviews
    if (reviewer.missedReviews > 3) {
      return { canAssign: false, reason: 'Too many missed reviews' }
    }

    // Check workload
    const workload = await this.getReviewerWorkload(reviewerId)
    const maxAssignments = options.maxActiveAssignments || this.MAX_ACTIVE_ASSIGNMENTS
    
    if (workload.activeAssignments >= maxAssignments) {
      return { canAssign: false, reason: 'Reviewer has too many active assignments' }
    }

    return { canAssign: true }
  }

  private isReviewerOptedOut(preferences: unknown): boolean {
    if (!preferences) {
      return false
    }

    let parsed: Record<string, unknown>

    if (typeof preferences === 'string') {
      try {
        parsed = JSON.parse(preferences)
      } catch (error) {
        console.warn('Failed to parse reviewer preferences JSON:', error)
        return false
      }
    } else {
      parsed = preferences as Record<string, unknown>
    }

    const now = Date.now()

    const optOutFlag = parsed.reviewerOptOut === true

    const optOutUntilRaw = parsed.reviewerOptOutUntil
    if (optOutUntilRaw instanceof Date) {
      if (optOutUntilRaw.getTime() > now) {
        return true
      }
    } else if (typeof optOutUntilRaw === 'string') {
      const optOutUntil = new Date(optOutUntilRaw)
      if (!Number.isNaN(optOutUntil.getTime()) && optOutUntil.getTime() > now) {
        return true
      }
    }

    return optOutFlag
  }
}

// Export singleton instance
export const reviewerPoolService = new ReviewerPoolService()
