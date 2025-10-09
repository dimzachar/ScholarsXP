import { supabaseClient } from '@/lib/supabase'
import { createServiceClient, createAuthenticatedClient } from '@/lib/supabase-server'

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  message: string
  data?: any
  read: boolean
  createdAt: Date
}

export enum NotificationType {
  XP_AWARDED = 'XP_AWARDED',
  REVIEW_ASSIGNED = 'REVIEW_ASSIGNED',
  REVIEW_COMPLETED = 'REVIEW_COMPLETED',
  SUBMISSION_PROCESSED = 'SUBMISSION_PROCESSED',
  SUBMISSION_PROCESSING = 'SUBMISSION_PROCESSING',
  SUBMISSION_APPROVED = 'SUBMISSION_APPROVED',
  SUBMISSION_REJECTED = 'SUBMISSION_REJECTED',
  WEEKLY_SUMMARY = 'WEEKLY_SUMMARY',
  STREAK_ACHIEVED = 'STREAK_ACHIEVED',
  PENALTY_APPLIED = 'PENALTY_APPLIED',
  ADMIN_MESSAGE = 'ADMIN_MESSAGE'
}

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  data?: any
): Promise<Notification> {
  try {
    // Use service client for server-side writes to bypass RLS safely
    const service = createServiceClient()
    const { data: notification, error } = await service
      .from('notifications')
      .insert({
        userId,
        type,
        title,
        message,
        data,
        read: false
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating notification:', error)
      throw new Error('Failed to create notification')
    }

    console.log(`📧 Notification created for user ${userId}: ${title}`)

    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type as NotificationType,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      read: notification.read,
      createdAt: new Date(notification.createdAt)
    }
  } catch (error) {
    console.error('Error creating notification:', error)
    throw new Error('Failed to create notification')
  }
}

function getNotificationClient(accessToken?: string) {
  if (accessToken) {
    return createAuthenticatedClient(accessToken)
  }
  return supabaseClient
}

