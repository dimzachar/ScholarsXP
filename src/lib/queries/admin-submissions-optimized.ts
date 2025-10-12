import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
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
  adminStatus?: string | null
  adminNotes?: string | null
  adminUpdatedAt?: Date | null
  adminUpdatedBy?: string | null
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

let legacyAdminFieldsSupported: boolean | null = null

async function supportsLegacyAdminFields(): Promise<boolean> {
  if (legacyAdminFieldsSupported !== null) {
    return legacyAdminFieldsSupported
  }

  try {
    const legacyModel = (Prisma as any)?.dmmf?.datamodel?.models?.find(
      (model: { name: string }) => model.name === 'LegacySubmission'
    )

    if (!legacyModel?.fields) {
      legacyAdminFieldsSupported = false
      return legacyAdminFieldsSupported
    }

    const fieldNames = new Set(legacyModel.fields.map((field: { name: string }) => field.name))
    legacyAdminFieldsSupported = ['adminStatus', 'adminNotes', 'adminUpdatedAt', 'adminUpdatedBy'].every(field =>
      fieldNames.has(field)
    )
  } catch (error) {
    console.warn('Failed to inspect Prisma DMMF for legacy admin fields; defaulting to false', error)
    legacyAdminFieldsSupported = false
  }

  return legacyAdminFieldsSupported
}

const STATUS_SYNONYMS: Record<string, string> = {
  COMPLETED: 'FINALIZED',
  COMPLETE: 'FINALIZED',
  DONE: 'FINALIZED',
  PEER_REVIEW: 'UNDER_PEER_REVIEW',
  'PEER-REVIEW': 'UNDER_PEER_REVIEW',
}

const REGULAR_ALLOWED_STATUSES = new Set<string>([
  'PROCESSING',
  'PENDING',
  'AI_REVIEWED',
  'UNDER_PEER_REVIEW',
  'FINALIZED',
  'FLAGGED',
  'REJECTED',
])

const LEGACY_DEFAULT_STATUS = 'LEGACY_IMPORTED'

function normalizeStatusInput(status?: string | null): string | null {
  if (!status) return null
  const normalized = status.toUpperCase()
  return STATUS_SYNONYMS[normalized] || normalized
}

async function buildLegacyStatusFilter(status?: string | null): Promise<Prisma.LegacySubmissionWhereInput | undefined> {
  const normalized = normalizeStatusInput(status)
  if (!normalized) {
    return undefined
  }

  if (!(await supportsLegacyAdminFields())) {
    return undefined
  }

  if (normalized === LEGACY_DEFAULT_STATUS) {
    return {
      OR: [
        { adminStatus: null },
        { adminStatus: LEGACY_DEFAULT_STATUS },
      ],
    }
  }

  return { adminStatus: normalized }
}

function collectLegacyHandleCandidates(user: {
  username: string | null
  discordHandle: string | null
  email: string | null
}): string[] {
  const candidates = new Set<string>()

  const addCandidate = (value?: string | null) => {
    if (!value) return
    const trimmed = value.trim()
    if (!trimmed) return
    candidates.add(trimmed)
  }

  addCandidate(user.discordHandle)
  addCandidate(user.username)

  const addBaseVariant = (value?: string | null) => {
    if (!value) return
    const trimmed = value.trim()
    if (!trimmed || !trimmed.includes('#')) {
      return
    }
    const base = trimmed.split('#')[0]?.trim()
    if (base) {
      candidates.add(base)
    }
  }

  addBaseVariant(user.discordHandle)
  addBaseVariant(user.username)

  if (user.email) {
    const localPart = user.email.split('@')[0]?.trim()
    addCandidate(localPart)
    addBaseVariant(localPart)
  }

  return Array.from(candidates)
}

