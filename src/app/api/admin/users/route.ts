import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'

export const GET = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url)

    // Pagination parameters
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    // Filter parameters
    const role = searchParams.get('role') // 'USER', 'REVIEWER', 'ADMIN'
    const search = searchParams.get('search') // Search by username, email
    const xpMin = searchParams.get('xpMin') ? parseInt(searchParams.get('xpMin')!) : undefined
    const xpMax = searchParams.get('xpMax') ? parseInt(searchParams.get('xpMax')!) : undefined
    const lastActiveFrom = searchParams.get('lastActiveFrom')
    const lastActiveTo = searchParams.get('lastActiveTo')
    const sortBy = searchParams.get('sortBy') || 'createdAt'
    const sortOrder = searchParams.get('sortOrder') || 'desc'
    const status = searchParams.get('status') // 'active', 'inactive', 'suspended'

    // Build where clause
    const where: any = {}

    if (role) {
      where.role = role
    }

    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ]
    }

    if (xpMin !== undefined || xpMax !== undefined) {
      where.totalXp = {}
      if (xpMin !== undefined) {
        where.totalXp.gte = xpMin
      }
      if (xpMax !== undefined) {
        where.totalXp.lte = xpMax
      }
    }

    if (lastActiveFrom || lastActiveTo) {
      where.lastActiveAt = {}
      if (lastActiveFrom) {
        where.lastActiveAt.gte = new Date(lastActiveFrom)
      }
      if (lastActiveTo) {
        where.lastActiveAt.lte = new Date(lastActiveTo)
      }
    }

    // Handle status filter
    if (status === 'inactive') {
      where.lastActiveAt = {
        lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
      }
    }

    // Build orderBy clause
    const orderBy: any = {}
    if (sortBy === 'submissions') {
      orderBy._count = { submissions: sortOrder }
    } else if (sortBy === 'reviews') {
      orderBy._count = { peerReviews: sortOrder }
    } else {
      orderBy[sortBy] = sortOrder
    }

    // Get users with related data
    const [users, totalCount] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        include: {
          _count: {
            select: {
              submissions: true,
              peerReviews: true,
              userAchievements: true
            }
          },
          submissions: {
            select: {
              id: true,
              status: true,
              xpAwarded: true,
              createdAt: true
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 5 // Recent submissions
          },
          peerReviews: {
            select: {
              id: true,
              xpScore: true,
              createdAt: true
            },
            orderBy: {
              createdAt: 'desc'
            },
            take: 5 // Recent reviews
          }
        }
      }),
      prisma.user.count({ where })
    ])

    // Calculate additional metrics for each user
    const usersWithMetrics = await Promise.all(
      users.map(async (user) => {
        // Get XP breakdown for current week
        const weekStart = new Date()
        weekStart.setDate(weekStart.getDate() - weekStart.getDay())
        weekStart.setHours(0, 0, 0, 0)

        const weeklyXpTransactions = await prisma.xpTransaction.findMany({
          where: {
            userId: user.id,
            createdAt: {
              gte: weekStart
            }
          }
        })

        const weeklyXp = weeklyXpTransactions.reduce((sum, tx) => sum + tx.amount, 0)

        // Calculate submission success rate
        const completedSubmissions = user.submissions.filter(s => s.status === 'COMPLETED').length
        const submissionSuccessRate = user._count.submissions > 0
          ? (completedSubmissions / user._count.submissions) * 100
          : 0

        // Calculate average review score given
        const avgReviewScore = user.peerReviews.length > 0
          ? user.peerReviews.reduce((sum, review) => sum + (review.xpScore || 0), 0) / user.peerReviews.length
          : 0

        // Determine activity status
        const daysSinceLastActive = user.lastActiveAt
          ? Math.floor((Date.now() - new Date(user.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24))
          : null

        let activityStatus = 'unknown'
        if (daysSinceLastActive !== null) {
          if (daysSinceLastActive <= 7) activityStatus = 'active'
          else if (daysSinceLastActive <= 30) activityStatus = 'recent'
          else activityStatus = 'inactive'
        }

        return {
          ...user,
          metrics: {
            weeklyXp,
            submissionSuccessRate: Math.round(submissionSuccessRate),
            avgReviewScore: Math.round(avgReviewScore * 10) / 10,
            daysSinceLastActive,
            activityStatus,
            totalSubmissions: user._count.submissions,
            totalReviews: user._count.peerReviews,
            totalAchievements: user._count.userAchievements
          }
        }
      })
    )

    // Get summary statistics
    const roleStats = await prisma.user.groupBy({
      by: ['role'],
      _count: true,
      where: Object.keys(where).length > 0 ? where : undefined
    })

    const roleCounts = roleStats.reduce((acc, stat) => {
      acc[stat.role] = stat._count
      return acc
    }, {} as Record<string, number>)

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit)
    const hasNextPage = page < totalPages
    const hasPrevPage = page > 1

    return NextResponse.json({
      users: usersWithMetrics,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage,
        hasPrevPage
      },
      filters: {
        role,
        search,
        xpMin,
        xpMax,
        lastActiveFrom,
        lastActiveTo,
        status
      },
      stats: {
        roleCounts,
        totalUsers: totalCount
      }
    })

  } catch (error) {
    console.error('Error in admin users endpoint:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})

// PATCH endpoint for bulk operations
export const PATCH = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const { action, userIds, data } = await request.json()

    if (!action || !userIds || !Array.isArray(userIds)) {
      return NextResponse.json(
        { message: 'Invalid request. Action and userIds are required.' },
        { status: 400 }
      )
    }

    let result

    switch (action) {
      case 'updateRole':
        if (!data?.role || !['USER', 'REVIEWER', 'ADMIN'].includes(data.role)) {
          return NextResponse.json(
            { message: 'Valid role is required for updateRole action' },
            { status: 400 }
          )
        }

        result = await prisma.user.updateMany({
          where: { id: { in: userIds } },
          data: {
            role: data.role,
            updatedAt: new Date()
          }
        })

        // Create admin action audit for each user
        for (const userId of userIds) {
          await prisma.adminAction.create({
            data: {
              adminId: request.user.id,
              action: 'USER_ROLE_CHANGE',
              targetType: 'user',
              targetId: userId,
              details: {
                newRole: data.role,
                reason: data.reason
              }
            }
          })
        }
        break

      case 'adjustXp':
        if (typeof data?.xpAmount !== 'number') {
          return NextResponse.json(
            { message: 'XP amount is required for adjustXp action' },
            { status: 400 }
          )
        }

        // Update user XP and create transactions
        for (const userId of userIds) {
          await prisma.$transaction([
            // Update user total XP
            prisma.user.update({
              where: { id: userId },
              data: { totalXp: { increment: data.xpAmount } }
            }),
            // Create XP transaction record
            prisma.xpTransaction.create({
              data: {
                userId,
                amount: data.xpAmount,
                type: 'ADMIN_ADJUSTMENT',
                description: `Admin XP adjustment: ${data.reason || 'Manual adjustment'}`,
                weekNumber: Math.ceil(new Date().getDate() / 7)
              }
            }),
            // Create admin action audit
            prisma.adminAction.create({
              data: {
                adminId: request.user.id,
                action: 'XP_OVERRIDE',
                targetType: 'user',
                targetId: userId,
                details: {
                  xpAmount: data.xpAmount,
                  reason: data.reason
                }
              }
            })
          ])
        }

        result = { count: userIds.length }
        break

      default:
        return NextResponse.json(
          { message: 'Invalid action' },
          { status: 400 }
        )
    }

    return NextResponse.json({
      message: `Successfully ${action}d ${result.count} users`,
      count: result.count
    })

  } catch (error) {
    console.error('Error in admin users bulk operation:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})
