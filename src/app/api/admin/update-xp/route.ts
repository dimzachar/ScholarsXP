import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { logAdminAction } from '@/lib/audit-log'
import { getWeekNumber } from '@/lib/utils'

interface UpdateXpRequest {
  userId: string
  xpAmount: number
  reason?: string
}

async function updateXpHandler(request: AuthenticatedRequest) {
  try {
    const { userId, xpAmount, reason = 'Admin manual adjustment' }: UpdateXpRequest = await request.json()

    if (!userId) {
      return NextResponse.json({
        error: 'User ID is required'
      }, { status: 400 })
    }

    if (typeof xpAmount !== 'number' || xpAmount < 0) {
      return NextResponse.json({
        error: 'XP amount must be a non-negative number'
      }, { status: 400 })
    }

    // Get current user data
    const currentUser = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!currentUser) {
      return NextResponse.json({
        error: 'User not found'
      }, { status: 404 })
    }

    const oldXp = currentUser.totalXp
    const xpDifference = xpAmount - oldXp

    // Update user's total XP
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        totalXp: xpAmount
      }
    })

    // Create XP transaction record for audit trail
    if (xpDifference !== 0) {
      await prisma.xpTransaction.create({
        data: {
          userId: userId,
          amount: xpDifference,
          type: 'ADMIN_ADJUSTMENT',
          description: `${reason} (${oldXp} -> ${xpAmount})`,
          weekNumber: getWeekNumber(new Date()),
          adminId: request.user.id,
        }
      })
    }

    // Best-effort admin action audit
    await logAdminAction({
      adminId: request.user.id,
      action: 'XP_OVERRIDE',
      targetType: 'user',
      targetId: userId,
      details: { oldXp, newXp: xpAmount, difference: xpDifference, reason },
    })

    console.log(`Admin updated XP for user ${updatedUser.username}: ${oldXp} -> ${xpAmount} (${xpDifference >= 0 ? '+' : ''}${xpDifference})`)

    // Invalidate user's cached data to force fresh data on dashboard/profile
    const { CacheInvalidation } = await import('@/lib/cache/invalidation')
    const { multiLayerCache } = await import('@/lib/cache/enhanced-cache')
    const cacheInvalidation = new CacheInvalidation(multiLayerCache)
    await cacheInvalidation.invalidateOnUserAction('xp_awarded', userId)
    console.log(`🗑️ Cache invalidated for user ${updatedUser.id} after XP update`)

    return NextResponse.json({
      message: `Successfully updated XP for ${updatedUser.username}`,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        totalXp: updatedUser.totalXp
      },
      change: {
        oldXp,
        newXp: xpAmount,
        difference: xpDifference
      },
      cacheInvalidated: true,
      timestamp: Date.now() // This helps with cache busting
    })

  } catch (error) {
    console.error('Error updating user XP:', error)
    return NextResponse.json({
      error: 'Internal server error'
    }, { status: 500 })
  }
}

export const POST = withPermission('admin_access')(updateXpHandler)

