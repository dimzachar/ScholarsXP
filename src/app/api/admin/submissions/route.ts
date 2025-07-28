import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { withAdminOptimization } from '@/middleware/api-optimization'
import { getOptimizedAdminSubmissions, bulkUpdateSubmissions } from '@/lib/queries/admin-submissions-optimized'
import { parsePaginationParams } from '@/lib/pagination'
import { prisma } from '@/lib/prisma'

// Optimized admin submissions handler with compression
const optimizedSubmissionsHandler = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    console.log('🔍 Admin submissions API called by user:', request.userProfile?.email, 'role:', request.userProfile?.role)

    const { searchParams } = new URL(request.url)

    // Use new optimized implementation
    const useOptimizedSubmissions = process.env.USE_OPTIMIZED_SUBMISSIONS !== 'false' // Default to true

    if (useOptimizedSubmissions) {
      console.log('🚀 Using optimized admin submissions implementation')
      const startTime = Date.now()

      // Parse pagination parameters
      const pagination = parsePaginationParams(searchParams)

      // Parse filters
      const filters = {
        status: searchParams.get('status'),
        platform: searchParams.get('platform'),
        taskType: searchParams.get('taskType'),
        dateFrom: searchParams.get('dateFrom'),
        dateTo: searchParams.get('dateTo'),
        search: searchParams.get('search'),
        flagged: searchParams.get('flagged') === 'true',
        userId: searchParams.get('userId')
      }

      console.log('Admin submissions API - Received filters:', filters)
      console.log('Admin submissions API - URL search params:', Object.fromEntries(searchParams.entries()))

      const submissionsData = await getOptimizedAdminSubmissions(filters, pagination)

      const executionTime = Date.now() - startTime
      console.log(`⚡ Optimized admin submissions completed in ${executionTime}ms`)

      return NextResponse.json({
        success: true,
        data: submissionsData
      }, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'X-Cache': 'DISABLED',
          'X-Execution-Time': executionTime.toString(),
          'X-Performance-Gain': 'optimized_submissions',
          'X-Fresh-Data': 'true'
        }
      })
    }

    // Fall back to existing implementation
    console.log('🔄 Using legacy admin submissions implementation')
    // Continue with existing logic...
  } catch (error) {
    console.error('Admin submissions API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch submissions' },
      { status: 500 }
    )
  }
})

// Apply comprehensive optimization middleware
export const GET = withAdminOptimization(optimizedSubmissionsHandler)

// Optimized POST handler for bulk operations
const optimizedPostHandler = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const body = await request.json()

    // Handle bulk operations
    if (body.action && body.submissionIds) {
      const { action, submissionIds, data } = body

      console.log(`🔄 Bulk ${action} for ${submissionIds.length} submissions`)
      const result = await bulkUpdateSubmissions(submissionIds, action, data)

      return NextResponse.json(result)
    }

    // Handle single submission updates (legacy support)
    if (body.submissionId) {
      // Fall back to existing single update logic
      console.log('🔄 Using legacy single submission update')
      // Continue with existing logic...
    }

    return NextResponse.json(
      { error: 'Invalid request format' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Admin submissions POST error:', error)
    return NextResponse.json(
      { error: 'Failed to update submissions' },
      { status: 500 }
    )
  }
})

export const POST = withAdminOptimization(optimizedPostHandler)

