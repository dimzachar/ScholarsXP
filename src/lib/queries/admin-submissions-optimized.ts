import { prisma } from '@/lib/prisma'
import { QueryCache, CacheTTL, withQueryCache } from '../cache/query-cache'
import { PaginationParams, PaginationHelper } from '../pagination'
import { AdminSubmissionsResponseDTO, AdminSubmissionDTO, ResponseTransformer } from '@/types/api-responses'
import { getWeekNumber } from '@/lib/utils'

/**
 * TypeScript interface for legacy submissions with user data
 * Replaces 'as any[]' for better type safety
 */
interface LegacySubmissionWithUser {
  id: string
  url: string
  discordHandle: string | null
  submittedAt: Date | null
  role: string | null
  notes: string | null
  importedAt: Date
  aiXp: number | null
  peerXp: number | null
  finalXp: number | null
  userId: string | null
  username: string | null
  email: string | null
  userRole: string | null
  totalXp: number | null
}

/**
 * Optimized admin submissions query
 * Target: 6.1s → 1.5s (75% improvement)
 * Reduces N+1 problems and optimizes database queries with proper indexing
 */
export async function getOptimizedAdminSubmissions(
  filters: {
    status?: string
    platform?: string
    taskType?: string
    dateFrom?: string
    dateTo?: string
    search?: string
    flagged?: boolean
    userId?: string
  },
  pagination: PaginationParams,
  opts: { skipCache?: boolean } = {}
): Promise<AdminSubmissionsResponseDTO> {
  const cacheKey = QueryCache.createKey('admin_submissions', { ...filters, ...pagination })
  console.log('Admin submissions query - filters:', filters)

  return await withQueryCache(
    cacheKey,
    CacheTTL.SUBMISSIONS_LIST,
    async () => {
      const startTime = Date.now()
      
      // Build optimized query using pagination helper
      const cleanedFilters = cleanFilters(filters)
      console.log('Cleaned filters:', cleanedFilters)

      const queryParams = {
        ...pagination,
        filters: cleanedFilters
      }

      const query = PaginationHelper.createSubmissionQuery(queryParams)
      console.log('Generated query where clause:', JSON.stringify(query.where, null, 2))
      
      // Get submissions and count in parallel for better performance
      const [regularSubmissions, regularCount, legacySubmissions, legacyCount, stats] = await Promise.all([
        getOptimizedSubmissions(query),
        getSubmissionCount(query.where || {}),
        getOptimizedLegacySubmissions(query, cleanedFilters),
        getLegacySubmissionCount(cleanedFilters),
        getSubmissionStats(query.where || {}, cleanedFilters)
      ])

      // Combine regular and legacy submissions
      const submissions = [...regularSubmissions, ...legacySubmissions]
      const totalCount = regularCount + legacyCount
      
      const executionTime = Date.now() - startTime
      console.log(`⚡ Optimized admin submissions completed in ${executionTime}ms`)
      
      return {
        submissions: submissions.map(ResponseTransformer.toAdminSubmissionDTO),
        pagination: ResponseTransformer.toPaginationDTO(pagination.page, pagination.limit, totalCount),
        filters,
        stats
      }
    },
    { logPerformance: true, skipCache: !!opts.skipCache }
  )
}

/**
 * Clean and validate filters
 */
function cleanFilters(filters: any): Record<string, any> {
  const cleaned: Record<string, any> = {}
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      switch (key) {
        case 'flagged':
          cleaned[key] = value === 'true' || value === true
          break
        case 'dateFrom':
        case 'dateTo':
          cleaned[key] = new Date(value as string)
          break
        default:
          cleaned[key] = value
      }
    }
  })
  
  return cleaned
}

/**
 * Get optimized submissions with minimal includes for better performance
 */
async function getOptimizedSubmissions(query: any) {
  return await prisma.submission.findMany({
    where: query.where,
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
      // Only include essential review data to reduce response size
      peerReviews: {
        select: {
          xpScore: true
        }
      }
      // Removed: reviewAssignments, detailed metrics, timeline data
    },
    orderBy: query.orderBy,
    take: query.take,
    skip: query.skip
  })
}

/**
 * Get optimized legacy submissions with proper formatting
 */
