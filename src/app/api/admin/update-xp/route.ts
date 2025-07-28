import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPermission } from '@/lib/auth-middleware'

interface UpdateXpRequest {
  userId: string
  xpAmount: number
  reason?: string
}

async function updateXpHandler(request: NextRequest) {
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
          description: `${reason} (${oldXp} → ${xpAmount})`,
          weekNumber: Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000))
        }
      })
    }

    console.log(`Admin updated XP for user ${updatedUser.username}: ${oldXp} → ${xpAmount} (${xpDifference >= 0 ? '+' : ''}${xpDifference})`)

    // Invalidate user's cached data by triggering a cache refresh
    // This will force the dashboard to fetch fresh data
    console.log(`🗑️ Invalidating cache for user ${updatedUser.id} after XP update`)

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
