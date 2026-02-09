import { createClient } from '@supabase/supabase-js'
import { REVIEWER_ROLES, isAdmin } from './roles'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_RETRIES = 3
const INITIAL_DELAY_MS = 500

/**
 * Helper to detect retryable errors (connection/timeout issues)
 */
function isRetryableError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    const msg = String((error as any).message || (error as any).error || '').toLowerCase()
    return (
      msg.includes('connection') ||
      msg.includes('timeout') ||
      msg.includes('network') ||
      msg.includes('econnreset') ||
      msg.includes('socket') ||
      msg.includes('fetch failed')
    )
  }
  return false
}

/**
 * Sleep helper for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retry wrapper with exponential backoff for transient errors
 */
async function withRetry<T>(
  operation: () => Promise<{ data: T | null; error: any }>,
  context: string
): Promise<{ data: T | null; error: any }> {
  let lastResult: { data: T | null; error: any } = { data: null, error: null }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    lastResult = await operation()

    if (!lastResult.error || !isRetryableError(lastResult.error)) {
      return lastResult
    }

    if (attempt < MAX_RETRIES - 1) {
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt)
      console.warn(
        `[ReviewerPool] Retryable error in ${context}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES}):`,
        lastResult.error
      )
      await sleep(delay)
    }
  }

  return lastResult
}

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
  private readonly REVIEWER_ROLES = REVIEWER_ROLES

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
      const { data: users, error: usersError } = await withRetry(
        () => supabase
          .from('User')
          .select(`
            id,
            username,
            email,
            role,
            totalXp,
            missedReviews,
            reviewPausedUntil,
            reviewPausedPermanently,
            lastActiveAt,
            preferences
          `)
          .in('role', REVIEWER_ROLES)
          .not('id', 'in', `(${excludedIds.map(id => `"${id}"`).join(',')})`),
        'getAvailableReviewers.fetchUsers'
      )

      if (usersError) {
        console.error('Error fetching users:', usersError)
        return []
      }

      if (!users || users.length === 0) {
        return []
      }

      // Get active assignments count for each user
      const userIds = users.map(user => user.id)
      const { data: assignments, error: assignmentsError } = await withRetry(
        () => supabase.from('ReviewAssignment')
          .select('reviewerId')
          .in('reviewerId', userIds)
          .in('status', ['PENDING', 'IN_PROGRESS']),
        'getAvailableReviewers.fetchAssignments'
      )

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

          // Filter by pause status (exclude paused/banned users)
          if (candidate.reviewPausedPermanently) {
            return false // Permanently banned
          }
          if (candidate.reviewPausedUntil && new Date(candidate.reviewPausedUntil) > new Date()) {
            return false // Temporarily paused
          }

          // Filter by minimum XP (ensure reviewer has some experience)
          if (candidate.totalXp < 50 && !isAdmin(candidate.role)) {
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

      // Calculate deadline (48 hours from now, excluding weekends)
      const deadline = this.calculateReviewDeadline()

      // Create review assignments
      const assignments = selectedReviewers.map(reviewer => ({
        submissionId,
        reviewerId: reviewer.id,
        deadline: deadline.toISOString(),
        status: 'PENDING' as const,
        assignedAt: new Date().toISOString()
      }))

      const { data: createdAssignments, error: assignmentError } = await withRetry(
        () => supabase
          .from('ReviewAssignment')
          .insert(assignments)
          .select(),
        'assignReviewers.createAssignments'
      )

      if (assignmentError) {
        result.errors.push(`Failed to create assignments: ${assignmentError.message}`)
        return result
      }

      let liveAssignmentCount: number | null = null
      const { count: assignmentCount, error: countError } = await withRetry(
        () => supabase
          .from('ReviewAssignment')
          .select('id', { count: 'exact', head: true })
          .eq('submissionId', submissionId)
          .not('status', 'eq', 'REASSIGNED'),
        'assignReviewers.countAssignments'
      )

      if (countError) {
        result.warnings.push(`Failed to recalc assignment count: ${countError.message}`)
      } else if (typeof assignmentCount === 'number') {
        liveAssignmentCount = assignmentCount
      }

      // Update submission status and deadline
      const { error: submissionError } = await withRetry(
        () => supabase
          .from('Submission')
          .update({
            status: 'UNDER_PEER_REVIEW',
            reviewDeadline: deadline.toISOString(),
            reviewCount: liveAssignmentCount ?? selectedReviewers.length
          })
          .eq('id', submissionId),
        'assignReviewers.updateSubmission'
      )

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
   * Calculate review deadline (48 hours, excluding weekends)
   */
  private calculateReviewDeadline(): Date {
    const now = new Date()
    const deadline = new Date(now)

    // Add 48 hours
    deadline.setHours(deadline.getHours() + 48)

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
      .select('role, totalXp, reviewPausedUntil, reviewPausedPermanently, preferences')
      .eq('id', reviewerId)
      .single()

    if (!reviewer) {
      return { canAssign: false, reason: 'Reviewer not found' }
    }

    if (this.isReviewerOptedOut(reviewer.preferences)) {
      return { canAssign: false, reason: 'Reviewer is temporarily unavailable' }
    }

    // Check role
    if (!REVIEWER_ROLES.includes(reviewer.role as any)) {
      return { canAssign: false, reason: 'User does not have reviewer privileges' }
    }

    // Check experience
    if (reviewer.totalXp < 50 && !isAdmin(reviewer.role)) {
      return { canAssign: false, reason: 'Insufficient experience (minimum 50 XP required)' }
    }

    // Check pause status
    if (reviewer.reviewPausedPermanently) {
      return { canAssign: false, reason: 'Reviewer is permanently banned from reviewing' }
    }
    if (reviewer.reviewPausedUntil && new Date(reviewer.reviewPausedUntil) > new Date()) {
      return { canAssign: false, reason: 'Reviewer is temporarily paused from reviewing' }
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
