import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import {
  getUserNotifications,
  getUnreadCount
} from '@/lib/notifications'

export const GET = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const unreadOnly = searchParams.get('unreadOnly') === 'true'

    if (action === 'unread_count') {
      const unreadCount = await getUnreadCount(request.user.id)
      return NextResponse.json({ unreadCount })
    }

    const result = await getUserNotifications(request.user.id, page, limit, unreadOnly)

    return NextResponse.json({
      notifications: result.notifications,
      total: result.total,
      page,
      limit,
      unreadCount: await getUnreadCount(request.user.id)
    })

  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
})