function buildLegacyHandleConditions(handles: string[]): Prisma.LegacySubmissionWhereInput[] {
  const conditions: Prisma.LegacySubmissionWhereInput[] = []
  const seen = new Set<string>()

  handles.forEach(handle => {
    const trimmed = handle.trim()
    if (!trimmed) {
      return
    }

    const normalized = trimmed.toLowerCase()
    if (!seen.has(`equals:${normalized}`)) {
      conditions.push({
        discordHandle: { equals: trimmed, mode: 'insensitive' }
      })
      seen.add(`equals:${normalized}`)
    }

    const base = trimmed.split('#')[0]?.trim()
    if (base) {
      const baseNormalized = base.toLowerCase()
      if (!seen.has(`equals:${baseNormalized}`)) {
        conditions.push({
          discordHandle: { equals: base, mode: 'insensitive' }
        })
        seen.add(`equals:${baseNormalized}`)
      }

      if (!seen.has(`starts:${baseNormalized}`)) {
        conditions.push({
          discordHandle: { startsWith: `${base}#`, mode: 'insensitive' }
        })
        seen.add(`starts:${baseNormalized}`)
      }
    }
  })

  return conditions
}

async function createLegacyWhereClause(filters: any = {}): Promise<Prisma.LegacySubmissionWhereInput | null> {
  const andFilters: Prisma.LegacySubmissionWhereInput[] = []

  if (filters.userId) {
    const user = await prisma.user.findUnique({
      where: { id: filters.userId },
      select: { username: true, discordHandle: true, email: true }
    })

    if (!user) {
      return null
    }

    const handleCandidates = collectLegacyHandleCandidates(user)
    const handleConditions = buildLegacyHandleConditions(handleCandidates)

    if (handleConditions.length === 0) {
      console.warn(`Legacy submissions filter - no handle candidates for user ${filters.userId}`)
      return null
    }

    andFilters.push({ OR: handleConditions })
  }

  const statusFilter = await buildLegacyStatusFilter(filters.status)
  if (statusFilter) {
    andFilters.push(statusFilter)
  }

  if (!filters.userId && filters.search) {
    andFilters.push({
      OR: [
        { discordHandle: { contains: filters.search, mode: 'insensitive' } },
        { url: { contains: filters.search, mode: 'insensitive' } }
      ]
    })
  }

  if (andFilters.length === 0) {
    return {}
  }

  return { AND: andFilters }
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
      },
      _count: {
        select: {
          reviewAssignments: true
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

  const whereClause = await createLegacyWhereClause(filters)
  if (whereClause === null) {
    return []
  }

  const supportsAdminFields = await supportsLegacyAdminFields()

  const baseSelect = {
    id: true,
    url: true,
    discordHandle: true,
    submittedAt: true,
    role: true,
    notes: true,
    importedAt: true,
    aiXp: true,
    peerXp: true,
    finalXp: true
  } as const

  const select = supportsAdminFields
    ? {
        ...baseSelect,
        adminStatus: true,
        adminNotes: true,
        adminUpdatedAt: true,
        adminUpdatedBy: true
      }
    : baseSelect

  type LegacyRecord = {
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
    adminStatus?: string | null
    adminNotes?: string | null
    adminUpdatedAt?: Date | null
    adminUpdatedBy?: string | null
  }

  const legacyRecords = await prisma.legacySubmission.findMany({
    where: whereClause,
    orderBy: { importedAt: 'desc' },
    skip: legacyOffset,
    take: legacyLimit,
    select: select as Prisma.LegacySubmissionSelect
  }) as LegacyRecord[]

  if (legacyRecords.length === 0) {
    return []
  }

  const handles = Array.from(new Set(
    legacyRecords
      .map(record => record.discordHandle?.trim())
      .filter((handle): handle is string => !!handle)
  ))

  type LegacyUserSummary = {
    id: string
    username: string
    email: string | null
    role: string | null
    totalXp: number | null
    discordHandle: string | null
  }

  const userLookup = new Map<string, LegacyUserSummary>()

  if (handles.length > 0) {
    const orConditions: Prisma.UserWhereInput['OR'] = []
    for (const handle of handles) {
      orConditions?.push({ discordHandle: handle })
      if (!handle.includes('#')) {
        orConditions?.push({ discordHandle: `${handle}#0` })
      }
      orConditions?.push({ username: handle })
    }

    if (orConditions && orConditions.length > 0) {
      const users = await prisma.user.findMany({
        where: {
          OR: orConditions,
          NOT: { email: { endsWith: '@legacy.import' } }
        },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          totalXp: true,
          discordHandle: true
        }
      })

      users.forEach(user => {
        const summary: LegacyUserSummary = {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          totalXp: user.totalXp,
          discordHandle: user.discordHandle
        }

        if (user.discordHandle) {
          userLookup.set(user.discordHandle, summary)
          if (!user.discordHandle.includes('#')) {
            userLookup.set(`${user.discordHandle}#0`, summary)
          }
        }

        userLookup.set(user.username, summary)
      })
    }
  }

  const formatted: LegacySubmissionWithUser[] = legacyRecords.map(record => {
    const handle = record.discordHandle?.trim() || ''
    let matchedUser = handle ? userLookup.get(handle) : undefined

    if (!matchedUser && handle && !handle.includes('#')) {
      matchedUser = userLookup.get(`${handle}#0`)
    }

    if (!matchedUser && handle) {
      matchedUser = userLookup.get(handle)
    }

    return {
      id: record.id,
      url: record.url,
      adminStatus: supportsAdminFields ? record.adminStatus ?? null : null,
      adminNotes: supportsAdminFields ? record.adminNotes ?? null : null,
      adminUpdatedAt: supportsAdminFields ? record.adminUpdatedAt ?? null : null,
      adminUpdatedBy: supportsAdminFields ? record.adminUpdatedBy ?? null : null,
      discordHandle: record.discordHandle,
      submittedAt: record.submittedAt,
      role: record.role,
      notes: record.notes,
      importedAt: record.importedAt,
      aiXp: record.aiXp,
      peerXp: record.peerXp,
      finalXp: record.finalXp,
      userId: matchedUser?.id ?? null,
      username: matchedUser?.username ?? null,
      email: matchedUser?.email ?? null,
      userRole: matchedUser?.role ?? null,
      totalXp: matchedUser?.totalXp ?? null,
    }
  })

  return formatLegacySubmissions(formatted)
}

