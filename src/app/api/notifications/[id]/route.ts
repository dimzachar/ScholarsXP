import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { markNotificationAsRead } from '@/lib/notifications'

export const PATCH = withPermission('authenticated')(async (
  request: AuthenticatedRequest,
  { params }: { params: { id: string } }
) => {
  try {

    const notificationId = params.id
    if (!notificationId) {
      return NextResponse.json(
        { error: 'Notification ID is required' },
        { status: 400 }
      )
    }

    const success = await markNotificationAsRead(request.user.id, notificationId)

    if (success) {
      return NextResponse.json({
        message: 'Notification marked as read',
        success: true
      })
    } else {
      return NextResponse.json(
        { error: 'Notification not found or already read' },
        { status: 404 }
      )
    }

  } catch (error) {
    console.error('Error marking notification as read:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
