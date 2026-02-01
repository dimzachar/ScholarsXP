/**
 * Individual Notification Operations
 * PATCH: Mark as read
 * DELETE: Delete notification
 * 
 * NOTE: Uses Node.js runtime (not Edge) due to bundle size constraints
 * with @privy-io/node and @supabase/supabase-js dependencies.
 */

import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { withErrorHandling } from '@/lib/api-middleware'
import { OptimizedNotificationService } from '@/lib/notifications-optimized'
import { createServiceClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

/**
 * PATCH - Mark notification as read
 */
export const PATCH = withPermission('authenticated')(
  withErrorHandling(async (
    request: AuthenticatedRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const { id } = await params
    const userId = request.user.id

    const success = await OptimizedNotificationService.markAsRead(userId, id)

    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      )
    }

    // Return 204 No Content for optimal performance
    return new NextResponse(null, { status: 204 })
  })
)

/**
 * DELETE - Delete single notification
 */
export const DELETE = withPermission('authenticated')(
  withErrorHandling(async (
    request: AuthenticatedRequest,
    { params }: { params: Promise<{ id: string }> }
  ) => {
    const { id } = await params
    const userId = request.user.id

    const client = createServiceClient()
    const { error, count } = await client
      .from('notifications')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('userId', userId)

    if (error || !count) {
      return NextResponse.json(
        { success: false, error: 'Notification not found' },
        { status: 404 }
      )
    }

    return new NextResponse(null, { status: 204 })
  })
)