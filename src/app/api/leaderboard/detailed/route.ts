import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { withPublicOptimization } from '@/middleware/api-optimization'
import { getOptimizedLeaderboardDetailed } from '@/lib/queries/leaderboard-optimized'
import { parsePaginationParams } from '@/lib/pagination'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { getWeekNumber } from '@/lib/utils'

// Optimized leaderboard detailed handler with compression
const optimizedLeaderboardHandler = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url)

    // Check if user has permission to view detailed leaderboard
    if (request.userProfile.role !== 'ADMIN' && request.userProfile.role !== 'REVIEWER') {
      return NextResponse.json(
        { message: 'Access denied. Detailed leaderboard is only available to admins and reviewers.' },
        { status: 403 }
      )
    }

    // Use new optimized implementation
    const useOptimizedLeaderboard = process.env.USE_OPTIMIZED_LEADERBOARD !== 'false' // Default to true

    if (useOptimizedLeaderboard) {
      console.log('🚀 Using optimized leaderboard detailed implementation')
      const startTime = Date.now()

      // Parse pagination parameters
      const pagination = parsePaginationParams(searchParams)

      // Parse filters
      const filters = {
        week: searchParams.get('week'),
        user: searchParams.get('user'),
        taskType: searchParams.get('taskType'),
        platform: searchParams.get('platform'),
        minXp: searchParams.get('minXp'),
        maxXp: searchParams.get('maxXp'),
        status: searchParams.get('status')
      }

      const refreshCache = ['true', '1'].includes(searchParams.get('refreshCache') ?? '')
      const skipCache = ['true', '1'].includes(searchParams.get('skipCache') ?? '')

      const leaderboardData = await getOptimizedLeaderboardDetailed(filters, pagination, {
        refreshCache,
        skipCache
      })

      const executionTime = Date.now() - startTime
      console.log(`⚡ Optimized leaderboard detailed completed in ${executionTime}ms`)

      return NextResponse.json(leaderboardData, {
        headers: {
          'Cache-Control': 'public, max-age=120, stale-while-revalidate=300',
          'X-Cache': 'OPTIMIZED',
          'X-Execution-Time': executionTime.toString(),
          'X-Performance-Gain': 'optimized_leaderboard'
        }
      })
    }

    // Fall back to existing implementation
    console.log('🔄 Using legacy leaderboard detailed implementation')
    // Continue with existing logic...
  } catch (error) {
    console.error('Leaderboard detailed API error:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})

// Apply comprehensive optimization middleware
export const GET = withPublicOptimization(optimizedLeaderboardHandler)

// Keep original handler as fallback
const originalHandler = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    
    // Check if user has permission to view detailed leaderboard
    if (request.userProfile.role !== 'ADMIN' && request.userProfile.role !== 'REVIEWER') {
      return NextResponse.json(
        { message: 'Access denied. Detailed leaderboard is only available to admins and reviewers.' },
        { status: 403 }
      )
    }

    // Parse filters
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit



    const filters = {
      week: searchParams.get('week'),
      user: searchParams.get('user'),
      taskType: searchParams.get('taskType'),
      platform: searchParams.get('platform'),
      minXp: searchParams.get('minXp'),
      maxXp: searchParams.get('maxXp'),
      status: searchParams.get('status'),
      limit,
      offset
    }

    // Build where clause
    const whereClause: any = {}

    if (filters.week) {
      whereClause.weekNumber = parseInt(filters.week)
    }

    if (filters.user) {
      whereClause.user = {
        username: {
          contains: filters.user,
          mode: 'insensitive'
        }
      }
    }

    if (filters.taskType) {
      whereClause.taskTypes = {
        has: filters.taskType
      }
    }

    if (filters.platform) {
      whereClause.platform = {
        equals: filters.platform,
        mode: 'insensitive'
      }
    }

    if (filters.status) {
      whereClause.status = filters.status
    }

    // XP filtering (using finalXp if available, otherwise aiXp)
    if (filters.minXp || filters.maxXp) {
      const xpFilter: any = {}
      if (filters.minXp) {
        xpFilter.gte = parseInt(filters.minXp)
      }
      if (filters.maxXp) {
        xpFilter.lte = parseInt(filters.maxXp)
      }
      
      whereClause.OR = [
        { finalXp: xpFilter },
        { 
          AND: [
            { finalXp: null },
            { aiXp: xpFilter }
          ]
        }
      ]
    }

    // Fetch both regular submissions and legacy submissions
    const [regularSubmissions, regularCount] = await Promise.all([
      prisma.submission.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              username: true,
              email: true,
              role: true
            }
          },
          peerReviews: {
            include: {
              reviewer: {
                select: {
                  username: true,
                  email: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            }
          },
          reviewAssignments: {
            include: {
              reviewer: {
                select: {
                  username: true,
                  email: true
                }
              }
            }
          }
        },
        orderBy: [
          { finalXp: 'desc' },
          { aiXp: 'desc' },
          { createdAt: 'desc' }
        ],
        take: filters.limit,
        skip: filters.offset
      }),
      prisma.submission.count({ where: whereClause })
    ])

    // Build where clause for legacy submissions
    const legacyWhereClause: any = {}

    if (filters.user) {
      legacyWhereClause.discordHandle = {
        contains: filters.user,
        mode: 'insensitive'
      }
    }

    if (filters.minXp || filters.maxXp) {
      const minXp = filters.minXp ? parseInt(filters.minXp) : undefined
      const maxXp = filters.maxXp ? parseInt(filters.maxXp) : undefined

      if (minXp !== undefined || maxXp !== undefined) {
        legacyWhereClause.OR = [
          {
            finalXp: {
              ...(minXp !== undefined && { gte: minXp }),
              ...(maxXp !== undefined && { lte: maxXp })
            }
          },
          {
            AND: [
              { finalXp: null },
              {
                aiXp: {
                  ...(minXp !== undefined && { gte: minXp }),
                  ...(maxXp !== undefined && { lte: maxXp })
                }
              }
            ]
          }
        ]
      }
    }

    // Since we have very few regular submissions, focus on legacy submissions for pagination
    const regularSubmissionCount = regularSubmissions.length

    // Fetch legacy submissions with proper pagination and user data
    const legacySubmissionsRaw = await prisma.$queryRaw`
      SELECT
        ls.id, ls.url, ls."discordHandle", ls."submittedAt", ls.role, ls.notes, ls."importedAt",
        ls."aiXp", ls."peerXp", ls."finalXp",
        u.id as "userId", u.username, u.email, u.role as "userRole", u."totalXp"
      FROM "LegacySubmission" ls
      LEFT JOIN "User" u ON u."discordHandle" = ls."discordHandle" AND u.email LIKE '%@legacy.import'
      ORDER BY ls."finalXp" DESC NULLS LAST, ls."aiXp" DESC NULLS LAST, ls."submittedAt" DESC NULLS LAST
      LIMIT ${filters.limit} OFFSET ${filters.offset}
    ` as any[]

    const legacyCount = await prisma.legacySubmission.count({ where: legacyWhereClause })

    // Convert legacy submissions to submission format with user data
    const convertedLegacy = legacySubmissionsRaw.map(legacy => {
      // Calculate correct week number from submission timestamp
      const submissionDate = legacy.submittedAt || legacy.importedAt
      const weekNumber = submissionDate ? getWeekNumber(new Date(submissionDate)) : 1

      return {
        id: legacy.id,
        title: 'Legacy Submission',
        url: legacy.url,
        platform: 'LEGACY',
        taskTypes: ['LEGACY'],
        status: 'LEGACY_IMPORTED',
        aiXp: legacy.aiXp || 0,
        peerXp: legacy.peerXp,
        finalXp: legacy.finalXp || legacy.aiXp || 0, // Use finalXp if available, fallback to aiXp
        originalityScore: null,
        consensusScore: null,
        reviewCount: 0,
        createdAt: submissionDate,
        weekNumber: weekNumber,
        user: {
          id: legacy.userId || 'legacy-user',
          username: legacy.username || legacy.discordHandle || 'Legacy User',
          email: legacy.email || 'legacy@import.data',
          role: legacy.userRole || legacy.role || 'USER',
          totalXp: legacy.totalXp || 0
        },
        peerReviews: [],
        reviewAssignments: []
      }
    })

    // Combine regular and legacy submissions (prioritize regular submissions)
    const submissions = [...regularSubmissions, ...convertedLegacy]

    // Calculate stats from FILTERED submissions (not all submissions)
    // Get all filtered submissions for statistics calculation (without pagination)
    const [allFilteredRegularSubmissions, allFilteredLegacySubmissions] = await Promise.all([
      prisma.submission.findMany({
        where: whereClause,
        select: {
          finalXp: true,
          aiXp: true,
          user: {
            select: {
              username: true
            }
          }
        }
      }),
      prisma.legacySubmission.findMany({
        where: legacyWhereClause,
        select: {
          finalXp: true,
          aiXp: true,
          discordHandle: true
        }
      })
    ])

    // Convert all filtered legacy submissions for stats calculation
    const allFilteredConvertedLegacy = allFilteredLegacySubmissions.map(legacy => ({
      finalXp: legacy.finalXp || legacy.aiXp || 0,
      aiXp: legacy.aiXp || 0,
      user: {
        username: legacy.discordHandle || 'Legacy User'
      }
    }))

    // Combine all filtered submissions for statistics
    const allFilteredSubmissions = [...allFilteredRegularSubmissions, ...allFilteredConvertedLegacy]
    const filteredSubmissionsWithXp = allFilteredSubmissions.filter(s => {
      const xpValue = s.finalXp || s.aiXp || 0
      return xpValue > 0
    })

    // Calculate correct total count for pagination
    // Use the length of allFilteredSubmissions which represents the total count for the current query
    // This works for both filtered and unfiltered cases because:
    // - For filtered cases: allFilteredSubmissions contains only the filtered results
    // - For unfiltered cases: allFilteredSubmissions contains all submissions
    const totalFilteredSubmissions = allFilteredSubmissions.length
    const averageXp = filteredSubmissionsWithXp.length > 0
      ? filteredSubmissionsWithXp.reduce((sum, s) => sum + (s.finalXp || s.aiXp || 0), 0) / filteredSubmissionsWithXp.length
      : 0

    // Find top performer from filtered data
    const topPerformerSubmission = filteredSubmissionsWithXp.length > 0
      ? filteredSubmissionsWithXp.reduce((max, current) => {
          const currentXp = current.finalXp || current.aiXp || 0
          const maxXp = max.finalXp || max.aiXp || 0
          return currentXp > maxXp ? current : max
        })
      : null

    // Create weekly stats object to match expected format (using filtered data)
    const weeklyStats = {
      _count: { id: totalFilteredSubmissions },
      _avg: { finalXp: averageXp }
    }

    // Create top performer object to match expected format
    const topPerformer = topPerformerSubmission ? {
      finalXp: topPerformerSubmission.finalXp || topPerformerSubmission.aiXp || 0,
      user: {
        username: topPerformerSubmission.user.username
      }
    } : null

    // Get reviewer contributions if user is admin
    let reviewerContributions = null
    if (request.userProfile.role === 'ADMIN') {
      const reviewers = await prisma.user.findMany({
        where: {
          role: 'REVIEWER'
        },
        include: {
          peerReviews: {
            where: filters.week ? {
              submission: {
                weekNumber: parseInt(filters.week)
              }
            } : {},
            include: {
              submission: {
                select: {
                  title: true,
                  weekNumber: true
                }
              }
            },
            orderBy: {
              createdAt: 'desc'
            }
          }
        }
      })

      reviewerContributions = reviewers
        .filter(reviewer => reviewer.peerReviews.length > 0)
        .map(reviewer => {
          const reviews = reviewer.peerReviews
          const totalReviews = reviews.length
          const averageScore = reviews.reduce((sum, r) => sum + r.xpScore, 0) / totalReviews
          const onTimeReviews = reviews.filter(r => !r.isLate).length
          const onTimeRate = (onTimeReviews / totalReviews) * 100
          
          const averageTimeSpent = reviews.filter(r => r.timeSpent).length > 0
            ? reviews.filter(r => r.timeSpent).reduce((sum, r) => sum + (r.timeSpent || 0), 0) / reviews.filter(r => r.timeSpent).length
            : null

          const averageQuality = reviews.filter(r => r.qualityRating).length > 0
            ? reviews.filter(r => r.qualityRating).reduce((sum, r) => sum + (r.qualityRating || 0), 0) / reviews.filter(r => r.qualityRating).length
            : null

          // Calculate contribution score (0-100)
          let contributionScore = 0
          contributionScore += Math.min(totalReviews * 5, 30) // Up to 30 points for volume
          contributionScore += (averageScore / 100) * 40 // Up to 40 points for quality
          contributionScore += (onTimeRate / 100) * 20 // Up to 20 points for timeliness
          contributionScore += averageQuality ? (averageQuality / 5) * 10 : 0 // Up to 10 points for review quality

          return {
            reviewerId: reviewer.id,
            reviewer: {
              username: reviewer.username,
              email: reviewer.email,
              role: reviewer.role
            },
            totalReviews,
            averageScore: Math.round(averageScore * 10) / 10,
            averageTimeSpent,
            averageQuality,
            onTimeRate: Math.round(onTimeRate * 10) / 10,
            contributionScore: Math.round(contributionScore),
            recentReviews: reviews.slice(0, 5).map(review => ({
              submissionId: review.submissionId,
              submissionTitle: review.submission.title,
              xpScore: review.xpScore,
              timeSpent: review.timeSpent,
              qualityRating: review.qualityRating,
              isLate: review.isLate,
              createdAt: review.createdAt.toISOString()
            }))
          }
        })
        .sort((a, b) => b.contributionScore - a.contributionScore)
    }

    // Transform submissions for response
    const transformedSubmissions = submissions.map(submission => ({
      id: submission.id,
      title: submission.title || 'Untitled Submission',
      url: submission.url,
      platform: submission.platform,
      taskTypes: submission.taskTypes,
      status: submission.status,
      aiXp: submission.aiXp,
      peerXp: submission.peerXp,
      finalXp: submission.finalXp,
      originalityScore: submission.originalityScore,
      consensusScore: submission.consensusScore,
      reviewCount: submission.reviewCount,
      createdAt: submission.createdAt.toISOString(),
      weekNumber: submission.weekNumber,
      user: {
        username: submission.user.username,
        email: submission.user.email,
        role: submission.user.role
      },
      peerReviews: submission.peerReviews.map(review => ({
        reviewerId: review.reviewerId,
        xpScore: review.xpScore,
        reviewer: {
          username: review.reviewer.username
        }
      }))
    }))

    const response = {
      submissions: transformedSubmissions,
      totalCount: totalFilteredSubmissions,
      pagination: {
        page,
        limit: filters.limit,
        totalCount: totalFilteredSubmissions,
        totalPages: Math.ceil(totalFilteredSubmissions / filters.limit),
        hasNextPage: page < Math.ceil(totalFilteredSubmissions / filters.limit),
        hasPrevPage: page > 1
      },
      weeklyStats: {
        totalSubmissions: weeklyStats._count.id,
        averageXp: Math.round((weeklyStats._avg.finalXp || 0) * 10) / 10,
        topPerformer: topPerformer?.user.username || 'N/A',
        weekNumber: weekToAnalyze
      },
      filters: {
        applied: Object.entries(filters).filter(([_, value]) => value !== null && value !== '').length,
        week: filters.week,
        user: filters.user,
        taskType: filters.taskType,
        platform: filters.platform
      }
    }

    // Add reviewer contributions for admins
    if (reviewerContributions) {
      (response as any).reviewerContributions = reviewerContributions
    }



    return NextResponse.json(response)

  } catch (error) {
    console.error('Error fetching detailed leaderboard:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})
