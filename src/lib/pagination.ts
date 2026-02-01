import { PaginationDTO } from '@/types/api-responses'
import { Prisma } from '@prisma/client'
import { LEADERBOARD_EXCLUDED_ROLES } from './roles'

/**
 * Simple offset-based pagination utilities
 * Optimized for admin interfaces where offset pagination is sufficient and simpler than cursor pagination
 */

export interface PaginationParams {
  page: number
  limit: number
}

export interface PaginationResult<T> {
  data: T[]
  pagination: PaginationDTO
}

export interface PaginationQuery {
  take: number
  skip: number
}

/**
 * Create Prisma query parameters for pagination
 */
export function createPaginationQuery(params: PaginationParams): PaginationQuery {
  const { page, limit } = params
  const offset = (page - 1) * limit
  
  return {
    take: limit,
    skip: offset
  }
}

/**
 * Create pagination response with data and metadata
 */
export function createPaginationResponse<T>(
  data: T[], 
  totalCount: number, 
  params: PaginationParams
): PaginationResult<T> {
  const { page, limit } = params
  const totalPages = Math.ceil(totalCount / limit)
  
  return {
    data,
    pagination: {
      page,
      limit,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  }
}

/**
 * Parse pagination parameters from URL search params with validation
 */
export function parsePaginationParams(searchParams: URLSearchParams): PaginationParams {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20'))) // Max 100 items per page
  
  return { page, limit }
}

/**
 * Advanced pagination with sorting and filtering
 */
export interface AdvancedPaginationParams extends PaginationParams {
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  filters?: Record<string, any>
}

export interface AdvancedPaginationQuery extends PaginationQuery {
  orderBy?: Record<string, 'asc' | 'desc'>
  where?: Record<string, any>
}

/**
 * Create advanced Prisma query with sorting and filtering
 */
export function createAdvancedPaginationQuery(params: AdvancedPaginationParams): AdvancedPaginationQuery {
  const { page, limit, sortBy, sortOrder } = params
  const offset = (page - 1) * limit

  const query: AdvancedPaginationQuery = {
    take: limit,
    skip: offset
  }

  // Add sorting
  if (sortBy) {
    query.orderBy = { [sortBy]: sortOrder || 'desc' }
  }

  // Note: Filtering is now handled by specific query builders (createSubmissionQuery, createUserQuery, etc.)
  // to ensure proper field mapping and query structure

  return query
}

/**
 * Parse advanced pagination parameters from URL search params
 */
export function parseAdvancedPaginationParams(searchParams: URLSearchParams): AdvancedPaginationParams {
  const basic = parsePaginationParams(searchParams)
  
  return {
    ...basic,
    sortBy: searchParams.get('sortBy') || undefined,
    sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
    filters: parseFilters(searchParams)
  }
}

/**
 * Parse filter parameters from URL search params
 */
function parseFilters(searchParams: URLSearchParams): Record<string, any> {
  const filters: Record<string, any> = {}
  
  // Common filter parameters
  const filterParams = [
    'status', 'platform', 'taskType', 'role', 'search', 
    'dateFrom', 'dateTo', 'minXp', 'maxXp', 'lowReviews'
  ]
  
  filterParams.forEach(param => {
    const value = searchParams.get(param)
    if (value !== null && value !== '') {
      // Handle special cases
      switch (param) {
        case 'lowReviews':
          filters[param] = value === 'true'
          break
        case 'minXp':
        case 'maxXp':
          filters[param] = parseInt(value)
          break
        case 'dateFrom':
        case 'dateTo':
          filters[param] = new Date(value)
          break
        default:
          filters[param] = value
      }
    }
  })
  
  return filters
}

/**
 * Pagination utilities for specific endpoints
 */
export class PaginationHelper {
  /**
   * Create user list pagination query
   */
  static createUserQuery(params: AdvancedPaginationParams) {
    const query = createAdvancedPaginationQuery(params)

    // Default sorting for users
    if (!query.orderBy) {
      query.orderBy = { totalXp: 'desc' }
    }

    // Build user-specific where clause from filters
    const filters = params.filters || {}
    const where: any = {}

    if (filters.role) {
      where.role = filters.role
    }

    if (filters.search) {
      where.OR = [
        { username: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } }
      ]
    }

    if (filters.minXp || filters.maxXp) {
      where.totalXp = {}
      if (filters.minXp) where.totalXp.gte = filters.minXp
      if (filters.maxXp) where.totalXp.lte = filters.maxXp
    }

    if (filters.dateFrom || filters.dateTo) {
      where.joinedAt = {}
      if (filters.dateFrom) where.joinedAt.gte = filters.dateFrom
      if (filters.dateTo) where.joinedAt.lte = filters.dateTo
    }

    query.where = where
    
    return query
  }
  
  /**
   * Create submission list pagination query
   */
  static createSubmissionQuery(params: AdvancedPaginationParams) {
    const query = createAdvancedPaginationQuery(params)

    // Default sorting for submissions
    if (!query.orderBy) {
      query.orderBy = { createdAt: 'desc' }
    }

    // Build submission-specific where clause from filters
    const filters = params.filters || {}
    const where: any = {}

    if (filters.status) {
      // Handle special RESHUFFLE_NEEDED virtual status
      if (filters.status === 'RESHUFFLE_NEEDED') {
        where.status = 'UNDER_PEER_REVIEW'
        // Will be combined with missed reviewer filter below
        where.id = {
          in: Prisma.sql`(
            SELECT DISTINCT s.id
            FROM "Submission" s
            INNER JOIN "ReviewAssignment" ra ON s.id = ra."submissionId"
            WHERE s.status = 'UNDER_PEER_REVIEW'
            AND ra.status = 'MISSED'
            AND ra.deadline < NOW()
          )`
        }
      } else {
        where.status = filters.status
      }
    }

    if (filters.platform) {
      where.platform = filters.platform
    }

    if (filters.taskType) {
      where.taskTypes = { has: filters.taskType }
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { url: { contains: filters.search, mode: 'insensitive' } },
        { user: { username: { contains: filters.search, mode: 'insensitive' } } }
      ]
    }

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {}
      if (filters.dateFrom) where.createdAt.gte = filters.dateFrom
      if (filters.dateTo) where.createdAt.lte = filters.dateTo
    }

    if (filters.lowReviews) {
      console.log('🔍 Applying lowReviews filter - filtering submissions with less than 3 review assignments')
      // Filter submissions where assigned review count is less than 3
      // This filters based on active review assignments (excluding REASSIGNED)
      // We need to use a raw SQL query to count the review assignments
      where.id = {
        in: Prisma.sql`(
          SELECT s.id 
          FROM "Submission" s 
          LEFT JOIN (
            SELECT submissionId, COUNT(*) as assignment_count 
            FROM "ReviewAssignment" 
            WHERE status != 'REASSIGNED'
            GROUP BY submissionId
          ) ra ON s.id = ra.submissionId 
          WHERE ra.assignment_count IS NULL OR ra.assignment_count < 3
        )`
      }
    }

    if (filters.userId) {
      console.log('Adding userId filter:', filters.userId)
      where.userId = filters.userId
    }

    console.log('Final submission where clause:', JSON.stringify(where, null, 2))
    query.where = where
    
    return query
  }
  
  /**
   * Create leaderboard pagination query
   */
  static createLeaderboardQuery(params: AdvancedPaginationParams) {
    const query = createAdvancedPaginationQuery(params)
    
    // Default sorting for leaderboard
    if (!query.orderBy) {
      query.orderBy = { totalXp: 'desc' }
    }
    
    // Build leaderboard-specific where clause
    if (query.where) {
      const where: any = {
        role: { notIn: LEADERBOARD_EXCLUDED_ROLES } // Exclude admins and developers from leaderboard
      }
      
      if (query.where.search) {
        where.username = { contains: query.where.search, mode: 'insensitive' }
      }
      
      if (query.where.minXp || query.where.maxXp) {
        where.totalXp = {}
        if (query.where.minXp) where.totalXp.gte = query.where.minXp
        if (query.where.maxXp) where.totalXp.lte = query.where.maxXp
      }
      
      query.where = where
    } else {
      query.where = { role: { notIn: LEADERBOARD_EXCLUDED_ROLES } }
    }
    
    return query
  }
}

