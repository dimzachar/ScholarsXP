import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { deleteAllNotifications } from '@/lib/notifications'

export const POST = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const deletedCount = await deleteAllNotifications(request.user.id)

    return Response.json({
      message: `Deleted ${deletedCount} notifications`,
      deletedCount,
      success: true
    })
  } catch (error) {
    console.error('Error deleting all notifications:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
})
