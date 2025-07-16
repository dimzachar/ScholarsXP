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
    const status = searchParams.get('status') // 'PENDING', 'RESOLVED', 'DISMISSED'
    const reason = searchParams.get('reason') // 'SPAM', 'INAPPROPRIATE', 'PLAGIARISM', etc.
    const severity = searchParams.get('severity') // 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const sortBy = searchParams.get('sortBy') || 'createdAt'
    const sortOrder = searchParams.get('sortOrder') || 'desc'

    // Build where clause
    const where: any = {}

    if (status) {
      where.status = status
    }

    if (reason) {
      where.reason = reason
    }

    if (severity) {
      where.severity = severity
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

    // Build orderBy clause
    const orderBy: any = {}
    if (sortBy === 'submission') {
      orderBy.submission = { title: sortOrder }
    } else if (sortBy === 'flaggedBy') {
      orderBy.flaggedBy = { username: sortOrder }
    } else {
      orderBy[sortBy] = sortOrder
    }

    // Get content flags with related data
    const [contentFlags, totalCount] = await Promise.all([
      prisma.contentFlag.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        include: {
          submission: {
            select: {
              id: true,
              title: true,
              content: true,
              url: true,
              platform: true,
              taskType: true,
              status: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  email: true
                }
              }
            }
          },
          flaggedBy: {
            select: {
              id: true,
              username: true,
              email: true,
              role: true
            }
          },
          resolvedBy: {
            select: {
              id: true,
              username: true,
              email: true,
              role: true
            }
          }
        }
      }),
      prisma.contentFlag.count({ where })
    ])

    // Get summary statistics
    const stats = await Promise.all([
      prisma.contentFlag.groupBy({
        by: ['status'],
        _count: true,
        where: Object.keys(where).length > 0 ? where : undefined
      }),
      prisma.contentFlag.groupBy({
        by: ['reason'],
        _count: true,
        where: Object.keys(where).length > 0 ? where : undefined
      }),
      prisma.contentFlag.groupBy({
        by: ['severity'],
        _count: true,
        where: Object.keys(where).length > 0 ? where : undefined
      })
    ])

    const statusCounts = stats[0].reduce((acc, stat) => {
      acc[stat.status] = stat._count
      return acc
    }, {} as Record<string, number>)

    const reasonCounts = stats[1].reduce((acc, stat) => {
      acc[stat.reason] = stat._count
      return acc
    }, {} as Record<string, number>)

    const severityCounts = stats[2].reduce((acc, stat) => {
      acc[stat.severity] = stat._count
      return acc
    }, {} as Record<string, number>)

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit)
    const hasNextPage = page < totalPages
    const hasPrevPage = page > 1

    return NextResponse.json({
      contentFlags,
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
        reason,
        severity,
        dateFrom,
        dateTo
      },
      stats: {
        statusCounts,
        reasonCounts,
        severityCounts,
        totalFlags: totalCount,
        pendingFlags: statusCounts.PENDING || 0
      }
    })

  } catch (error) {
    console.error('Error in admin moderation endpoint:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})

// POST endpoint to create content flags
export const POST = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const { submissionId, reason, severity, description } = await request.json()

    if (!submissionId || !reason) {
      return NextResponse.json(
        { message: 'Submission ID and reason are required' },
        { status: 400 }
      )
    }

    // Check if submission exists
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId }
    })

    if (!submission) {
      return NextResponse.json(
        { message: 'Submission not found' },
        { status: 404 }
      )
    }

    // Check if user already flagged this submission
    const existingFlag = await prisma.contentFlag.findFirst({
      where: {
        submissionId,
        flaggedById: request.user.id
      }
    })

    if (existingFlag) {
      return NextResponse.json(
        { message: 'You have already flagged this submission' },
        { status: 400 }
      )
    }

    // Create content flag
    const contentFlag = await prisma.contentFlag.create({
      data: {
        submissionId,
        flaggedById: request.user.id,
        reason,
        severity: severity || 'MEDIUM',
        description,
        status: 'PENDING'
      },
      include: {
        submission: {
          select: {
            title: true,
            user: {
              select: {
                username: true
              }
            }
          }
        },
        flaggedBy: {
          select: {
            username: true
          }
        }
      }
    })

    // Update submission flag count
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        flagCount: { increment: 1 }
      }
    })

    return NextResponse.json({
      message: 'Content flagged successfully',
      contentFlag
    })

  } catch (error) {
    console.error('Error creating content flag:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})

// PATCH endpoint for moderation actions
export const PATCH = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const { action, flagIds, data } = await request.json()

    if (!action || !flagIds || !Array.isArray(flagIds)) {
      return NextResponse.json(
        { message: 'Invalid request. Action and flagIds are required.' },
        { status: 400 }
      )
    }

    let result

    switch (action) {
      case 'resolve':
        if (!data?.resolution) {
          return NextResponse.json(
            { message: 'Resolution is required for resolve action' },
            { status: 400 }
          )
        }

        // Update flags and create admin actions
        for (const flagId of flagIds) {
          const flag = await prisma.contentFlag.findUnique({
            where: { id: flagId },
            include: { submission: true }
          })

          if (flag) {
            await prisma.$transaction([
              // Update flag status
              prisma.contentFlag.update({
                where: { id: flagId },
                data: {
                  status: 'RESOLVED',
                  resolvedById: request.user.id,
                  resolvedAt: new Date(),
                  resolution: data.resolution,
                  adminNotes: data.adminNotes
                }
              }),
              // Create admin action audit
              prisma.adminAction.create({
                data: {
                  adminId: request.user.id,
                  action: 'FLAG_RESOLVE',
                  targetType: 'content_flag',
                  targetId: flagId,
                  details: {
                    resolution: data.resolution,
                    adminNotes: data.adminNotes,
                    submissionId: flag.submissionId
                  }
                }
              })
            ])

            // If resolution involves content removal, update submission
            if (data.resolution === 'CONTENT_REMOVED') {
              await prisma.submission.update({
                where: { id: flag.submissionId },
                data: { status: 'REJECTED' }
              })
            }
          }
        }

        result = { count: flagIds.length }
        break

      case 'dismiss':
        // Dismiss flags as false positives
        for (const flagId of flagIds) {
          await prisma.$transaction([
            // Update flag status
            prisma.contentFlag.update({
              where: { id: flagId },
              data: {
                status: 'DISMISSED',
                resolvedById: request.user.id,
                resolvedAt: new Date(),
                resolution: 'FALSE_POSITIVE',
                adminNotes: data.adminNotes
              }
            }),
            // Create admin action audit
            prisma.adminAction.create({
              data: {
                adminId: request.user.id,
                action: 'FLAG_DISMISS',
                targetType: 'content_flag',
                targetId: flagId,
                details: {
                  adminNotes: data.adminNotes
                }
              }
            })
          ])
        }

        result = { count: flagIds.length }
        break

      case 'updateSeverity':
        if (!data?.severity) {
          return NextResponse.json(
            { message: 'Severity is required for updateSeverity action' },
            { status: 400 }
          )
        }

        result = await prisma.contentFlag.updateMany({
          where: { id: { in: flagIds } },
          data: { severity: data.severity }
        })
        break

      default:
        return NextResponse.json(
          { message: 'Invalid action' },
          { status: 400 }
        )
    }

    return NextResponse.json({
      message: `Successfully ${action}d ${result.count} flags`,
      count: result.count
    })

  } catch (error) {
    console.error('Error in moderation action:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})