export async function getUserNotifications(
  userId: string,
  page: number = 1,
  limit: number = 20,
  unreadOnly: boolean = false,
  accessToken?: string
): Promise<{ notifications: Notification[], total: number }> {
  try {
    const client = getNotificationClient(accessToken)
    // Build the query
    let query = client
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('userId', userId)

    if (unreadOnly) {
      query = query.eq('read', false)
    }

    const { data: notifications, error, count } = await query
      .order('createdAt', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (error) {
      console.error('Error fetching user notifications:', error)
      throw new Error('Failed to fetch notifications')
    }

    return {
      notifications: (notifications || []).map(n => ({
        id: n.id,
        userId: n.userId,
        type: n.type as NotificationType,
        title: n.title,
        message: n.message,
        data: n.data,
        read: n.read,
        createdAt: new Date(n.createdAt)
      })),
      total: count || 0
    }
  } catch (error) {
    console.error('Error fetching user notifications:', error)
    throw new Error('Failed to fetch notifications')
  }
}

export async function markNotificationAsRead(userId: string, notificationId: string, accessToken?: string): Promise<boolean> {
  try {
    const client = getNotificationClient(accessToken)
    const { error, data } = await client
      .from('notifications')
      .update({
        read: true,
        updatedAt: new Date().toISOString()
      })
      .eq('id', notificationId)
      .eq('userId', userId)
      .eq('read', false)
      .select('id')

    if (error) {
      console.error('Error marking notification as read:', error)
      return false
    }

    return Array.isArray(data) && data.length > 0
  } catch (error) {
    console.error('Error marking notification as read:', error)
    return false
  }
}

export async function markAllNotificationsAsRead(userId: string, accessToken?: string): Promise<number> {
  try {
    const client = getNotificationClient(accessToken)
    const { error, count } = await client
      .from('notifications')
      .update({
        read: true,
        updatedAt: new Date().toISOString()
      })
      .eq('userId', userId)
      .eq('read', false)

    if (error) {
      console.error('Error marking all notifications as read:', error)
      return 0
    }

    return count || 0
  } catch (error) {
    console.error('Error marking all notifications as read:', error)
    return 0
  }
}

export async function deleteAllNotifications(userId: string, accessToken?: string): Promise<number> {
  try {
    const service = createServiceClient()
    const { error, count } = await service
      .from('notifications')
      .delete({ count: 'exact' })
      .eq('userId', userId)

    if (error) {
      console.error('Error deleting notifications:', error)
      return 0
    }

    return count || 0
  } catch (error) {
    console.error('Error deleting notifications:', error)
    return 0
  }
}

export async function getUnreadCount(userId: string, accessToken?: string): Promise<number> {
  try {
    const client = getNotificationClient(accessToken)
    const { count, error } = await client
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('userId', userId)
      .eq('read', false)

    if (error) {
      console.error('Error getting unread count:', error)
      return 0
    }

    return count || 0
  } catch (error) {
    console.error('Error getting unread count:', error)
    return 0
  }
}

export async function deleteNotification(userId: string, notificationId: string, accessToken?: string): Promise<boolean> {
  try {
    const service = createServiceClient()
    const { error, count } = await service
      .from('notifications')
      .delete({ count: 'exact' })
      .eq('id', notificationId)
      .eq('userId', userId)

    if (error) {
      console.error('Error deleting notification:', error)
      return false
    }

    return (count || 0) > 0
  } catch (error) {
    console.error('Error deleting notification:', error)
    return false
  }
}

// Notification creators for specific events
export async function notifyXPAwarded(userId: string, xp: number, submissionUrl: string) {
  await createNotification(
    userId,
    NotificationType.XP_AWARDED,
    `🎉 You earned ${xp} XP!`,
    `Congratulations! You've been awarded ${xp} XP for your submission.`,
    { xp, submissionUrl }
  )
}

export async function notifyReviewAssigned(
  userId: string,
  submissionId: string,
  submissionUrl?: string | null
) {
  const data = submissionUrl
    ? { submissionId, submissionUrl }
    : { submissionId }

  await createNotification(
    userId,
    NotificationType.REVIEW_ASSIGNED,
    '📝 New review assignment',
    'You have been assigned a new submission to review. Complete it within 72 hours to earn +10 XP.',
    data
  )
}

export async function notifyReviewCompleted(userId: string, reviewerUsername: string) {
  await createNotification(
    userId,
    NotificationType.REVIEW_COMPLETED,
    '✅ Your submission was reviewed',
    `@${reviewerUsername} has completed their review of your submission.`,
    { reviewerUsername }
  )
}

export async function notifySubmissionProcessed(userId: string, submissionId: string, status: string, finalXp?: number) {
  let title = ''
  let message = ''

  switch (status) {
    case 'FINALIZED':
      title = '🎯 Submission finalized'
      message = `Your submission has been finalized${finalXp ? ` with ${finalXp} XP` : ''}.`
      break
    case 'REJECTED':
      title = '❌ Submission rejected'
      message = 'Your submission was rejected. Please check the requirements and try again.'
      break
    case 'FLAGGED':
      title = '🚩 Submission flagged'
      message = 'Your submission has been flagged for manual review.'
      break
    default:
      title = '📄 Submission updated'
      message = `Your submission status has been updated to ${status}.`
  }

  await createNotification(
    userId,
    NotificationType.SUBMISSION_PROCESSED,
    title,
    message,
    { submissionId, status, finalXp }
  )
}

export async function notifyWeeklySummary(userId: string, weeklyXp: number, totalXp: number, rank?: number) {
  await createNotification(
    userId,
    NotificationType.WEEKLY_SUMMARY,
    '📊 Weekly summary',
    `This week you earned ${weeklyXp} XP. Total: ${totalXp} XP${rank ? `. You ranked #${rank}!` : '.'}`,
    { weeklyXp, totalXp, rank }
  )
}

export async function notifyStreakAchieved(userId: string, streakWeeks: number) {
  const isParthenon = streakWeeks % 4 === 0
  
  await createNotification(
    userId,
    NotificationType.STREAK_ACHIEVED,
    `🔥 ${streakWeeks}-week streak!`,
    `Congratulations! You've maintained a ${streakWeeks}-week streak${isParthenon ? ' and earned Parthenon XP bonus!' : '!'}`,
    { streakWeeks, isParthenon }
  )
}

export async function notifyPenaltyApplied(userId: string, missedReviews: number, penaltyXp: number) {
  await createNotification(
    userId,
    NotificationType.PENALTY_APPLIED,
    '⚠️ Review penalty applied',
    `You missed ${missedReviews} review${missedReviews > 1 ? 's' : ''} and lost ${penaltyXp} XP. Stay active to avoid penalties!`,
    { missedReviews, penaltyXp }
  )
}

export async function notifyAdminMessage(userId: string, title: string, message: string) {
  await createNotification(
    userId,
    NotificationType.ADMIN_MESSAGE,
    `🔔 ${title}`,
    message,
    { isAdmin: true }
  )
}

// Cleanup function for old notifications (90 days for read notifications as per requirements)
export async function cleanupOldNotifications(): Promise<number> {
  try {
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const { error, count } = await supabaseClient
      .from('notifications')
      .delete()
      .eq('read', true)
      .lt('createdAt', ninetyDaysAgo.toISOString())

    if (error) {
      console.error('Error cleaning up old notifications:', error)
      return 0
    }

    console.log(`🧹 Cleaned up ${count || 0} old read notifications`)
    return count || 0
  } catch (error) {
    console.error('Error cleaning up old notifications:', error)
    return 0
  }
}
