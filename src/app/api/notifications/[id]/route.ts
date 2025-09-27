import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { markNotificationAsRead, deleteNotification } from '@/lib/notifications'

export const PATCH = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const url = new URL(request.url)
    const notificationId = url.pathname.split('/').slice(-1)[0] // Extract ID from path
    if (!notificationId) {
      return NextResponse.json(
        { error: 'Notification ID is required' },
        { status: 400 }
      )
    }

    const success = await markNotificationAsRead(request.user.id, notificationId, request.user.access_token)

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

export const DELETE = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const url = new URL(request.url)
    const notificationId = url.pathname.split('/').slice(-1)[0] // Extract ID from path
    if (!notificationId) {
      return NextResponse.json(
        { error: 'Notification ID is required' },
        { status: 400 }
      )
    }

    const success = await deleteNotification(request.user.id, notificationId, request.user.access_token)

    if (success) {
      return NextResponse.json({
        message: 'Notification deleted successfully',
        success: true
      })
    } else {
      return NextResponse.json(
        { error: 'Notification not found' },
        { status: 404 }
      )
    }

  } catch (error) {
    console.error('Error deleting notification:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})
