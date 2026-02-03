import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { withErrorHandling } from '@/lib/api-middleware'
import { OptimizedNotificationService } from '@/lib/notifications-optimized'
import { NextResponse } from 'next/server'

export const POST = withPermission('authenticated')(
  withErrorHandling(async (request: AuthenticatedRequest) => {
    const userId = request.user.id

    const deletedCount = await OptimizedNotificationService.deleteAll(userId)

    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} notifications`
    })
  })
)
