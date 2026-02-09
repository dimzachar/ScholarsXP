import { createClient } from '@supabase/supabase-js'
import { reviewerPoolService } from './reviewer-pool'
import { xpAnalyticsService } from './xp-analytics'
import { logAdminAction } from './audit-log'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface DeadlineStatus {
  assignmentId: string
  submissionId: string
  reviewerId: string
  deadline: Date
  status: 'upcoming' | 'urgent' | 'overdue'
  hoursRemaining: number
}

export interface DeadlineMonitorResult {
  processed: number
  reminders: number
  reassignments: number
  penalties: number
  errors: string[]
}

/**
 * Service for monitoring review deadlines and handling automated actions
 */
export class DeadlineMonitorService {
  private readonly REMINDER_INTERVALS = [24, 6, 1] // Hours before deadline
  private readonly REASSIGNMENT_DELAY = 24 // Hours after deadline before reassignment
  private readonly PENALTY_XP = -10 // XP penalty for missed reviews

  /**
   * Check all pending assignments and process deadline-related actions
   */
  async processDeadlines(): Promise<DeadlineMonitorResult> {
    const result: DeadlineMonitorResult = {
      processed: 0,
      reminders: 0,
      reassignments: 0,
      penalties: 0,
      errors: []
    }

    try {
      // Get all pending, in-progress AND missed assignments
      // We need MISSED assignments to check if they've been missed long enough to trigger a reshuffle
      const { data: assignments, error } = await supabase
        .from('ReviewAssignment')
        .select(`
          id,
          submissionId,
          reviewerId,
          deadline,
          status,
          assignedAt,
          submission:Submission(
            id,
            userId,
            url,
            platform,
            taskTypes,
            status
          ),
          reviewer:User(
            id,
            username,
            email,
            missedReviews
          )
        `)
        .in('status', ['PENDING', 'IN_PROGRESS', 'MISSED'])
        .order('deadline', { ascending: true })

      if (error) {
        result.errors.push(`Failed to fetch assignments: ${error.message}`)
        return result
      }

      if (!assignments || assignments.length === 0) {
        return result
      }

      const now = new Date()

      for (const assignment of assignments) {
        try {
          result.processed++

          const deadline = new Date(assignment.deadline)
          const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60)
          const isOverdue = hoursUntilDeadline <= 0

          // Case 1: Already MISSED - check for reshuffle only
          if (assignment.status === 'MISSED') {
            // If it's been missed for > REASSIGNMENT_DELAY hours, trigger reshuffle
            if (Math.abs(hoursUntilDeadline) >= this.REASSIGNMENT_DELAY) {
              const reshuffled = await this.handleReassignment(assignment)
              if (reshuffled) {
                result.reassignments++
              }
            }
            continue // Skip the rest for MISSED items
          }

          // Case 2: PENDING/IN_PROGRESS and Deadline Passed
          if (isOverdue) {
            await this.handleOverdueAssignment(assignment, Math.abs(hoursUntilDeadline))
            result.penalties++

            // Note: We don't check for reshuffle immediately here because REASSIGNMENT_DELAY is 24h
            // The assignment is now MISSED, and will be picked up by Case 1 in future runs
          } else {
            // Case 3: Upcoming Deadline - Check for reminders
            const reminderSent = await this.checkAndSendReminder(assignment, hoursUntilDeadline)
            if (reminderSent) {
              result.reminders++
            }
          }

        } catch (error) {
          console.error(`Error processing assignment ${assignment.id}:`, error)
          result.errors.push(`Assignment ${assignment.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }

      console.log(`📊 Deadline monitoring complete: ${result.processed} processed, ${result.reminders} reminders, ${result.reassignments} resuffles, ${result.penalties} penalties`)

      return result

    } catch (error) {
      console.error('Error in deadline monitoring:', error)
      result.errors.push(`System error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return result
    }
  }

  /**
   * Get deadline status for all assignments
   */
  async getDeadlineStatuses(): Promise<DeadlineStatus[]> {
    try {
      const { data: assignments, error } = await supabase
        .from('ReviewAssignment')
        .select('id, submissionId, reviewerId, deadline')
        .in('status', ['PENDING', 'IN_PROGRESS'])

      if (error || !assignments) {
        console.error('Error fetching deadline statuses:', error)
        return []
      }

      const now = new Date()

      return assignments.map(assignment => {
        const deadline = new Date(assignment.deadline)
        const hoursRemaining = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60)

        let status: 'upcoming' | 'urgent' | 'overdue'
        if (hoursRemaining <= 0) {
          status = 'overdue'
        } else if (hoursRemaining <= 6) {
          status = 'urgent'
        } else {
          status = 'upcoming'
        }

        return {
          assignmentId: assignment.id,
          submissionId: assignment.submissionId,
          reviewerId: assignment.reviewerId,
          deadline,
          status,
          hoursRemaining: Math.round(hoursRemaining * 10) / 10
        }
      })

    } catch (error) {
      console.error('Error getting deadline statuses:', error)
      return []
    }
  }

  /**
   * Handle overdue assignment - mark as missed and apply progressive penalties
   */
  private async handleOverdueAssignment(assignment: any, hoursOverdue: number): Promise<void> {

    // 1. Check for Idempotency: Has a penalty already been applied for this submission?
    // We check purely based on the existence of a 'PENALTY' transaction for this reviewer + submission
    const { data: existingPenalty, error: checkError } = await supabase
      .from('XpTransaction')
      .select('id')
      .eq('userId', assignment.reviewerId)
      .eq('type', 'PENALTY')
      .eq('sourceId', assignment.submissionId)
      .maybeSingle()

    if (checkError) {
      console.error('Failed to check for existing penalty:', checkError)
      // Safety fallback: abort to avoid potential double-penalty or missed assignment status update
      return
    }

    let newMissedReviews = 0

    // 2. Apply Penalties IF NOT EXISTS
    if (!existingPenalty) {
      // Get current missedReviews count
      const { data: userData, error: fetchError } = await supabase
        .from('User')
        .select('missedReviews')
        .eq('id', assignment.reviewerId)
        .single()

      if (fetchError || !userData) {
        console.error('Failed to fetch user data for penalty:', fetchError)
        return
      }

      const currentMissedReviews = userData.missedReviews
      newMissedReviews = currentMissedReviews + 1

      // Increment missed reviews counter (lifetime)
      // Note: This operation is not atomic with XP record, but we check XP record for idempotency.
      // If this succeeds but XP fails, we might double-increment next run. Acceptable trade-off vs missing penalty.
      const { error: userError } = await supabase
        .from('User')
        .update({
          missedReviews: newMissedReviews
        })
        .eq('id', assignment.reviewerId)

      if (userError) {
        console.error('Failed to increment missed reviews:', userError)
        return // Abort if we can't update user stats
      }

      // Apply XP penalty (Idempotency Key)
      try {
        await xpAnalyticsService.recordXpTransaction(
          assignment.reviewerId,
          this.PENALTY_XP,
          'PENALTY',
          `Missed review deadline for submission ${assignment.submissionId}`,
          assignment.submissionId
        )
      } catch (xpError) {
        console.error('Failed to record XP penalty:', xpError)
        return // Abort if we can't record the transaction (our idempotency key)
      }

      // Check and apply threshold penalties (one-time, at exact thresholds)
      await applyMissedReviewThresholdPenalties(assignment.reviewerId, newMissedReviews)

      // Ensure XP doesn't go below 0
      await supabase
        .from('User')
        .update({
          totalXp: 0,
          currentWeekXp: 0
        })
        .eq('id', assignment.reviewerId)
        .lt('totalXp', 0)

      console.log(`⚠️ Penalties applied for assignment ${assignment.id} (${Math.round(hoursOverdue)}h overdue). Total missed: ${newMissedReviews}`)
    } else {
      console.log(`ℹ️ Penalty already exists for assignment ${assignment.id}, skipping penalty application.`)
    }

    // 3. Mark assignment as MISSED (Final Step)
    // Only reachable if penalties succeeded OR already existed
    const { error: assignmentError } = await supabase
      .from('ReviewAssignment')
      .update({ status: 'MISSED' })
      .eq('id', assignment.id)

    if (assignmentError) {
      console.error(`Failed to mark assignment ${assignment.id} as missed:`, assignmentError)
      // Retry on next run is safe due to idempotency check
    } else {
      console.log(`✅ Assignment ${assignment.id} successfully marked as MISSED.`)
    }
  }

  // Private method applyThresholdPenalties removed - use exported applyMissedReviewThresholdPenalties instead

  /**
   * Handle reassignment of missed review
   */
  private async handleReassignment(assignment: any): Promise<boolean> {
    try {
      // Find a replacement reviewer
      const assignmentResult = await reviewerPoolService.assignReviewers(
        assignment.submissionId,
        assignment.submission.userId,
        {
          excludeUserIds: [assignment.reviewerId], // Exclude the reviewer who missed
          maxActiveAssignments: 5,
          minimumReviewers: 1,
          allowPartialAssignment: false
        }
      )

      if (assignmentResult.success && assignmentResult.assignedReviewers.length > 0) {
        // FIX: Update old assignment status to REASSIGNED to prevent infinite loop
        const { error: updateError } = await supabase
          .from('ReviewAssignment')
          .update({ status: 'REASSIGNED' })
          .eq('id', assignment.id)

        if (updateError) {
          console.error(`Failed to update old assignment ${assignment.id} status to REASSIGNED:`, updateError)
        }

        // Log automated reassignment
        await logAdminAction({
          adminId: 'system',
          action: 'REVIEW_DEADLINE_REASSIGN',
          targetType: 'submission',
          targetId: assignment.submissionId,
          details: {
            subAction: 'AUTO_REASSIGN_DEADLINE',
            oldReviewerId: assignment.reviewerId,
            oldReviewerName: assignment.reviewer.username || assignment.reviewer.email,
            newReviewerId: assignmentResult.assignedReviewers[0].id,
            newReviewerName: assignmentResult.assignedReviewers[0].username || assignmentResult.assignedReviewers[0].email,
            reason: 'Missed deadline',
            hoursOverdue: Math.abs((new Date(assignment.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60)),
            timestamp: new Date().toISOString()
          }
        })

        // TODO: Send notification about reassignment
        console.log(`🔄 Reassigned submission ${assignment.submissionId} to new reviewer`)
        return true
      } else {
        console.log(`❌ Failed to reassign submission ${assignment.submissionId}: ${assignmentResult.errors.join(', ')}`)
        return false
      }

    } catch (error) {
      console.error('Error in reassignment:', error)
      return false
    }
  }

  /**
   * Check if reminder should be sent and send it
   */
  /**
   * Check if reminder should be sent and send it
   */
  private async checkAndSendReminder(assignment: any, hoursUntilDeadline: number): Promise<boolean> {
    // Check if we match any reminder interval
    const matchingInterval = this.REMINDER_INTERVALS.find(interval =>
      Math.abs(hoursUntilDeadline - interval) < 0.5
    )

    if (!matchingInterval) {
      return false
    }

    try {
      // Check idempotency: Have we already notified for this interval?
      // using 'notifications' table checks if a row exists with matching metadata
      const { data: existingNotifications, error: checkError } = await supabase
        .from('notifications')
        .select('id')
        .eq('userId', assignment.reviewerId)
        .eq('type', 'ADMIN_MESSAGE') // Reuse ADMIN_MESSAGE to avoid schema changes
        .contains('data', {
          assignmentId: assignment.id,
          reminderInterval: matchingInterval
        })
        .limit(1)

      if (checkError) {
        console.error('Error checking existing notifications:', checkError)
        return false // Fail safe to avoid spam
      }

      if (existingNotifications && existingNotifications.length > 0) {
        // Already sent
        return false
      }

      // Create notification serving as both the alert and the idempotency record
      const { error: insertError } = await supabase
        .from('notifications')
        .insert({
          userId: assignment.reviewerId,
          type: 'ADMIN_MESSAGE',
          title: 'Review Deadline Warning',
          message: `You have a review due in approximately ${matchingInterval} hour${matchingInterval === 1 ? '' : 's'}.`,
          data: {
            assignmentId: assignment.id,
            reminderInterval: matchingInterval,
            reason: 'deadline_warning',
            deadline: assignment.deadline
          },
          read: false
        })

      if (insertError) {
        console.error('Failed to create reminder notification:', insertError)
        return false
      }

      console.log(`📧 Notice created for ${assignment.reviewer.username}: ${matchingInterval}h warning (Assignment ${assignment.id})`)
      return true

    } catch (error) {
      console.error('Error in checkAndSendReminder:', error)
      return false
    }
  }

  /**
   * Get assignments that need urgent attention
   */
  async getUrgentAssignments(): Promise<any[]> {
    try {
      const { data: assignments, error } = await supabase
        .from('ReviewAssignment')
        .select(`
          id,
          submissionId,
          reviewerId,
          deadline,
          status,
          submission:Submission(url, platform, taskTypes),
          reviewer:User(username, email)
        `)
        .in('status', ['PENDING', 'IN_PROGRESS'])
        .order('deadline', { ascending: true })

      if (error || !assignments) {
        return []
      }

      const now = new Date()

      return assignments.filter(assignment => {
        const deadline = new Date(assignment.deadline)
        const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60)
        return hoursUntilDeadline <= 6 // Urgent if 6 hours or less remaining
      })

    } catch (error) {
      console.error('Error getting urgent assignments:', error)
      return []
    }
  }

  /**
   * Extend deadline for a specific assignment
   */
  async extendDeadline(assignmentId: string, additionalHours: number, reason: string): Promise<boolean> {
    try {
      const { data: assignment, error: fetchError } = await supabase
        .from('ReviewAssignment')
        .select('deadline')
        .eq('id', assignmentId)
        .single()

      if (fetchError || !assignment) {
        return false
      }

      const currentDeadline = new Date(assignment.deadline)
      const newDeadline = new Date(currentDeadline.getTime() + (additionalHours * 60 * 60 * 1000))

      const { error: updateError } = await supabase
        .from('ReviewAssignment')
        .update({ deadline: newDeadline.toISOString() })
        .eq('id', assignmentId)

      if (updateError) {
        console.error('Error extending deadline:', updateError)
        return false
      }

      // TODO: Record admin action and send notification

      console.log(`⏰ Extended deadline for assignment ${assignmentId} by ${additionalHours}h. Reason: ${reason}`)
      return true

    } catch (error) {
      console.error('Error extending deadline:', error)
      return false
    }
  }
}

// Export singleton instance
export const deadlineMonitorService = new DeadlineMonitorService()

/**
 * Exported utility function to apply threshold penalties
 * Can be called from other modules (e.g., reshuffle routes) when missedReviews is incremented
 */
export async function applyMissedReviewThresholdPenalties(reviewerId: string, newMissedReviews: number): Promise<void> {
  const now = new Date()

  // First strike: 4 missed reviews = 2-week pause + -100 XP
  if (newMissedReviews === 4) {
    const pauseUntil = new Date(now)
    pauseUntil.setDate(now.getDate() + 14) // Add 14 days (2 weeks)

    await supabase
      .from('User')
      .update({ reviewPausedUntil: pauseUntil.toISOString() })
      .eq('id', reviewerId)

    await xpAnalyticsService.recordXpTransaction(
      reviewerId,
      -100,
      'PENALTY',
      'First strike: 4 missed reviews - 2 week pause from reviewing'
    )

    console.log(`🚫 First strike for ${reviewerId}: 2-week pause + -100 XP (4 total misses)`)
  }

  // Second strike: 7 missed reviews = 4-week pause + -200 XP
  if (newMissedReviews === 7) {
    const pauseUntil = new Date(now)
    pauseUntil.setDate(now.getDate() + 28) // Add 28 days (4 weeks)

    await supabase
      .from('User')
      .update({ reviewPausedUntil: pauseUntil.toISOString() })
      .eq('id', reviewerId)

    await xpAnalyticsService.recordXpTransaction(
      reviewerId,
      -200,
      'PENALTY',
      'Second strike: 7 missed reviews - 4 week pause from reviewing'
    )

    console.log(`🚫🚫 Second strike for ${reviewerId}: 4-week pause + -200 XP (7 total misses)`)
  }

  // Permanent ban: 10+ missed reviews = permanent ban + -500 XP
  if (newMissedReviews === 10) {
    await supabase
      .from('User')
      .update({ reviewPausedPermanently: true })
      .eq('id', reviewerId)

    await xpAnalyticsService.recordXpTransaction(
      reviewerId,
      -500,
      'PENALTY',
      'Permanent ban: 10 missed reviews - permanently excluded from reviewing'
    )

    console.log(`⛔ Permanent ban for ${reviewerId}: -500 XP (10 total misses)`)
  }
}
