import { prisma } from '@/lib/prisma'

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
    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        data,
        read: false
      }
    })

    console.log(`📧 Notification created for user ${userId}: ${title}`)

    return {
      id: notification.id,
      userId: notification.userId,
      type: notification.type as NotificationType,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      read: notification.read,
      createdAt: notification.createdAt
    }
  } catch (error) {
    console.error('Error creating notification:', error)
    throw new Error('Failed to create notification')
  }
}

export async function getUserNotifications(
  userId: string,
  page: number = 1,
  limit: number = 20,
  unreadOnly: boolean = false
): Promise<{ notifications: Notification[], total: number }> {
  try {
    const where = {
      userId,
      ...(unreadOnly && { read: false })
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.notification.count({ where })
    ])

    return {
      notifications: notifications.map(n => ({
        id: n.id,
        userId: n.userId,
        type: n.type as NotificationType,
        title: n.title,
        message: n.message,
        data: n.data,
        read: n.read,
        createdAt: n.createdAt
      })),
      total
    }
  } catch (error) {
    console.error('Error fetching user notifications:', error)
    throw new Error('Failed to fetch notifications')
  }
}

export async function markNotificationAsRead(userId: string, notificationId: string): Promise<boolean> {
  try {
    const result = await prisma.notification.updateMany({
      where: {
        id: notificationId,
        userId,
        read: false // Only update if not already read
      },
      data: {
        read: true,
        updatedAt: new Date()
      }
    })

    return result.count > 0
  } catch (error) {
    console.error('Error marking notification as read:', error)
    return false
  }
}

export async function markAllNotificationsAsRead(userId: string): Promise<number> {
  try {
    const result = await prisma.notification.updateMany({
      where: {
        userId,
        read: false
      },
      data: {
        read: true,
        updatedAt: new Date()
      }
    })

    return result.count
  } catch (error) {
    console.error('Error marking all notifications as read:', error)
    return 0
  }
}

export async function getUnreadCount(userId: string): Promise<number> {
  try {
    const count = await prisma.notification.count({
      where: {
        userId,
        read: false
      }
    })

    return count
  } catch (error) {
    console.error('Error getting unread count:', error)
    return 0
  }
}

// Notification creators for specific events
export async function notifyXPAwarded(userId: string, xp: number, submissionUrl: string) {
  await createNotification(
    userId,
    NotificationType.XP_AWARDED,
    `🎉 You earned ${xp} XP!`,
    `Your submission has been evaluated and you've been awarded ${xp} XP.`,
    { xp, submissionUrl }
  )
}

export async function notifyReviewAssigned(userId: string, submissionId: string, submissionUrl: string) {
  await createNotification(
    userId,
    NotificationType.REVIEW_ASSIGNED,
    '📝 New review assignment',
    'You have been assigned a new submission to review. Complete it within 72 hours to earn +5 XP.',
    { submissionId, submissionUrl }
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

