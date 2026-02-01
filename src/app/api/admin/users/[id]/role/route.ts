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
    const { role } = body

    if (!role || !ALL_ROLES.includes(role)) {
      return NextResponse.json(
        { message: 'Valid role is required (USER, REVIEWER, ADMIN, or DEVELOPER)' },
        { status: 400 }
      )
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true }
    })

    if (!existingUser) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      )
    }

    // Update user role
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        username: true,
        email: true,
        role: true
      }
    })

    console.log(`Admin ${request.user.id} updated role for user ${userId} from ${existingUser.role} to ${role}`)

    // Audit log (best-effort)
    await logAdminAction({
      adminId: request.user.id,
      action: 'USER_ROLE_CHANGE',
      targetType: 'user',
      targetId: userId,
      details: { oldRole: existingUser.role, newRole: role },
    })

    return NextResponse.json({
      message: 'User role updated successfully',
      user: updatedUser
    })

  } catch (error) {
    console.error('Error updating user role:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})