/**
 * Pagination performance monitoring
 */
export class PaginationMonitor {
  private static metrics = {
    totalQueries: 0,
    totalExecutionTime: 0,
    slowQueries: 0,
    largePages: 0
  }
  
  static recordQuery(executionTime: number, pageSize: number) {
    this.metrics.totalQueries++
    this.metrics.totalExecutionTime += executionTime
    
    if (executionTime > 1000) { // Slow query threshold: 1 second
      this.metrics.slowQueries++
    }
    
    if (pageSize > 50) { // Large page threshold: 50 items
      this.metrics.largePages++
    }
  }
  
  static getMetrics() {
    return {
      ...this.metrics,
      averageExecutionTime: this.metrics.totalQueries > 0 
        ? this.metrics.totalExecutionTime / this.metrics.totalQueries 
        : 0,
      slowQueryRate: this.metrics.totalQueries > 0 
        ? (this.metrics.slowQueries / this.metrics.totalQueries) * 100 
        : 0,
      largePageRate: this.metrics.totalQueries > 0 
        ? (this.metrics.largePages / this.metrics.totalQueries) * 100 
        : 0
    }
  }
  
  static reset() {
    this.metrics = {
      totalQueries: 0,
      totalExecutionTime: 0,
      slowQueries: 0,
      largePages: 0
    }
  }
}
