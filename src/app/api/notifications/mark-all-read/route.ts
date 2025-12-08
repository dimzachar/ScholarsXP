import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { markAllNotificationsAsRead } from '@/lib/notifications'

export const POST = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const markedCount = await markAllNotificationsAsRead(request.user.id)

    return NextResponse.json({
      message: `Marked ${markedCount} notifications as read`,
      markedCount,
      success: true
    })

  } catch (error) {
    console.error('Error marking all notifications as read:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
