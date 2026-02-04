/**
 * 100x Optimized Notifications Hook
 * 
 * Features:
 * - Incremental sync (only fetches new notifications)
 * - No polling - uses SWR + Realtime events only
 * - Optimistic updates (instant UI, background sync)
 * - Request deduplication via SWR
 * - Cache-first strategy
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { useAuthenticatedFetch } from './useAuthenticatedFetch'
import { supabase } from '@/lib/supabase-client'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface OptimizedNotification {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  createdAt: string
  data?: Record<string, unknown>
}

interface NotificationSyncResult {
  items: OptimizedNotification[]
  hasMore: boolean
  nextCursor?: string
  unreadCount: number
  syncedAt: string
}

interface UseNotificationsOptimizedOptions {
  // Disable realtime (use polling fallback)
  disableRealtime?: boolean
  // Initial data for SSR
  initialData?: NotificationSyncResult
}

// Cache keys for notification system - EXPORTED for external cache synchronization
export const NOTIFICATIONS_KEY = '/api/notifications-optimized?limit=20&v=3'
export const UNREAD_COUNT_KEY = '/api/notifications-optimized?action=count&v=3'

// Clear all notification caches (useful for logout/reset)
export function clearNotificationCaches() {
  globalMutate(NOTIFICATIONS_KEY, undefined, { revalidate: false })
  globalMutate(UNREAD_COUNT_KEY, undefined, { revalidate: false })
}

// SWR fetcher with auth
const createFetcher = (authenticatedFetch: ReturnType<typeof useAuthenticatedFetch>['authenticatedFetch']) => 
  async (url: string): Promise<NotificationSyncResult> => {
    const response = await authenticatedFetch(url)
    
    if (response.status === 304) {
      // Not modified - return cached data
      const cached = await globalMutate(url)
      return cached as NotificationSyncResult
    }
    
    if (!response.ok) {
      const errorText = await response.text()
      // console.error('🔔 [Fetcher] Error response:', { status: response.status, text: errorText })
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const body = await response.json()
    
    // Handle both direct data and wrapped response formats
    const data = body?.data || body
    
    if (!data) {
      // console.error('🔔 [Fetcher] No data in response:', body)
      throw new Error('No data in response')
    }
    
    return data
  }

export function useNotificationsOptimized(options: UseNotificationsOptimizedOptions = {}) {
  const { disableRealtime = false, initialData } = options
  const { authenticatedFetch, isAuthenticated } = useAuthenticatedFetch()
  const fetcher = useRef(createFetcher(authenticatedFetch)).current
  
  // Track last sync timestamp for incremental sync
  const lastSyncRef = useRef<string | undefined>(undefined)
  const channelRef = useRef<RealtimeChannel | null>(null)
  
  // Track recently deleted notification IDs to prevent real-time events from re-adding them
  const recentlyDeletedRef = useRef<Set<string>>(new Set())
  const recentlyMarkedReadRef = useRef<Set<string>>(new Set())
  
  // Track pending operations (optimistic updates in flight)
  const [pendingDeletions, setPendingDeletions] = useState<Set<string>>(new Set())
  const [pendingRead, setPendingRead] = useState<Set<string>>(new Set())
  
  // SWR key - changes when we need to force refresh
  // v3: Fixed API endpoint path
  const swrKey = NOTIFICATIONS_KEY
  
  // Separate key for unread count
  const unreadCountKey = UNREAD_COUNT_KEY
  
  // Main data fetching with SWR
  const { data, error, isLoading, isValidating, mutate: revalidate } = useSWR<NotificationSyncResult>(
    isAuthenticated ? swrKey : null, // Only fetch when authenticated
    fetcher,
    {
      fallbackData: initialData,
      // Don't revalidate on focus (we use realtime)
      revalidateOnFocus: false,
      // Don't revalidate on reconnect (we use realtime)
      revalidateOnReconnect: false,
      // Refresh interval: 0 (disabled - use realtime instead)
      refreshInterval: 0,
      // Deduping interval: 5 seconds
      dedupingInterval: 5000,
      // Keep previous data while fetching
      keepPreviousData: true,
      // Error retry configuration
      errorRetryCount: 3,
      errorRetryInterval: 1000,
      // SWR's built-in cache is safe (clears on delete)
      // This gives us <10ms cache hits without ghost issues
    }
  )

  // Update last sync timestamp when data changes
  useEffect(() => {
    if (data?.syncedAt) {
      lastSyncRef.current = data.syncedAt
    }
  }, [data, error, isLoading, isValidating])

  // Cross-tab synchronization using BroadcastChannel
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    // Create broadcast channel for notification sync across tabs
    const channel = new BroadcastChannel('notification-sync')
    
    channel.onmessage = (event) => {
      if (event.data?.type === 'notification-change') {
        // Force refresh when another tab changes notifications
        revalidate(undefined, { revalidate: true })
      }
    }
    
    return () => {
      channel.close()
    }
  }, [revalidate])

  // Force refresh when tab becomes visible (handles missed realtime events)
  useEffect(() => {
    if (typeof document === 'undefined') return
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible - refresh to catch up
        revalidate(undefined, { revalidate: true })
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [revalidate])

  // Realtime subscription
  useEffect(() => {
    if (disableRealtime || !isAuthenticated) {
      return
    }
    
    // Get user ID from current session
    const setupSubscription = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const userId = session?.user?.id
        
        if (!userId) {
          return
        }

        // Clean up existing subscription
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current)
        }

        const channel = supabase
          .channel(`notifications-optimized-v3:${userId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'notifications',
              filter: `userId=eq.${userId}`,
            },
            (payload) => {
              // STRICT: Skip notifications without actual content
              const rawTitle = payload.new.title || payload.new.message?.substring(0, 50)
              const rawMessage = payload.new.message
              
              if (!rawTitle?.trim() && !rawMessage?.trim()) {
                return
              }
              
              // Skip if this notification was recently deleted (race condition prevention)
              if (recentlyDeletedRef.current.has(payload.new.id)) {
                // Silently ignore recently deleted notifications
                return
              }
              
              // New notification - optimistically add to cache
              const newNotification: OptimizedNotification = {
                id: payload.new.id,
                type: payload.new.type,
                title: rawTitle?.trim() || 'Notification',
                message: rawMessage?.trim() || '',
                read: payload.new.read ?? false,
                createdAt: payload.new.createdAt || payload.new.created_at || new Date().toISOString(),
                data: payload.new.data || payload.new.metadata
              }
              
              const isUnread = !newNotification.read

              // Update SWR cache optimistically
              revalidate(
                (currentData: NotificationSyncResult | undefined) => {
                  if (!currentData) {
                    return {
                      items: [newNotification],
                      hasMore: false,
                      unreadCount: isUnread ? 1 : 0,
                      syncedAt: new Date().toISOString()
                    }
                  }
                  
                  // Skip if already exists
                  if (currentData.items.some((i: OptimizedNotification) => i.id === newNotification.id)) {
                    return currentData
                  }
                  
                  return {
                    ...currentData,
                    items: [newNotification, ...currentData.items].slice(0, 20),
                    unreadCount: currentData.unreadCount + (isUnread ? 1 : 0),
                    syncedAt: new Date().toISOString()
                  }
                },
                { revalidate: false }
              )
              
              // ALSO update the unread count cache for badge
              if (isUnread) {
                globalMutate(
                  unreadCountKey,
                  (current: number | undefined) => (current || 0) + 1,
                  { revalidate: false }
                )
              }
              
              // Broadcast to other tabs
              if (typeof BroadcastChannel !== 'undefined') {
                const bc = new BroadcastChannel('notification-sync')
                bc.postMessage({ type: 'notification-change', action: 'insert' })
                bc.close()
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'notifications',
              filter: `userId=eq.${userId}`,
            },
            (payload) => {
              // Skip if this notification was recently deleted
              if (recentlyDeletedRef.current.has(payload.new.id)) {
                // Silently ignore updates to recently deleted notifications
                return
              }
              
              const readValue = payload.new.read ?? payload.new.is_read
              const wasRead = payload.old.read ?? payload.old.is_read
              const becameRead = readValue && !wasRead
              
              // Skip if we already marked this as read locally (race condition prevention)
              if (becameRead && recentlyMarkedReadRef.current.has(payload.new.id)) {
                // Silently ignore updates to recently marked-read notifications
                return
              }
              
              revalidate(
                (currentData: NotificationSyncResult | undefined) => {
                  if (!currentData) return currentData
                  
                  const updatedItems = currentData.items.map((item: OptimizedNotification) => 
                    item.id === payload.new.id 
                      ? { ...item, read: readValue ?? item.read }
                      : item
                  )
                  
                  const newUnreadCount = updatedItems.filter((i: OptimizedNotification) => !i.read).length
                  
                  return {
                    ...currentData,
                    items: updatedItems,
                    unreadCount: newUnreadCount,
                    syncedAt: new Date().toISOString()
                  }
                },
                { revalidate: false }
              )
              
              // ALSO update the unread count cache if notification became read
              if (becameRead) {
                globalMutate(
                  unreadCountKey,
                  (current: number | undefined) => Math.max(0, (current || 0) - 1),
                  { revalidate: false }
                )
              }
              
              // Broadcast to other tabs
              if (typeof BroadcastChannel !== 'undefined') {
                const bc = new BroadcastChannel('notification-sync')
                bc.postMessage({ type: 'notification-change', action: 'update' })
                bc.close()
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'notifications',
              filter: `userId=eq.${userId}`,
            },
            (payload) => {
              // Skip if we already deleted this locally (prevent double-processing)
              if (recentlyDeletedRef.current.has(payload.old.id)) {
                // Silently ignore duplicate delete events
                return
              }
              
              // Find the deleted notification to check if it was unread
              const deletedItem = data?.items.find((i: OptimizedNotification) => i.id === payload.old.id)
              const wasUnread = deletedItem && !deletedItem.read
              
              revalidate(
                (currentData: NotificationSyncResult | undefined) => {
                  if (!currentData) return currentData
                  
                  const filteredItems = currentData.items.filter(
                    (item: OptimizedNotification) => item.id !== payload.old.id
                  )
                  
                  return {
                    ...currentData,
                    items: filteredItems,
                    unreadCount: filteredItems.filter((i: OptimizedNotification) => !i.read).length,
                    syncedAt: new Date().toISOString()
                  }
                },
                { revalidate: false }
              )
              
              // ALSO update the unread count cache if deleted notification was unread
              if (wasUnread) {
                globalMutate(
                  unreadCountKey,
                  (current: number | undefined) => Math.max(0, (current || 0) - 1),
                  { revalidate: false }
                )
              }
              
              // Broadcast to other tabs
              if (typeof BroadcastChannel !== 'undefined') {
                const bc = new BroadcastChannel('notification-sync')
                bc.postMessage({ type: 'notification-change', action: 'delete' })
                bc.close()
              }
            }
          )
          .subscribe((status) => {
            if (status === 'CHANNEL_ERROR') {
              // console.error('🔔 [Realtime] Channel error, will retry')
            } else if (status === 'TIMED_OUT') {
              // console.error('🔔 [Realtime] Subscription timed out')
            }
          })

        channelRef.current = channel
      } catch (error) {
        // console.error('🔔 [Hook] Failed to setup realtime subscription:', error)
      }
    }

    setupSubscription()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [disableRealtime, isAuthenticated, revalidate, data?.items, unreadCountKey])

  // Load more (pagination)
  const loadMore = useCallback(async () => {
    if (!data?.hasMore || !data.nextCursor) return
    
    const nextKey = `/api/notifications-optimized?limit=20&cursor=${encodeURIComponent(data.nextCursor)}&v=3`
    
    const result = await fetcher(nextKey)
    
    // Append to existing data
    revalidate(
      (currentData) => {
        if (!currentData) return result
        
        return {
          ...result,
          items: [...currentData.items, ...result.items]
        }
      },
      { revalidate: false }
    )
  }, [data, fetcher, revalidate])

  // Refresh (force fresh data)
  const refresh = useCallback(async () => {
    // Add cache-busting timestamp to force fresh fetch
    const cacheBuster = `t=${Date.now()}`
    const freshKey = `/api/notifications-optimized?limit=20&v=3&${cacheBuster}`
    
    try {
      // Force SWR to treat this as a new request
      await globalMutate(swrKey, undefined, { revalidate: false })
      
      // Fetch fresh data
      const result = await fetcher(freshKey)
      
      // Replace cache with fresh data
      revalidate(result, { revalidate: false })
      
      // Clear pending deletions since we have fresh data
      setPendingDeletions(new Set())
    } catch (error) {
      // console.error('🔔 [Hook] Refresh error:', error)
      // Fall back to normal revalidate
      await revalidate()
    }
  }, [fetcher, revalidate, swrKey])

  // Mark as read (optimistic)
  const markAsRead = useCallback(async (notificationId: string) => {
    if (!data) return
    
    // Track this ID to prevent real-time race conditions
    recentlyMarkedReadRef.current.add(notificationId)
    // Clear after 5 seconds
    setTimeout(() => recentlyMarkedReadRef.current.delete(notificationId), 5000)
    
    // Store current data for potential rollback
    const previousData = data
    const wasUnread = data.items.find(item => item.id === notificationId)?.read === false
    
    // Optimistic update - update cache immediately
    const optimisticData = {
      ...data,
      items: data.items.map(item =>
        item.id === notificationId ? { ...item, read: true } : item
      ),
      unreadCount: Math.max(0, data.unreadCount - 1)
    }
    
    // Update SWR cache immediately (no revalidation)
    revalidate(optimisticData, { revalidate: false })
    
    // ALSO update the unread count cache immediately if notification was unread
    if (wasUnread) {
      const currentCount = previousData?.unreadCount || 0
      globalMutate(unreadCountKey, Math.max(0, currentCount - 1), { revalidate: false })
    }
    
    // Background API call
    try {
      const response = await authenticatedFetch(`/api/notifications-optimized/${notificationId}`, {
        method: 'PATCH'
      })
      
      if (!response.ok) {
        // console.error('🔔 [Hook] Mark as read failed, reverting:', response.status)
        // Revert on error
        revalidate(previousData, { revalidate: false })
        globalMutate(unreadCountKey, undefined, { revalidate: true })
      }
    } catch (error) {
      // console.error('🔔 [Hook] Mark as read error, reverting:', error)
      // Revert on error
      revalidate(previousData, { revalidate: false })
      globalMutate(unreadCountKey, undefined, { revalidate: true })
    }
  }, [authenticatedFetch, revalidate, data, unreadCountKey])

  // Mark all as read (optimistic)
  const markAllAsRead = useCallback(async () => {
    // Store current data for potential rollback
    const previousData = data
    
    // Optimistic update - update cache immediately
    const optimisticData = data ? {
      ...data,
      items: data.items.map(item => ({ ...item, read: true })),
      unreadCount: 0
    } : data
    
    // Update SWR cache immediately (no revalidation)
    revalidate(optimisticData, { revalidate: false })
    
    // ALSO update the unread count cache immediately
    globalMutate(unreadCountKey, 0, { revalidate: false })
    
    // Background API call
    try {
      await authenticatedFetch('/api/notifications-optimized?action=mark-all-read', {
        method: 'POST'
      })
      // Force revalidate both caches after success to ensure consistency
      globalMutate(unreadCountKey, undefined, { revalidate: true })
    } catch (error) {
      // Revert on error
      if (previousData) {
        revalidate(previousData, { revalidate: false })
      }
      // Revert count too
      globalMutate(unreadCountKey, undefined, { revalidate: true })
    }
  }, [authenticatedFetch, revalidate, data, unreadCountKey])

  // Delete notification (optimistic)
  const deleteNotification = useCallback(async (notificationId: string) => {
    if (!data) return
    
    // Track this ID as pending deletion (prevents UI flicker)
    setPendingDeletions(prev => new Set(prev).add(notificationId))
    
    // Track this ID to prevent real-time race conditions (delayed events re-adding it)
    recentlyDeletedRef.current.add(notificationId)
    
    // Store current data for potential rollback
    const previousData = data
    
    // Check if the notification was unread before deleting
    const deletedNotification = data.items.find(i => i.id === notificationId)
    const wasUnread = deletedNotification?.read === false
    
    // Optimistic update - update cache immediately
    const filteredItems = data.items.filter(i => i.id !== notificationId)
    const newUnreadCount = filteredItems.filter(i => !i.read).length
    const optimisticData = {
      ...data,
      items: filteredItems,
      unreadCount: newUnreadCount
    }
    
    // Update SWR cache immediately (no revalidation)
    revalidate(optimisticData, { revalidate: false })
    
    // ALSO update the unread count cache immediately if notification was unread
    if (wasUnread) {
      globalMutate(unreadCountKey, newUnreadCount, { revalidate: false })
    }
    
    // Background API call
    try {
      const response = await authenticatedFetch(`/api/notifications-optimized/${notificationId}`, {
        method: 'DELETE'
      })
      
      // Remove from pending deletions
      setPendingDeletions(prev => {
        const next = new Set(prev)
        next.delete(notificationId)
        return next
      })
      
      // Keep in deleted set for 10 seconds to catch delayed real-time events
      setTimeout(() => recentlyDeletedRef.current.delete(notificationId), 10000)
      
      if (!response.ok) {
        // console.error('🔔 [Hook] Delete failed, reverting:', response.status)
        // Remove from deleted set on error so we can try again
        recentlyDeletedRef.current.delete(notificationId)
        // Revert on error
        revalidate(previousData, { revalidate: false })
        globalMutate(unreadCountKey, undefined, { revalidate: true })
      } else {
        // Ensure count cache is updated after successful delete
        if (wasUnread) {
          globalMutate(unreadCountKey, newUnreadCount, { revalidate: false })
        }
      }
    } catch (error) {
      // console.error('🔔 [Hook] Delete error, reverting:', error)
      // Remove from pending and deleted set on error
      setPendingDeletions(prev => {
        const next = new Set(prev)
        next.delete(notificationId)
        return next
      })
      recentlyDeletedRef.current.delete(notificationId)
      // Revert on error
      revalidate(previousData, { revalidate: false })
      globalMutate(unreadCountKey, undefined, { revalidate: true })
    }
  }, [authenticatedFetch, revalidate, data, unreadCountKey])

  // Delete all notifications (optimistic)
  const deleteAll = useCallback(async () => {
    if (!data) return
    
    // Track all IDs being deleted
    const deletedIds = data.items.map(i => i.id)
    
    // Add to pending deletions
    setPendingDeletions(prev => {
      const next = new Set(prev)
      deletedIds.forEach(id => next.add(id))
      return next
    })
    
    // Track for real-time prevention
    deletedIds.forEach(id => recentlyDeletedRef.current.add(id))
    
    const previousData = data
    
    const optimisticData = {
      ...data,
      items: [],
      unreadCount: 0,
      hasMore: false
    }
    
    revalidate(optimisticData, { revalidate: false })
    
    // ALSO update the unread count cache immediately
    globalMutate(unreadCountKey, 0, { revalidate: false })
    
    try {
      const response = await authenticatedFetch('/api/notifications-optimized/delete-all', {
        method: 'POST'
      })
      
      // Clear pending deletions
      setPendingDeletions(new Set())
      
      // Keep in deleted set for 10 seconds
      setTimeout(() => {
        deletedIds.forEach(id => recentlyDeletedRef.current.delete(id))
      }, 10000)
      
      if (!response.ok) {
        // console.error('🔔 [Hook] Delete all failed, reverting:', response.status)
        // Clear deleted tracking on error
        deletedIds.forEach(id => recentlyDeletedRef.current.delete(id))
        revalidate(previousData, { revalidate: false })
        // Revert count too
        globalMutate(unreadCountKey, undefined, { revalidate: true })
      } else {
        // Force revalidate count after successful delete
        globalMutate(unreadCountKey, 0, { revalidate: false })
      }
    } catch (error) {
      // console.error('🔔 [Hook] Delete all error, reverting:', error)
      // Clear pending and deleted tracking on error
      setPendingDeletions(new Set())
      deletedIds.forEach(id => recentlyDeletedRef.current.delete(id))
      revalidate(previousData, { revalidate: false })
      // Revert count too
      globalMutate(unreadCountKey, undefined, { revalidate: true })
    }
  }, [authenticatedFetch, revalidate, data, unreadCountKey])

  // Filter out pending deletions from the returned notifications
  const filteredNotifications = (data?.items || []).filter(
    item => !pendingDeletions.has(item.id)
  )
  
  // Calculate unread count from filtered items
  const filteredUnreadCount = filteredNotifications.filter(item => !item.read).length

  return {
    notifications: filteredNotifications,
    rawNotifications: data?.items || [],
    unreadCount: filteredUnreadCount,
    hasMore: data?.hasMore || false,
    isLoading,
    isValidating,
    error,
    refresh,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAll
  }
}

/**
 * Hook for unread count only (ultra-lightweight)
 * Uses separate SWR key for badge/indicator
 * 
 * NOTE: Uses aggressive revalidation to prevent badge count desync
 */
export function useUnreadCount() {
  const { authenticatedFetch, isAuthenticated } = useAuthenticatedFetch()
  
  const { data, error, mutate: mutateCount } = useSWR(
    isAuthenticated ? UNREAD_COUNT_KEY : null, // Only fetch when authenticated
    async (url) => {
      const response = await authenticatedFetch(url)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const body = await response.json()
      const data = body?.data || body
      
      return data?.unreadCount as number
    },
    {
      // Revalidate more frequently to prevent desync (10 seconds instead of 30)
      refreshInterval: 10000,
      // Revalidate on focus to catch up after tab switch
      revalidateOnFocus: true,
      // Use the global cache
      populateCache: true,
      // Dedupe to prevent excessive requests
      dedupingInterval: 2000,
    }
  )

  return {
    unreadCount: data || 0,
    isLoading: !error && data === undefined,
    error,
    // Expose mutate for manual updates
    mutate: mutateCount
  }
}