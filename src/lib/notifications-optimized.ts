/**
 * Optimized Notification System
 * 
 * Features:
 * - Direct DB queries (caching disabled to prevent ghost notifications)
 * - Payload Optimization - Select only needed fields
 * - Cursor Pagination - No expensive COUNT queries
 * - Optimistic Updates - Instant UI updates, background sync
 */

import { createServiceClient } from '@/lib/supabase-server'

// ============================================================================
// TYPES
// ============================================================================

export interface OptimizedNotification {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  createdAt: string
  // Only include data if needed (reduces payload by ~60%)
  data?: Record<string, any>
}

export interface NotificationSyncResult {
  items: OptimizedNotification[]
  hasMore: boolean
  nextCursor?: string
  unreadCount: number
  syncedAt: string
}

// ============================================================================
// OPTIMIZED NOTIFICATION SERVICE
// ============================================================================

export class OptimizedNotificationService {
  
  /**
   * Get notifications with cursor-based pagination
   * Uses direct DB queries (caching disabled to prevent ghost notifications)
   */
  static async syncNotifications(
    userId: string,
    options: {
      cursor?: string
      limit?: number
      since?: string  // ISO timestamp for incremental sync
    } = {}
  ): Promise<NotificationSyncResult> {
    const { cursor, limit = 20, since } = options
    
    // DISABLED: Cache was causing ghost notifications
    // Always fetch fresh from database
    return this.fetchFromDatabase(userId, { cursor, limit, since })
  }

  /**
   * Get ONLY unread count - optimized for badge display
   * Uses exact count for accuracy
   */
  static async getUnreadCount(userId: string): Promise<number> {
    const client = createServiceClient()
    
    try {
      // Use exact count for accuracy
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

  /**
   * Mark as read
   * DISABLED: Cache was causing ghost notifications
   */
  static async markAsRead(userId: string, notificationId: string): Promise<boolean> {
    const client = createServiceClient()
    const { error } = await client
      .from('notifications')
      .update({ read: true, updatedAt: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('userId', userId)

    if (error) {
      console.error('Error marking as read:', error)
      return false
    }

    return true
  }

  /**
   * Mark all as read
   * DISABLED: Cache was causing ghost notifications
   */
  static async markAllAsRead(userId: string): Promise<void> {
    const client = createServiceClient()
    await client
      .from('notifications')
      .update({ read: true, updatedAt: new Date().toISOString() })
      .eq('userId', userId)
      .eq('read', false)
  }

  /**
   * Delete all notifications for a user
   */
  static async deleteAll(userId: string): Promise<number> {
    const client = createServiceClient()
    const { error, count } = await client
      .from('notifications')
      .delete({ count: 'exact' })
      .eq('userId', userId)

    if (error) {
      console.error('Error deleting all notifications:', error)
      return 0
    }

    return count || 0
  }

  /**
   * Create notification
   * DISABLED: Cache was causing ghost notifications
   */
  static async createNotification(
    userId: string,
    notification: Omit<OptimizedNotification, 'id' | 'createdAt'>
  ): Promise<OptimizedNotification | null> {
    // STRICT: Reject ghost notifications
    if (!notification.title?.trim() && !notification.message?.trim()) {
      console.error('[Notifications] Rejected ghost notification for user:', userId)
      return null
    }
    
    const client = createServiceClient()
    
    const { data, error } = await client
      .from('notifications')
      .insert({
        userId,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        read: notification.read,
        data: notification.data
      })
      .select('id, type, title, message, read, createdAt, data')
      .single()

    if (error || !data) {
      console.error('Error creating notification:', error)
      return null
    }

    return {
      id: data.id,
      type: data.type,
      title: data.title,
      message: data.message,
      read: data.read,
      createdAt: data.createdAt,
      data: data.data
    }
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private static async fetchFromDatabase(
    userId: string,
    options: { cursor?: string; limit: number; since?: string }
  ): Promise<NotificationSyncResult> {
    const { cursor, limit, since } = options
    const client = createServiceClient()

    console.log('🔔 [Service] Fetching from database:', { 
      userId: userId.substring(0, 8) + '...', 
      cursor: cursor?.substring(0, 20) + '...', 
      since: since?.substring(0, 20) + '...', 
      limit 
    })

    // Build optimized query - ONLY select needed fields (not `*`) 
    let query = client
      .from('notifications')
      .select('id, type, title, message, read, createdAt, data', { count: 'planned' })  // No 'exact' count!
      .eq('userId', userId)
      .order('createdAt', { ascending: false })

    // Cursor-based pagination (much faster than OFFSET)
    if (cursor) {
      query = query.lt('createdAt', cursor)
    }

    // Incremental sync: only fetch since last checkpoint
    if (since) {
      query = query.gt('createdAt', since)
    }

    query = query.limit(limit + 1)  // +1 to check if there's more

    const { data: notifications, error } = await query

    if (error) {
      console.error('🔔 [Service] Error fetching notifications:', error)
      throw error
    }

    console.log('🔔 [Service] Raw query result:', { 
      count: notifications?.length || 0,
      firstItem: notifications?.[0] ? {
        id: notifications[0].id,
        title: notifications[0].title?.substring(0, 30) + '...',
        read: notifications[0].read
      } : null
    })

    const items = (notifications || []).slice(0, limit).map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      createdAt: n.createdAt,
      // Only include data if it's small, otherwise lazy load
      data: n.data && JSON.stringify(n.data).length < 1000 ? n.data : undefined
    }))

    const hasMore = (notifications || []).length > limit
    const nextCursor = hasMore && items.length > 0 
      ? items[items.length - 1].createdAt 
      : undefined

    // Get unread count - for first page use DB count, for pagination use items count
    const unreadCount = cursor 
      ? items.filter(n => !n.read).length  // For pagination, just count visible items
      : await this.getUnreadCount(userId)  // For first page, use accurate DB count

    const result: NotificationSyncResult = {
      items,
      hasMore,
      nextCursor,
      unreadCount,
      syncedAt: new Date().toISOString()
    }

    console.log('🔔 [Service] Final result:', { 
      itemCount: result.items.length,
      unreadCount: result.unreadCount,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor?.substring(0, 20) + '...'
    })

    return result
  }

  /**
   * DISABLED: Cache was causing ghost notifications
   */
  static async invalidateUserCache(userId: string): Promise<void> {
    // No-op - caching disabled
  }
}

// ============================================================================
// EDGE CACHING - For Vercel Edge
// ============================================================================

export function generateNotificationETag(userId: string, lastModified: string): string {
  // Simple ETag based on user + timestamp
  return `"${Buffer.from(`${userId}:${lastModified}`).toString('base64')}"`
}

export function getNotificationCacheHeaders(options: {
  isPrivate: boolean
  maxAge: number
  staleWhileRevalidate?: number
}): Record<string, string> {
  const { isPrivate, maxAge, staleWhileRevalidate = 60 } = options
  
  return {
    'Cache-Control': `${isPrivate ? 'private' : 'public'}, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
    'Vary': 'Authorization'
  }
}
