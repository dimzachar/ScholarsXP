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
      // Get all pending and in-progress assignments
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
        .in('status', ['PENDING', 'IN_PROGRESS'])
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

          // Check if deadline has passed
          if (hoursUntilDeadline <= 0) {
            await this.handleOverdueAssignment(assignment, Math.abs(hoursUntilDeadline))
            result.penalties++
            
            // Check if we should reassign
            if (Math.abs(hoursUntilDeadline) >= this.REASSIGNMENT_DELAY) {
              const reassigned = await this.handleReassignment(assignment)
              if (reassigned) {
                result.reassignments++
              }
            }
          } else {
            // Check if we should send reminders
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

      console.log(`📊 Deadline monitoring complete: ${result.processed} processed, ${result.reminders} reminders, ${result.reassignments} reassignments, ${result.penalties} penalties`)

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
   * Handle overdue assignment - mark as missed and apply penalty
   */
  private async handleOverdueAssignment(assignment: any, hoursOverdue: number): Promise<void> {
    // Mark assignment as missed
    const { error: assignmentError } = await supabase
      .from('ReviewAssignment')
      .update({ status: 'MISSED' })
      .eq('id', assignment.id)

    if (assignmentError) {
      throw new Error(`Failed to mark assignment as missed: ${assignmentError.message}`)
    }

    // Increment missed reviews counter
    const { error: userError } = await supabase
      .from('User')
      .update({
        missedReviews: supabase.sql`"missedReviews" + 1`
      })
      .eq('id', assignment.reviewerId)

    if (userError) {
      console.error('Failed to increment missed reviews:', userError)
    }

    // Record XP transaction - this also updates User.totalXp and currentWeekXp
    await xpAnalyticsService.recordXpTransaction(
      assignment.reviewerId,
      this.PENALTY_XP,
      'PENALTY',
      `Missed review deadline for submission ${assignment.submissionId}`,
      assignment.submissionId
    )

    // Ensure XP doesn't go below 0
    await supabase
      .from('User')
      .update({
        totalXp: 0,
        currentWeekXp: 0
      })
      .eq('id', assignment.reviewerId)
      .lt('totalXp', 0)

    // TODO: Send notification to reviewer about missed deadline and penalty

    console.log(`⚠️ Assignment ${assignment.id} marked as missed (${Math.round(hoursOverdue)}h overdue), penalty applied`)
  }

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
  private async checkAndSendReminder(assignment: any, hoursUntilDeadline: number): Promise<boolean> {
    // Check if we should send a reminder
    const shouldRemind = this.REMINDER_INTERVALS.some(interval => {
      return Math.abs(hoursUntilDeadline - interval) < 0.5 // Within 30 minutes of reminder time
    })

    if (!shouldRemind) {
      return false
    }

    // Check if reminder was already sent for this interval
    const reminderKey = `reminder_${assignment.id}_${Math.round(hoursUntilDeadline)}`
    
    // TODO: Implement reminder tracking to avoid duplicate reminders
    // For now, we'll just send the reminder

    // TODO: Send actual notification
    console.log(`📧 Reminder sent to ${assignment.reviewer.username} for assignment ${assignment.id} (${Math.round(hoursUntilDeadline)}h remaining)`)

    return true
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
