import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'

export const GET = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url)

    // Pagination parameters
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    // Filter parameters
    const status = searchParams.get('status') // 'PENDING', 'AI_REVIEWED', 'PEER_REVIEW', 'COMPLETED', 'REJECTED'
    const platform = searchParams.get('platform') // 'TWITTER', 'LINKEDIN', 'MEDIUM', etc.
    const taskType = searchParams.get('taskType') // 'A', 'B', 'C', 'D', 'E', 'F'
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const search = searchParams.get('search') // Full-text search
    const sortBy = searchParams.get('sortBy') || 'createdAt'
    const sortOrder = searchParams.get('sortOrder') || 'desc'
    const flagged = searchParams.get('flagged') // 'true' to show only flagged content

    // Build where clause
    const where: any = {}

    if (status) {
      where.status = status
    }

    if (platform) {
      where.platform = platform
    }

    if (taskType) {
      where.taskType = taskType
    }

    if (dateFrom || dateTo) {
      where.createdAt = {}
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom)
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo)
      }
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
        { url: { contains: search, mode: 'insensitive' } },
        { user: { username: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } }
      ]
    }

    if (flagged === 'true') {
      where.flagCount = { gt: 0 }
    }

    // Build orderBy clause
    const orderBy: any = {}
    if (sortBy === 'user') {
      orderBy.user = { username: sortOrder }
    } else if (sortBy === 'xpAwarded') {
      orderBy.xpAwarded = sortOrder
    } else {
      orderBy[sortBy] = sortOrder
    }

    // Get submissions with related data
    const [submissions, totalCount] = await Promise.all([
      prisma.submission.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              role: true,
              totalXp: true
            }
          },
          peerReviews: {
            include: {
              reviewer: {
                select: {
                  id: true,
                  username: true
                }
              }
            }
          },
          reviewAssignments: {
            include: {
              reviewer: {
                select: {
                  id: true,
                  username: true
                }
              }
            }
          },
          _count: {
            select: {
              peerReviews: true
            }
          }
        }
      }),
      prisma.submission.count({ where })
    ])

    // Calculate additional metrics
    const submissionsWithMetrics = submissions.map(submission => {
      const avgPeerScore = submission.peerReviews.length > 0
        ? submission.peerReviews.reduce((sum, review) => sum + (review.xpScore || 0), 0) / submission.peerReviews.length
        : null

      const reviewProgress = {
        assigned: submission.reviewAssignments?.length || 0,
        completed: submission.peerReviews.length,
        pending: (submission.reviewAssignments?.length || 0) - submission.peerReviews.length
      }

      return {
        ...submission,
        // Transform fields to match frontend expectations
        title: `${submission.platform} submission`, // Generate a title since we don't store one
        content: `Submission from ${submission.url}`, // Generate content preview
        taskType: submission.taskTypes?.[0] || 'Unknown', // Use first task type (for admin submissions page)
        taskTypes: submission.taskTypes, // Keep original for admin dashboard
        xpAwarded: submission.finalXp || submission.aiXp || 0, // Use finalXp or fallback to aiXp
        peerXp: avgPeerScore ? Math.round(avgPeerScore * 10) : null, // Calculate peer XP from average score
        metrics: {
          avgPeerScore,
          reviewProgress,
          reviewCount: submission._count.peerReviews
        }
      }
    })

    // Get summary statistics
    const stats = await prisma.submission.groupBy({
      by: ['status'],
      _count: true,
      where: Object.keys(where).length > 0 ? where : undefined
    })

    const statusCounts = stats.reduce((acc, stat) => {
      acc[stat.status] = stat._count
      return acc
    }, {} as Record<string, number>)

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit)
    const hasNextPage = page < totalPages
    const hasPrevPage = page > 1

    return NextResponse.json({
      submissions: submissionsWithMetrics,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage,
        hasPrevPage
      },
      filters: {
        status,
        platform,
        taskType,
        dateFrom,
        dateTo,
        search,
        flagged
      },
      stats: {
        statusCounts,
        totalSubmissions: totalCount
      }
    })

  } catch (error) {
    console.error('Error fetching admin submissions:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})

export const PATCH = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const body = await request.json()

    // Support both single submission updates and bulk operations
    if (body.submissionId) {
      // Single submission update (legacy support)
      const { submissionId, status, finalXp } = body

      const updateData: any = {}

      if (status) {
        updateData.status = status
      }

      if (finalXp !== undefined) {
        updateData.finalXp = finalXp

        // If setting final XP, also update user's XP
        const submission = await prisma.submission.findUnique({
          where: { id: submissionId },
          select: { userId: true, finalXp: true }
        })

        if (submission) {
          const xpDifference = finalXp - (submission.finalXp || 0)

          await prisma.user.update({
            where: { id: submission.userId },
            data: {
              totalXp: { increment: xpDifference },
              currentWeekXp: { increment: xpDifference }
            }
          })
        }
      }

      const updatedSubmission = await prisma.submission.update({
        where: { id: submissionId },
        data: updateData,
        include: {
          user: {
            select: {
              username: true
            }
          }
        }
      })

      return NextResponse.json({
        message: 'Submission updated successfully',
        submission: updatedSubmission
      })
    } else {
      // Bulk operations
      const { action, submissionIds, data } = body

      if (!action || !submissionIds || !Array.isArray(submissionIds)) {
        return NextResponse.json(
          { message: 'Invalid request. Action and submissionIds are required for bulk operations.' },
          { status: 400 }
        )
      }

      let result

      switch (action) {
        case 'updateStatus':
          if (!data?.status) {
            return NextResponse.json(
              { message: 'Status is required for updateStatus action' },
              { status: 400 }
            )
          }

          result = await prisma.submission.updateMany({
            where: { id: { in: submissionIds } },
            data: {
              status: data.status,
              updatedAt: new Date()
            }
          })
          break

        case 'updateXp':
          if (typeof data?.xpAwarded !== 'number') {
            return NextResponse.json(
              { message: 'XP amount is required for updateXp action' },
              { status: 400 }
            )
          }

          // Update submissions and create XP transactions
          const submissions = await prisma.submission.findMany({
            where: { id: { in: submissionIds } },
            include: { user: true }
          })

          for (const submission of submissions) {
            const xpDifference = data.xpAwarded - (submission.xpAwarded || 0)

            await prisma.$transaction([
              // Update submission XP
              prisma.submission.update({
                where: { id: submission.id },
                data: { xpAwarded: data.xpAwarded }
              }),
              // Update user total XP
              prisma.user.update({
                where: { id: submission.userId },
                data: { totalXp: { increment: xpDifference } }
              }),
              // Create XP transaction record
              prisma.xpTransaction.create({
                data: {
                  userId: submission.userId,
                  amount: xpDifference,
                  type: 'ADMIN_ADJUSTMENT',
                  sourceId: submission.id,
                  description: `Admin XP adjustment: ${data.reason || 'Manual adjustment'}`,
                  weekNumber: Math.ceil(new Date().getDate() / 7)
                }
              })
            ])
          }

          result = { count: submissions.length }
          break

        case 'delete':
          result = await prisma.submission.deleteMany({
            where: { id: { in: submissionIds } }
          })
          break

        default:
          return NextResponse.json(
            { message: 'Invalid action' },
            { status: 400 }
          )
      }

      return NextResponse.json({
        message: `Successfully ${action}d ${result.count} submissions`,
        count: result.count
      })
    }

  } catch (error) {
    console.error('Error updating submission:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})