/**
 * Format legacy submissions to match regular submission format
 to match regular submission format
 * Now includes conditional user data and feedback loop logging
 */
function formatLegacySubmissions(legacySubmissions: LegacySubmissionWithUser[]) {
  let linkedCount = 0
  let orphanedCount = 0

  const formatted = legacySubmissions.map(legacy => {
    // Calculate correct week number from submission timestamp
    const submissionDate = legacy.submittedAt || legacy.importedAt
    const weekNumber = submissionDate ? getWeekNumber(new Date(submissionDate)) : 1
    const status = normalizeStatusInput(legacy.adminStatus) || LEGACY_DEFAULT_STATUS

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
      status: status,
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
  const whereClause = await createLegacyWhereClause(filters)
  if (whereClause === null) {
    return 0
  }

  return await prisma.legacySubmission.count({ where: whereClause })
}

async function getLegacyStatusCounts(filters: any = {}): Promise<Record<string, number>> {
  const whereClause = await createLegacyWhereClause(filters)
  if (whereClause === null) {
    return {}
  }

  if (!(await supportsLegacyAdminFields())) {
    const total = await prisma.legacySubmission.count({ where: whereClause })
    if (!total) {
      return {}
    }
    return { [LEGACY_DEFAULT_STATUS]: total }
  }

  const grouped = await prisma.legacySubmission.groupBy({
    by: ['adminStatus'],
    _count: true,
    where: whereClause
  })

  return grouped.reduce<Record<string, number>>((acc, entry) => {
    const status = normalizeStatusInput(entry.adminStatus) || LEGACY_DEFAULT_STATUS
    acc[status] = (acc[status] || 0) + entry._count
    return acc
  }, {})
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
      const [statusCounts, legacyStatusCounts] = await Promise.all([
        prisma.submission.groupBy({
          by: ['status'],
          _count: true,
          where: whereClause
        }),
        getLegacyStatusCounts(filters)
      ])

      const statusCountsMap = statusCounts.reduce((acc, stat) => {
        acc[stat.status] = stat._count
        return acc
      }, {} as Record<string, number>)

      for (const [status, count] of Object.entries(legacyStatusCounts)) {
        statusCountsMap[status] = (statusCountsMap[status] || 0) + count
      }

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
      case 'updateStatus': {
        if (!data?.status) {
          throw new Error('Status is required for updateStatus action')
        }

        const requested = String(data.status)
        const normalized = normalizeStatusInput(requested)

        if (!normalized || (!REGULAR_ALLOWED_STATUSES.has(normalized) && normalized !== LEGACY_DEFAULT_STATUS)) {
          throw new Error(`Unsupported status: ${requested.toUpperCase()}`)
        }

        const trimmedReason = typeof data.reason === 'string' ? data.reason.trim() : ''
        const timestamp = new Date()

        const supportsAdminFields = await supportsLegacyAdminFields()

        result = await prisma.$transaction(async (tx) => {
          const [regularRecords, legacyRecords] = await Promise.all([
            tx.submission.findMany({
              where: { id: { in: submissionIds } },
              select: { id: true }
            }),
            tx.legacySubmission.findMany({
              where: { id: { in: submissionIds } },
              select: { id: true }
            })
          ])

          const regularIds = regularRecords.map(record => record.id)
          const legacyIds = legacyRecords.map(record => record.id)

          let regularUpdated = 0
          let legacyUpdated = 0

          if (regularIds.length > 0) {
            const update = await tx.submission.updateMany({
              where: { id: { in: regularIds } },
              data: { status: normalized, updatedAt: timestamp }
            })
            regularUpdated = update.count
          }

          if (legacyIds.length > 0) {
            const legacyUpdateData: Prisma.LegacySubmissionUpdateManyMutationInput = {}

            if (supportsAdminFields) {
              legacyUpdateData.adminStatus = normalized === LEGACY_DEFAULT_STATUS ? null : normalized
              legacyUpdateData.adminUpdatedAt = timestamp
              legacyUpdateData.adminUpdatedBy = adminId ?? null

              if (trimmedReason) {
                legacyUpdateData.adminNotes = trimmedReason
              }
            } else if (trimmedReason) {
              console.warn('Legacy admin notes unsupported; skipping note update for legacy submissions')
            }

            if (normalized === 'FINALIZED' || normalized === 'REJECTED') {
              legacyUpdateData.processed = true
            }

            if (Object.keys(legacyUpdateData).length > 0) {
              const update = await tx.legacySubmission.updateMany({
                where: { id: { in: legacyIds } },
                data: legacyUpdateData
              })
              legacyUpdated = update.count
            }
          }

          if (adminId) {
            if (regularIds.length > 0) {
              for (const id of regularIds) {
                await tx.adminAction.create({
                  data: {
                    adminId,
                    action: 'SYSTEM_CONFIG',
                    targetType: 'submission',
                    targetId: id,
                    details: {
                      subAction: 'SUBMISSION_STATUS_CHANGE',
                      newStatus: normalized,
                      reason: trimmedReason || null,
                    }
                  }
                })
              }
            }

            if (legacyIds.length > 0) {
              for (const id of legacyIds) {
                await tx.adminAction.create({
                  data: {
                    adminId,
                    action: 'SYSTEM_CONFIG',
                    targetType: 'legacy_submission',
                    targetId: id,
                    details: {
                      subAction: 'SUBMISSION_STATUS_CHANGE',
                      newStatus: normalized,
                      reason: trimmedReason || null,
                    }
                  }
                })
              }
            }
          }

          const messageParts: string[] = []
          if (regularUpdated) {
            messageParts.push(`${regularUpdated} current`)
          }
          if (legacyUpdated) {
            messageParts.push(`${legacyUpdated} legacy`)
          }

          return {
            count: regularUpdated + legacyUpdated,
            regularUpdated,
            legacyUpdated,
            message: messageParts.length
              ? `Updated status for ${messageParts.join(' and ')} submissions`
              : 'No submissions updated'
          }
        })

        break
      }
      case 'updateXp':
        if (typeof data?.xpAwarded !== 'number') {
          throw new Error('XP amount is required for updateXp action')
        }

        const hasCustomReason = typeof data?.reason === 'string' && data.reason.trim().length > 0
        const reason = hasCustomReason ? data.reason.trim() : 'Bulk update'
        const timestamp = new Date()
        const supportsAdminFields = await supportsLegacyAdminFields()

        // Use transaction for XP updates to maintain consistency across regular and legacy submissions
        result = await prisma.$transaction(async (tx) => {
          const [currentSubmissions, legacySubmissions] = await Promise.all([
            tx.submission.findMany({
              where: { id: { in: submissionIds } },
              include: { user: true }
            }),
            tx.legacySubmission.findMany({
              where: { id: { in: submissionIds } },
              select: {
                id: true,
                discordHandle: true,
                finalXp: true,
                aiXp: true,
                peerXp: true
              }
            })
          ])

          let regularUpdated = 0
          let legacyUpdated = 0
          const legacyWithoutUser: string[] = []

          for (const submission of currentSubmissions) {
            const previousXp = submission.finalXp || 0
            const xpDifference = data.xpAwarded - previousXp

            await tx.submission.update({
              where: { id: submission.id },
              data: { finalXp: data.xpAwarded, status: 'FINALIZED', updatedAt: timestamp }
            })

            if (xpDifference !== 0) {
              await Promise.all([
                tx.user.update({
                  where: { id: submission.userId },
                  data: {
                    totalXp: { increment: xpDifference },
                    currentWeekXp: { increment: xpDifference }
                  }
                }),
                tx.xpTransaction.create({
                  data: {
                    userId: submission.userId,
                    amount: xpDifference,
                    type: 'ADMIN_ADJUSTMENT',
                    sourceId: submission.id,
                    description: `Admin XP adjustment: ${reason}`,
                    weekNumber: getWeekNumber(timestamp),
                    adminId: adminId ?? undefined
                  }
                })
              ])
            }

            if (adminId) {
              await tx.adminAction.create({
                data: {
                  adminId,
                  action: 'XP_OVERRIDE',
                  targetType: 'submission',
                  targetId: submission.id,
                  details: {
                    oldXp: previousXp,
                    newXp: data.xpAwarded,
                    difference: xpDifference,
                    reason
                  }
                }
              })
            }

            regularUpdated++
          }

          for (const legacy of legacySubmissions) {
            const previousLegacyXp = legacy.finalXp ?? legacy.aiXp ?? 0
            const xpDifference = data.xpAwarded - previousLegacyXp

            const legacyUpdateData: Prisma.LegacySubmissionUpdateInput = {
              finalXp: data.xpAwarded,
              processed: true
            }

            if (supportsAdminFields) {
              legacyUpdateData.adminStatus = 'FINALIZED'
              legacyUpdateData.adminUpdatedAt = timestamp
              legacyUpdateData.adminUpdatedBy = adminId ?? null

              if (hasCustomReason) {
                legacyUpdateData.adminNotes = reason
              }
            } else if (hasCustomReason) {
              console.warn('Legacy admin notes unsupported; skipping note update for legacy submission XP adjustment')
            }

            await tx.legacySubmission.update({
              where: { id: legacy.id },
              data: legacyUpdateData
            })

            let linkedUserId: string | null = null
            if (legacy.discordHandle) {
              const matched = await tx.user.findFirst({
                where: {
                  OR: [
                    { discordHandle: legacy.discordHandle },
                    { discordHandle: legacy.discordHandle + '#0' },
                    { username: legacy.discordHandle }
                  ],
                  NOT: { email: { endsWith: '@legacy.import' } }
                },
                select: { id: true }
              })
              linkedUserId = matched?.id ?? null
            }

            if (linkedUserId && xpDifference !== 0) {
              await Promise.all([
                tx.user.update({
                  where: { id: linkedUserId },
                  data: {
                    totalXp: { increment: xpDifference },
                    currentWeekXp: { increment: xpDifference }
                  }
                }),
                tx.xpTransaction.create({
                  data: {
                    userId: linkedUserId,
                    amount: xpDifference,
                    type: 'ADMIN_ADJUSTMENT',
                    sourceId: legacy.id,
                    sourceType: 'LEGACY_SUBMISSION',
                    description: `Legacy XP adjustment: ${reason}`,
                    weekNumber: getWeekNumber(timestamp),
                    adminId: adminId ?? undefined
                  }
                })
              ])
            } else if (!linkedUserId && xpDifference !== 0) {
              legacyWithoutUser.push(legacy.id)
            }

            if (adminId) {
              await tx.adminAction.create({
                data: {
                  adminId,
                  action: 'XP_OVERRIDE',
                  targetType: 'legacy_submission',
                  targetId: legacy.id,
                  details: {
                    oldXp: previousLegacyXp,
                    newXp: data.xpAwarded,
                    difference: xpDifference,
                    reason
                  }
                }
              })
            }

            legacyUpdated++
          }

          return {
            count: regularUpdated + legacyUpdated,
            regularCount: regularUpdated,
            legacyCount: legacyUpdated,
            legacyWithoutUser
          }
        })

        if (result.legacyWithoutUser?.length) {
          console.warn(
            'Legacy submissions without linked users - XP totals not adjusted:',
            result.legacyWithoutUser
          )
        }

        if (result.legacyCount) {
          const parts: string[] = []
          if (result.regularCount) {
            parts.push(`${result.regularCount} current`)
          }
          parts.push(`${result.legacyCount} legacy`)
          result.message = `Updated XP for ${parts.join(' and ')} submissions`
        }
        break
        
      case 'delete': {
        // Deleting submissions: adjust user XP and cleanup transactions
        result = await prisma.$transaction(async (tx) => {
          const [submissions, legacySubmissions] = await Promise.all([
            tx.submission.findMany({
              where: { id: { in: submissionIds } },
              select: { id: true, userId: true, finalXp: true, aiXp: true }
            }),
            tx.legacySubmission.findMany({
              where: { id: { in: submissionIds } },
              select: {
                id: true,
                discordHandle: true,
                finalXp: true,
                aiXp: true
              }
            })
          ])

          const legacyWithoutUser: string[] = []

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

          for (const legacy of legacySubmissions) {
            const awarded = legacy.finalXp ?? legacy.aiXp ?? 0
            let linkedUserId: string | null = null

            if (legacy.discordHandle) {
              const matched = await tx.user.findFirst({
                where: {
                  OR: [
                    { discordHandle: legacy.discordHandle },
                    { discordHandle: legacy.discordHandle + '#0' },
                    { username: legacy.discordHandle }
                  ],
                  NOT: { email: { endsWith: '@legacy.import' } }
                },
                select: { id: true }
              })
              linkedUserId = matched?.id ?? null
            }

            if (linkedUserId && awarded !== 0) {
              await tx.user.update({
                where: { id: linkedUserId },
                data: {
                  totalXp: { decrement: awarded },
                  currentWeekXp: { decrement: awarded }
                }
              })
            } else if (!linkedUserId && awarded !== 0) {
              legacyWithoutUser.push(legacy.id)
            }
          }

          await tx.xpTransaction.deleteMany({ where: { sourceId: { in: submissionIds } } })

          const [deletedRegular, deletedLegacy] = await Promise.all([
            tx.submission.deleteMany({ where: { id: { in: submissionIds } } }),
            tx.legacySubmission.deleteMany({ where: { id: { in: submissionIds } } })
          ])

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

            for (const legacy of legacySubmissions) {
              try {
                await tx.adminAction.create({
                  data: {
                    adminId,
                    action: 'SYSTEM_CONFIG',
                    targetType: 'legacy_submission',
                    targetId: legacy.id,
                    details: {
                      subAction: 'SUBMISSION_DELETE',
                      hadAwardedXp: !!(legacy.finalXp || legacy.aiXp),
                      awardedXp: legacy.finalXp ?? legacy.aiXp ?? 0,
                    }
                  }
                })
              } catch {}
            }
          }

          return {
            count: deletedRegular.count + deletedLegacy.count,
            regularCount: deletedRegular.count,
            legacyCount: deletedLegacy.count,
            legacyWithoutUser
          }
        })

        if (result.legacyWithoutUser?.length) {
          console.warn(
            'Legacy submissions without linked users - XP totals not adjusted:',
            result.legacyWithoutUser
          )
        }

        if (result.legacyCount || result.regularCount) {
          const parts: string[] = []
          if (result.regularCount) {
            parts.push(`${result.regularCount} current`)
          }
          if (result.legacyCount) {
            parts.push(`${result.legacyCount} legacy`)
          }
          result.message = `Deleted ${parts.join(' and ')} submissions`
        }
        break
      }

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
      message: result.message || `Successfully ${action} ${result.count} submissions`
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