async function getOptimizedLegacySubmissions(query: any, filters: any = {}) {
  const legacyLimit = Math.max(0, query.take - 0) // Get remaining slots after regular submissions
  const legacyOffset = query.skip || 0 // Use the same offset as regular submissions

  if (legacyLimit <= 0) {
    return []
  }

  // If userId filter is provided, we need to find legacy submissions for that user
  if (filters.userId) {
    // For userId filtering, we need to join with User table to find the discordHandle
    const user = await prisma.user.findUnique({
      where: { id: filters.userId },
      select: { username: true, discordHandle: true }
    })

    if (!user) {
      return [] // User not found, no legacy submissions
    }

    // Try both discordHandle and username for legacy submission linking
    const discordHandle = user.discordHandle || user.username
    try {
      const legacySubmissions = await prisma.$queryRaw`
        SELECT DISTINCT
          ls.id, ls.url, ls."discordHandle", ls."submittedAt", ls.role, ls.notes, ls."importedAt",
          ls."aiXp", ls."peerXp", ls."finalXp",
          u.id as "userId", u.username, u.email, u.role as "userRole", u."totalXp"
        FROM "LegacySubmission" ls
        LEFT JOIN "User" u ON (
          u."discordHandle" = ls."discordHandle" OR
          u."discordHandle" = ls."discordHandle" || '#0' OR
          u.username = ls."discordHandle"
        ) AND u.email NOT LIKE '%@legacy.import'
        WHERE ls."discordHandle" = ${discordHandle}
        ORDER BY ls."importedAt" DESC
        LIMIT ${legacyLimit}
        OFFSET ${legacyOffset}
      ` as LegacySubmissionWithUser[]

      return formatLegacySubmissions(legacySubmissions)
    } catch (error) {
      console.error('User-specific legacy query failed:', error)
      return []
    }
  }

  // If search filter is provided, filter legacy submissions by discordHandle or URL
  if (filters.search) {
    const searchTerm = `%${filters.search}%`
    try {
      const legacySubmissions = await prisma.$queryRaw`
        SELECT DISTINCT
          ls.id, ls.url, ls."discordHandle", ls."submittedAt", ls.role, ls.notes, ls."importedAt",
          ls."aiXp", ls."peerXp", ls."finalXp",
          u.id as "userId", u.username, u.email, u.role as "userRole", u."totalXp"
        FROM "LegacySubmission" ls
        LEFT JOIN "User" u ON (
          u."discordHandle" = ls."discordHandle" OR
          u."discordHandle" = ls."discordHandle" || '#0' OR
          u.username = ls."discordHandle"
        ) AND u.email NOT LIKE '%@legacy.import'
        WHERE ls."discordHandle" ILIKE ${searchTerm} OR ls.url ILIKE ${searchTerm}
        ORDER BY ls."importedAt" DESC
        LIMIT ${legacyLimit}
        OFFSET ${legacyOffset}
      ` as LegacySubmissionWithUser[]

      return formatLegacySubmissions(legacySubmissions)
    } catch (error) {
      console.error('Search-filtered legacy query failed:', error)
      return []
    }
  }

  try {
    const legacySubmissions = await prisma.$queryRaw`
      SELECT DISTINCT
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
      OFFSET ${legacyOffset}
    ` as LegacySubmissionWithUser[]

    return formatLegacySubmissions(legacySubmissions)
  } catch (error) {
    console.error('Primary legacy query failed:', error)
    // Fallback to empty result
    return []
  }
}

/**
 * Format legacy submissions to match regular submission format
 * Now includes conditional user data and feedback loop logging
 */
function formatLegacySubmissions(legacySubmissions: LegacySubmissionWithUser[]) {
  let linkedCount = 0
  let orphanedCount = 0

  const formatted = legacySubmissions.map(legacy => {
    // Calculate correct week number from submission timestamp
    const submissionDate = legacy.submittedAt || legacy.importedAt
    const weekNumber = submissionDate ? getWeekNumber(new Date(submissionDate)) : 1

    // Check if this legacy submission is linked to a real user
    const isLinked = legacy.userId && legacy.email && !legacy.email.includes('@legacy.import')

    if (isLinked) {
      linkedCount++
    } else {
      orphanedCount++
    }

    return {
      id: legacy.id,
      title: 'Legacy Submission',
      content: `Legacy submission from ${legacy.url}`,
      url: legacy.url,
      platform: 'LEGACY',
      taskTypes: ['LEGACY'],
      status: 'LEGACY_IMPORTED',
      aiXp: legacy.aiXp || 0,
      peerXp: legacy.peerXp,
      finalXp: legacy.finalXp,
      originalityScore: null,
      consensusScore: null,
      reviewCount: 0,
      flagCount: 0,
      createdAt: submissionDate,
      updatedAt: legacy.importedAt,
      weekNumber: weekNumber,
      reviewDeadline: null,
      user: legacy.userId ? {
        id: legacy.userId,
        username: legacy.username || legacy.discordHandle || 'Legacy User',
        email: legacy.email || 'legacy@import.data',
        role: legacy.userRole || legacy.role || 'USER',
        totalXp: legacy.totalXp || 0
      } : {
        id: 'legacy-user',
        username: legacy.discordHandle || 'Legacy User',
        email: 'legacy@import.data',
        role: legacy.role || 'USER',
        totalXp: 0
      },
      peerReviews: [] // Legacy submissions don't have peer reviews
    }
  })

  // User feedback loop logging
  console.log(`📊 Legacy submissions: ${linkedCount} linked, ${orphanedCount} orphaned`)

  return formatted
}