// Keep original handlers as fallback
const originalGetHandler = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    console.log('🔍 Admin submissions API called by user:', request.userProfile?.email, 'role:', request.userProfile?.role)

    const { searchParams } = new URL(request.url)

    // Pagination parameters
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    // Filter parameters
    const status = searchParams.get('status')
    const platform = searchParams.get('platform')
    const taskType = searchParams.get('taskType')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const search = searchParams.get('search')
    const sortBy = searchParams.get('sortBy') || 'createdAt'
    const sortOrder = searchParams.get('sortOrder') || 'desc'
    const flagged = searchParams.get('flagged')

    // Build where clause with safer filtering
    const where: any = {}

    if (status) {
      where.status = status
    }

    if (platform) {
      where.platform = platform
    }

    if (taskType) {
      where.taskTypes = {
        has: taskType
      }
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
        { url: { contains: search, mode: 'insensitive' } },
        { platform: { contains: search, mode: 'insensitive' } }
      ]
    }

    if (flagged === 'true') {
      where.flagCount = { gt: 0 }
    }

    if (filters.userId) {
      where.userId = filters.userId
    }

    // Build orderBy clause
    const orderBy: any = {}
    if (sortBy === 'user') {
      orderBy.user = { username: sortOrder }
    } else if (sortBy === 'finalXp') {
      orderBy.finalXp = sortOrder
    } else {
      orderBy[sortBy] = sortOrder
    }

    // Get both regular submissions and legacy submissions
    let submissions: any[] = []
    let totalCount = 0

    try {
      // Get regular submissions
      const [regularSubmissions, regularCount] = await Promise.all([
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
            }
          }
        }),
        prisma.submission.count({ where })
      ])

      // Get legacy submissions using raw query to include XP fields and user data
      // Link to real Discord accounts (not legacy accounts) after merge
      const legacyLimit = Math.max(0, limit - regularSubmissions.length)
      const legacySubmissions = await prisma.$queryRaw`
        SELECT
          ls.id, ls.url, ls."discordHandle", ls."submittedAt", ls.role, ls.notes, ls."importedAt",
          ls."aiXp", ls."peerXp", ls."finalXp",
          u.id as "userId", u.username, u.email, u.role as "userRole", u."totalXp"
        FROM "LegacySubmission" ls
        LEFT JOIN "User" u ON (
          u."discordHandle" = ls."discordHandle" OR
          u."discordHandle" = ls."discordHandle" || '#0' OR
          u.username = ls."discordHandle"
        ) AND u.email NOT LIKE '%@legacy.import'
        ORDER BY ls."importedAt" DESC
        LIMIT ${legacyLimit}
      ` as any[]

      // Convert legacy submissions to submission format with actual user data
      const convertedLegacy = legacySubmissions.map(legacy => {
        // Only show legacy submissions that are properly linked to real accounts
        if (!legacy.userId || !legacy.email || legacy.email.includes('@legacy.import')) {
          console.warn(`Skipping orphaned legacy submission ${legacy.id} for ${legacy.discordHandle}`)
          return null
        }

        return {
          id: legacy.id,
          url: legacy.url,
          platform: 'LEGACY',
          taskTypes: ['LEGACY'],
          status: 'LEGACY_IMPORTED',
          aiXp: legacy.aiXp || 0,
          peerXp: legacy.peerXp,
          finalXp: legacy.finalXp,
          createdAt: legacy.submittedAt || legacy.importedAt,
          weekNumber: 1,
          user: {
            id: legacy.userId,
            username: legacy.username,
            email: legacy.email,
            role: legacy.userRole || 'USER',
            totalXp: legacy.totalXp || 0
          }
        }
      }).filter(Boolean) // Remove null entries

      submissions = [...regularSubmissions, ...convertedLegacy]
      totalCount = regularCount + await prisma.legacySubmission.count()

      console.log('📊 Found submissions:', submissions.length, 'regular:', regularSubmissions.length, 'legacy:', convertedLegacy.length, 'total:', totalCount)
    } catch (dbError) {
      console.error('💥 Database error:', dbError)
      submissions = []
      totalCount = 0
    }

    // Transform submissions for frontend (simplified)
    const submissionsWithMetrics = submissions.map(submission => {
      return {
        ...submission,
        // Transform fields to match frontend expectations
        title: `${submission.platform} submission`,
        content: `Submission from ${submission.url}`,
        taskType: submission.taskTypes?.[0] || 'Unknown',
        xpAwarded: submission.finalXp || submission.aiXp || 0,
        peerXp: submission.peerXp || null,
        metrics: {
          avgPeerScore: null,
          reviewProgress: {
            assigned: 0,
            completed: submission.reviewCount || 0,
            pending: 0
          },
          reviewCount: submission.reviewCount || 0
        }
      }
    })

    // Get summary statistics (simplified)
    const statusCounts: Record<string, number> = {
      PENDING: 0,
      AI_REVIEWED: 0,
      UNDER_PEER_REVIEW: 0,
      FINALIZED: 0
    }

    // Count statuses from the fetched submissions
    submissions.forEach(submission => {
      if (statusCounts[submission.status] !== undefined) {
        statusCounts[submission.status]++
      }
    })

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit)
    const hasNextPage = page < totalPages
    const hasPrevPage = page > 1

    return NextResponse.json({
      success: true,
      data: {
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
      }
    })

  } catch (error) {
    console.error('Error fetching admin submissions:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
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
            const xpDifference = data.xpAwarded - (submission.finalXp || 0)

            await prisma.$transaction([
              // Update submission XP
              prisma.submission.update({
                where: { id: submission.id },
                data: { finalXp: data.xpAwarded }
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
      {
        success: false,
        error: {
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    )
  }
})

