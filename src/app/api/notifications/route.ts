import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import {
  getUserNotifications,
  getUnreadCount
} from '@/lib/notifications'
import { withErrorHandling, createSuccessResponse } from '@/lib/api-middleware'
import { withAPIOptimization } from '@/middleware/api-optimization'

export const GET = withAPIOptimization(
  withPermission('authenticated')(
    withErrorHandling(async (request: AuthenticatedRequest) => {
      const { searchParams } = new URL(request.url)
      const action = searchParams.get('action')
      const page = parseInt(searchParams.get('page') || '1')
      const limit = parseInt(searchParams.get('limit') || '20')
      const unreadOnly = searchParams.get('unreadOnly') === 'true'

      if (action === 'unread_count') {
        const unreadCount = await getUnreadCount(request.user.id)
        return createSuccessResponse({ unreadCount })
      }

      const result = await getUserNotifications(
        request.user.id,
        page,
        limit,
        unreadOnly
      )

      // Compute unread count from already-fetched notifications to avoid extra DB query
      // For unreadOnly filter, all returned notifications are unread
      const unreadCount = unreadOnly 
        ? result.notifications.length 
        : result.notifications.filter(n => !n.read).length

      return createSuccessResponse({
        notifications: result.notifications,
        total: result.total,
        page,
        limit,
        unreadCount
      })
    })
  ),
  { 
    rateLimitType: 'notifications', 
    caching: true, // Enable caching with short TTL for user data
    compression: true, 
    performanceMonitoring: true, 
    rateLimit: true,
    customCacheConfig: {
      maxAge: 30, // 30 seconds browser cache
      private: true, // User-specific data
      mustRevalidate: true
    }
  }
)