/**
 * Get legacy submission count
 */
async function getLegacySubmissionCount(filters: any = {}): Promise<number> {
  // If userId filter is provided, count legacy submissions for that user
  if (filters.userId) {
    const user = await prisma.user.findUnique({
      where: { id: filters.userId },
      select: { username: true, discordHandle: true }
    })

    if (!user) {
      return 0 // User not found, no legacy submissions
    }

    // Try both discordHandle and username for legacy submission linking
    const discordHandle = user.discordHandle || user.username
    const result = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM "LegacySubmission"
      WHERE "discordHandle" = ${discordHandle}
    ` as any[]

    return parseInt(result[0]?.count || '0')
  }

  // If search filter is provided, count legacy submissions matching the search
  if (filters.search) {
    const searchTerm = `%${filters.search}%`
    const result = await prisma.$queryRaw`
      SELECT COUNT(*) as count
      FROM "LegacySubmission"
      WHERE "discordHandle" ILIKE ${searchTerm} OR url ILIKE ${searchTerm}
    ` as any[]

    return parseInt(result[0]?.count || '0')
  }

  return await prisma.legacySubmission.count()
}

/**
 * Get regular submission count efficiently with caching
 * Note: Legacy submissions are counted separately by getLegacySubmissionCount()
 */
async function getSubmissionCount(whereClause: any): Promise<number> {
  const cacheKey = QueryCache.createKey('admin_submission_count', whereClause)

  return await withQueryCache(
    cacheKey,
    CacheTTL.SUBMISSIONS_LIST,
    async () => {
      // Only count regular submissions - legacy submissions are counted separately
      return await prisma.submission.count({ where: whereClause })
    }
  )
}

/**
 * Get submission statistics efficiently
 */
async function getSubmissionStats(whereClause: any, filters: any = {}) {
  // Create a more specific cache key that includes search filters
  const cacheKey = QueryCache.createKey('admin_submission_stats', {
    whereClause,
    filters,
    // Include search term explicitly to ensure cache differentiation
    search: filters.search || null
  })

  return await withQueryCache(
    cacheKey,
    CacheTTL.ANALYTICS,
    async () => {
      // Get status counts using optimized query
      const [statusCounts, legacyCount] = await Promise.all([
        prisma.submission.groupBy({
          by: ['status'],
          _count: true,
          where: whereClause
        }),
        getLegacySubmissionCount(filters) // Use filtered legacy count instead of total count
      ])

      const statusCountsMap = statusCounts.reduce((acc, stat) => {
        acc[stat.status] = stat._count
        return acc
      }, {} as Record<string, number>)

      // Add legacy submissions count (now filtered)
      statusCountsMap['LEGACY_IMPORTED'] = legacyCount

      // Ensure all status types are represented
      const allStatuses = ['PENDING', 'AI_REVIEWED', 'UNDER_PEER_REVIEW', 'FINALIZED', 'FLAGGED', 'REJECTED', 'LEGACY_IMPORTED']
      allStatuses.forEach(status => {
        if (!statusCountsMap[status]) {
          statusCountsMap[status] = 0
        }
      })

      const totalSubmissions = Object.values(statusCountsMap).reduce((sum, count) => sum + count, 0)

      return {
        statusCounts: statusCountsMap,
        totalSubmissions
      }
    }
  )
}

/**
 * Bulk operations for admin submissions (optimized)
 */
export async function bulkUpdateSubmissions(
  submissionIds: string[],
  action: 'updateStatus' | 'updateXp' | 'delete',
  data: any,
  adminId?: string
): Promise<{ success: boolean; count: number; message: string }> {
  const startTime = Date.now()
  
  try {
    let result: any
    
    switch (action) {
      case 'updateStatus':
        if (!data?.status) {
          throw new Error('Status is required for updateStatus action')
        }
        // Normalize incoming status values to enum
        const statusMap: Record<string, string> = {
          COMPLETED: 'FINALIZED',
          COMPLETE: 'FINALIZED',
          DONE: 'FINALIZED',
          PEER_REVIEW: 'UNDER_PEER_REVIEW',
          'PEER-REVIEW': 'UNDER_PEER_REVIEW',
        }
        const allowedStatuses = new Set([
          'PROCESSING',
          'PENDING',
          'AI_REVIEWED',
          'UNDER_PEER_REVIEW',
          'FINALIZED',
          'FLAGGED',
          'REJECTED',
        ])
        const requested = String(data.status).toUpperCase()
        const normalized = statusMap[requested] || requested
        if (!allowedStatuses.has(normalized)) {
          throw new Error(`Unsupported status: ${requested}`)
        }

        // Only update existing regular submissions (ignore legacy-only IDs)
        const existing = await prisma.submission.findMany({
          where: { id: { in: submissionIds } },
          select: { id: true }
        })
        const idsToUpdate = existing.map(e => e.id)

        result = await prisma.submission.updateMany({
          where: { id: { in: idsToUpdate } },
          data: {
            status: normalized,
            updatedAt: new Date()
          }
        })

        // Best-effort admin action audit per submission
        if (adminId) {
          try {
            await prisma.$transaction(async (tx) => {
              for (const id of submissionIds) {
                await tx.adminAction.create({
                  data: {
                    adminId,
                    action: 'SYSTEM_CONFIG',
                    targetType: 'submission',
                    targetId: id,
                    details: {
                      subAction: 'SUBMISSION_STATUS_CHANGE',
                      newStatus: normalized,
                      reason: data.reason || null,
                    }
                  }
                })
              }
            })
          } catch (e) {
            console.warn('bulkUpdateSubmissions(updateStatus) audit log failed:', e)
          }
        }
        break
        
      case 'updateXp':
        if (typeof data?.xpAwarded !== 'number') {
          throw new Error('XP amount is required for updateXp action')
        }
        
        // Use transaction for XP updates to maintain consistency
        result = await prisma.$transaction(async (tx) => {
          const submissions = await tx.submission.findMany({
            where: { id: { in: submissionIds } },
            include: { user: true }
          })
          
          for (const submission of submissions) {
            const xpDifference = data.xpAwarded - (submission.finalXp || 0)
            
            await Promise.all([
              // Update submission XP
              tx.submission.update({
                where: { id: submission.id },
                data: { finalXp: data.xpAwarded, status: 'FINALIZED' }
              }),
              // Update user total XP
              tx.user.update({
                where: { id: submission.userId },
                data: { 
                  totalXp: { increment: xpDifference },
                  currentWeekXp: { increment: xpDifference }
                }
              }),
              // Create XP transaction record
              tx.xpTransaction.create({
                data: {
                  userId: submission.userId,
                  amount: xpDifference,
                  type: 'ADMIN_ADJUSTMENT',
                  sourceId: submission.id,
                  description: `Admin XP adjustment: ${data.reason || 'Bulk update'}`,
                  weekNumber: Math.ceil(new Date().getDate() / 7)
                }
              })
            ])

            // Admin action log per submission (best-effort inside tx)
            if (adminId) {
              await tx.adminAction.create({
                data: {
                  adminId,
                  action: 'XP_OVERRIDE',
                  targetType: 'submission',
                  targetId: submission.id,
                  details: {
                    oldXp: submission.finalXp || 0,
                    newXp: data.xpAwarded,
                    difference: xpDifference,
                    reason: data.reason || 'Bulk update',
                  }
                }
              })
            }
          }
          
          return { count: submissions.length }
        })
        break
        
      case 'delete':
        // Deleting submissions: adjust user XP and cleanup transactions
        result = await prisma.$transaction(async (tx) => {
          const submissions = await tx.submission.findMany({
            where: { id: { in: submissionIds } },
            select: { id: true, userId: true, finalXp: true, aiXp: true }
          })

          // Adjust user XP totals (subtract awarded XP)
          for (const sub of submissions) {
            const awarded = sub.finalXp || sub.aiXp || 0
            if (awarded !== 0) {
              await tx.user.update({
                where: { id: sub.userId },
                data: {
                  totalXp: { decrement: awarded },
                  currentWeekXp: { decrement: awarded }
                }
              })
            }
          }

          // Delete related XP transactions
          await tx.xpTransaction.deleteMany({ where: { sourceId: { in: submissionIds } } })

          // Delete submissions
          const del = await tx.submission.deleteMany({ where: { id: { in: submissionIds } } })

          // Admin action logs (best-effort)
          if (adminId) {
            for (const sub of submissions) {
              try {
                await tx.adminAction.create({
                  data: {
                    adminId,
                    action: 'SYSTEM_CONFIG',
                    targetType: 'submission',
                    targetId: sub.id,
                    details: {
                      subAction: 'SUBMISSION_DELETE',
                      hadAwardedXp: !!(sub.finalXp || sub.aiXp),
                      awardedXp: sub.finalXp || sub.aiXp || 0,
                    }
                  }
                })
              } catch {}
            }
          }
          return { count: del.count }
        })
        break
        
      default:
        throw new Error(`Unknown action: ${action}`)
    }
    
    const executionTime = Date.now() - startTime
    console.log(`⚡ Bulk ${action} completed in ${executionTime}ms for ${result.count} submissions`)
    
    // Invalidate related caches
    await invalidateSubmissionCaches()
    
    return {
      success: true,
      count: result.count,
      message: `Successfully ${action} ${result.count} submissions`
    }
    
  } catch (error) {
    console.error(`Bulk ${action} error:`, error)
    return {
      success: false,
      count: 0,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    }
  }
}

/**
 * Invalidate submission-related caches after updates
 */
async function invalidateSubmissionCaches(): Promise<void> {
  try {
    await Promise.all([
      QueryCache.invalidatePattern('admin_submissions:*'),
      QueryCache.invalidatePattern('admin_submission_count:*'),
      QueryCache.invalidatePattern('admin_submission_stats:*'),
      QueryCache.invalidatePattern('leaderboard:*'),
      QueryCache.invalidatePattern('analytics:*')
    ])
    console.log('🗑️ Invalidated submission-related caches')
  } catch (error) {
    console.error('Cache invalidation error:', error)
  }
}

/**
 * Get individual submission details (optimized)
 */
export async function getOptimizedSubmissionDetails(submissionId: string) {
  const cacheKey = QueryCache.createKey('submission_details', { submissionId })
  
  return await withQueryCache(
    cacheKey,
    CacheTTL.SUBMISSION_DETAILS,
    async () => {
      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
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
          },
          xpTransactions: {
            where: {
              sourceId: submissionId
            },
            orderBy: {
              createdAt: 'desc'
            }
          }
        }
      })
      
      if (!submission) {
        throw new Error('Submission not found')
      }
      
      // Calculate metrics
      const metrics = {
        avgPeerScore: submission.peerReviews.length > 0
          ? submission.peerReviews.reduce((sum, review) => sum + (review.xpScore || 0), 0) / submission.peerReviews.length
          : null,
        consensusScore: submission.consensusScore,
        reviewProgress: {
          assigned: submission.reviewAssignments.length,
          completed: submission.peerReviews.length,
          pending: submission.reviewAssignments.length - submission.peerReviews.length,
          overdue: submission.reviewAssignments.filter(
            assignment => assignment.deadline < new Date() && assignment.status === 'PENDING'
          ).length
        }
      }
      
      return {
        submission,
        metrics
      }
    },
    { logPerformance: true }
  )
}

/**
 * Performance monitoring for admin submissions
 */
export class AdminSubmissionsPerformanceMonitor {
  private static metrics = {
    totalQueries: 0,
    totalExecutionTime: 0,
    bulkOperations: 0,
    cacheHits: 0,
    cacheMisses: 0
  }
  
  static recordQuery(executionTime: number, cacheHit: boolean, isBulkOperation: boolean = false) {
    this.metrics.totalQueries++
    this.metrics.totalExecutionTime += executionTime
    
    if (isBulkOperation) {
      this.metrics.bulkOperations++
    }
    
    if (cacheHit) {
      this.metrics.cacheHits++
    } else {
      this.metrics.cacheMisses++
    }
  }
  
  static getMetrics() {
    return {
      ...this.metrics,
      averageExecutionTime: this.metrics.totalQueries > 0 
        ? this.metrics.totalExecutionTime / this.metrics.totalQueries 
        : 0,
      cacheHitRate: this.metrics.totalQueries > 0 
        ? (this.metrics.cacheHits / this.metrics.totalQueries) * 100 
        : 0,
      bulkOperationRate: this.metrics.totalQueries > 0 
        ? (this.metrics.bulkOperations / this.metrics.totalQueries) * 100 
        : 0
    }
  }
  
  static reset() {
    this.metrics = {
      totalQueries: 0,
      totalExecutionTime: 0,
      bulkOperations: 0,
      cacheHits: 0,
      cacheMisses: 0
    }
  }
}

