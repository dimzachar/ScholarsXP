import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import {
  getUserNotifications,
  getUnreadCount
} from '@/lib/notifications'
import { withErrorHandling, createSuccessResponse } from '@/lib/api-middleware'
import { withUserOptimization } from '@/middleware/api-optimization'

export const GET = withUserOptimization(
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

      const result = await getUserNotifications(request.user.id, page, limit, unreadOnly)

      return createSuccessResponse({
        notifications: result.notifications,
        total: result.total,
        page,
        limit,
        unreadCount: await getUnreadCount(request.user.id)
      })
    })
  )
)



