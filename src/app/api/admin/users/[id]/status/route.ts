import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'
import { logAdminAction } from '@/lib/audit-log'

export const PATCH = withPermission('admin_access')(async (
  request: AuthenticatedRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    // Await params as required by Next.js 15
    const resolvedParams = await params
    const userId = resolvedParams.id

    if (!userId) {
      return NextResponse.json(
        { message: 'User ID is required' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { action } = body

    if (!action || !['deactivate', 'reactivate'].includes(action)) {
      return NextResponse.json(
        { message: 'Valid action is required (deactivate or reactivate)' },
        { status: 400 }
      )
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, lastActiveAt: true }
    })

    if (!existingUser) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      )
    }

    // Update user status by setting lastActiveAt
    // Deactivate: set to a very old date (e.g., 1970-01-01)
    // Reactivate: set to current date
    const lastActiveAt = action === 'deactivate' 
      ? new Date('1970-01-01T00:00:00.000Z')
      : new Date()

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt },
      select: {
        id: true,
        username: true,
        email: true,
        lastActiveAt: true
      }
    })

    console.log(`Admin ${request.user.id} ${action}d user ${userId} (${existingUser.username})`)

    // Audit log (best-effort)
    await logAdminAction({
      adminId: request.user.id,
      action: 'SYSTEM_CONFIG',
      targetType: 'user',
      targetId: userId,
      details: { action, lastActiveAt: updatedUser.lastActiveAt },
    })

    return NextResponse.json({
      message: `User ${action}d successfully`,
      user: updatedUser
    })

  } catch (error) {
    console.error('Error updating user status:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})
