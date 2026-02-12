import { supabaseClient } from '@/lib/supabase'
import { createServiceClient } from '@/lib/supabase-server'
import { prisma } from '@/lib/prisma'
import { notifyDiscordPromotion } from './discord-notifier'

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
  SUBMISSION_FINALIZED = 'SUBMISSION_FINALIZED',
  WEEKLY_SUMMARY = 'WEEKLY_SUMMARY',
  STREAK_ACHIEVED = 'STREAK_ACHIEVED',
  PENALTY_APPLIED = 'PENALTY_APPLIED',
  ADMIN_MESSAGE = 'ADMIN_MESSAGE',
  RANK_PROMOTED = 'RANK_PROMOTED'
}

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  data?: any
): Promise<Notification> {
  // STRICT: Reject ghost notifications
  if (!title?.trim() && !message?.trim()) {
    throw new Error('Cannot create notification without title or message')
  }
  
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

function getNotificationClient() {
  // Use service client for all notification operations
  // Auth is handled at the API route level via Privy middleware
  return createServiceClient()
}

export async function getUserNotifications(
  userId: string,
  page: number = 1,
  limit: number = 20,
  unreadOnly: boolean = false
): Promise<{ notifications: Notification[], total: number }> {
  try {
    const client = getNotificationClient()
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

export async function markNotificationAsRead(userId: string, notificationId: string): Promise<boolean> {
  try {
    const client = getNotificationClient()
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

export async function markAllNotificationsAsRead(userId: string): Promise<number> {
  try {
    const client = getNotificationClient()
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

export async function deleteAllNotifications(userId: string): Promise<number> {
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

export async function getUnreadCount(userId: string): Promise<number> {
  try {
    const client = getNotificationClient()
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

export async function deleteNotification(userId: string, notificationId: string): Promise<boolean> {
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
    'You have been assigned a new submission to review. Complete it within 48 hours to earn +50 XP (+5 XP timeliness bonus).',
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

export async function notifySubmissionFinalized(
  userId: string,
  submissionId: string,
  finalXp: number,
  submissionUrl?: string
) {
  await createNotification(
    userId,
    NotificationType.SUBMISSION_FINALIZED,
    '🎉 Submission Finalized!',
    `Congratulations! Your submission has been finalized and you've earned ${finalXp} XP!`,
    { submissionId, finalXp, submissionUrl, status: 'FINALIZED' }
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

export async function notifyRankPromoted(
  userId: string,
  oldRank: { displayName: string; tier: string | null; category: string },
  newRank: { displayName: string; tier: string | null; category: string }
) {
  const tierEmojis: Record<string, string> = {
    'Bronze': '🥉',
    'Silver': '🥈',
    'Gold': '🥇',
    'Platinum': '💠',
    'Diamond': '💎'
  }

  const categoryEmojis: Record<string, string> = {
    'Initiate': '🌱',
    'Apprentice': '🔥',
    'Journeyman': '🧭',
    'Erudite': '📚',
    'Master': '👑'
  }

  const categoryChanged = oldRank.category !== newRank.category
  const tierChanged = oldRank.tier !== newRank.tier
  
  // Determine if this is a promotion or demotion by comparing rank order
  const { RANK_THRESHOLDS } = await import('@/lib/gamified-ranks')
  const oldRankIndex = RANK_THRESHOLDS.findIndex(r => r.displayName === oldRank.displayName)
  const newRankIndex = RANK_THRESHOLDS.findIndex(r => r.displayName === newRank.displayName)
  const isDemotion = newRankIndex < oldRankIndex
  
  // Determine emoji: tier emoji if available, otherwise category emoji
  const emoji = newRank.tier 
    ? (tierEmojis[newRank.tier] || '🏆')
    : (categoryEmojis[newRank.category] || '🏆')

  let title: string
  let message: string

  if (isDemotion) {
    // Rank demotion
    title = `⚠️ Rank Change: ${newRank.displayName}`
    message = `Your rank has changed from ${oldRank.displayName} to ${newRank.displayName} due to XP adjustment.`
  } else if (categoryChanged) {
    // Discord role promotion (major milestone)
    title = `${emoji} New Role: ${newRank.displayName}!`
    message = `Congratulations! You've advanced from ${oldRank.displayName} to ${newRank.displayName}! You've unlocked a new Discord role!`
  } else if (tierChanged && newRank.tier) {
    // Tier promotion within same category
    title = `${emoji} Tier Up: ${newRank.displayName}!`
    message = `Congratulations! You've advanced from ${oldRank.displayName} to ${newRank.displayName}. Keep climbing!`
  } else {
    // Generic promotion
    title = `${emoji} Rank Up: ${newRank.displayName}!`
    message = `Congratulations! You've advanced from ${oldRank.displayName} to ${newRank.displayName}!`
  }

  await createNotification(
    userId,
    isDemotion ? NotificationType.ADMIN_MESSAGE : NotificationType.RANK_PROMOTED,
    title,
    message,
    {
      oldRank,
      newRank,
      categoryChanged,
      tierChanged,
      isDemotion,
      color: newRank.tier ? tierEmojis[newRank.tier] : categoryEmojis[newRank.category]
    }
  )

  // Also log to admin actions for audit trail (system-triggered)
  const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001'
  
  // Determine if this is the first promotion (from no rank to Initiate)
  const isFirstPromotion = !oldRank || oldRank.category === 'None' || oldRank.displayName === 'No Rank'
  
  try {
    // Ensure system user exists (idempotent - safe to call multiple times)
    await prisma.user.upsert({
      where: { id: SYSTEM_USER_ID },
      update: {}, // No updates needed if exists
      create: {
        id: SYSTEM_USER_ID,
        username: 'system',
        email: 'system@scholarsxp.internal',
        role: 'ADMIN',
        totalXp: 0,
        currentWeekXp: 0
      }
    })
    
    await prisma.adminAction.create({
      data: {
        adminId: SYSTEM_USER_ID,
        action: 'RANK_PROMOTION',
        targetType: 'user',
        targetId: userId,
        details: {
          oldRank: oldRank?.displayName || 'No Rank',
          newRank: newRank.displayName,
          oldCategory: oldRank?.category || 'None',
          newCategory: newRank.category,
          oldTier: oldRank?.tier || null,
          newTier: newRank.tier,
          categoryChanged: isFirstPromotion || categoryChanged, // First promotion is always a category change
          tierChanged: tierChanged && !isFirstPromotion, // First promotion has no tier change
          isFirstPromotion,
          isDemotion
        }
      }
    })
    console.log(`[Rank${isDemotion ? 'Demotion' : 'Promotion'}] Logged admin action for user ${userId}: ${oldRank?.displayName || 'No Rank'} → ${newRank.displayName}`)
  } catch (err) {
    console.warn(`[Rank${isDemotion ? 'Demotion' : 'Promotion'}] Failed to log admin action:`, err)
  }

  // Send Discord notification for major role changes only (fire and forget)
  if (categoryChanged) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true }
    })
    
    if (user?.username) {
      // Fire and forget - don't await to avoid blocking
      notifyDiscordPromotion({
        username: user.username,
        oldCategory: oldRank?.category || 'None',
        newCategory: newRank.category,
        date: new Date()
      }).catch(err => {
        console.warn('[Discord] Failed to send promotion notification:', err)
      })
    }
  }
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
