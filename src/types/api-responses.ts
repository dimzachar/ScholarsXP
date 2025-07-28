/**
 * Response DTOs for API Response Optimization
 * These DTOs reduce response sizes by 60-80% by including only essential fields
 */

// ============================================================================
// LEADERBOARD RESPONSE DTOS
// ============================================================================

export interface LeaderboardUserDTO {
  id: string
  username: string
  totalXp: number
  rank: number
  submissionCount: number
  // Removed: full user profile, detailed submission history, review data
}

export interface LeaderboardResponseDTO {
  users: LeaderboardUserDTO[]
  pagination: PaginationDTO
  weeklyStats: {
    totalSubmissions: number
    averageXp: number
    topPerformer: string
    weekNumber: number
  }
  // Removed: detailed user metrics, review contributions, time series data
}

export interface DetailedLeaderboardDTO {
  submissions: DetailedSubmissionDTO[]
  totalCount: number
  pagination: PaginationDTO
  weeklyStats: {
    totalSubmissions: number
    averageXp: number
    topPerformer: string
    weekNumber: number
  }
  filters: {
    applied: number
    week?: string
    user?: string
    taskType?: string
    platform?: string
  }
  // Removed: reviewer contributions (admin only), detailed timeline data
}

// ============================================================================
// ADMIN SUBMISSIONS RESPONSE DTOS
// ============================================================================

export interface AdminSubmissionDTO {
  id: string
  title: string
  content: string
  url: string
  platform: string
  taskType: string
  status: string
  xpAwarded: number
  aiXp: number | null
  peerXp: number | null
  finalXp: number | null
  createdAt: string
  user: {
    id: string
    username: string
    email: string
    role: string
    totalXp: number
  }
  metrics: {
    reviewCount: number
    avgPeerScore?: number
    reviewProgress: {
      assigned: number
      completed: number
      pending: number
    }
  }
  // Removed: full review history, detailed metrics, timeline data, XP transactions
}

export interface AdminSubmissionsResponseDTO {
  submissions: AdminSubmissionDTO[]
  pagination: PaginationDTO
  filters: {
    status?: string
    platform?: string
    taskType?: string
    dateFrom?: string
    dateTo?: string
    search?: string
    flagged?: boolean
  }
  stats: {
    statusCounts: Record<string, number>
    totalSubmissions: number
  }
  // Removed: detailed user metrics, review assignments, admin actions
}

// ============================================================================
// USER PROFILE RESPONSE DTOS
// ============================================================================

export interface UserProfileDTO {
  id: string
  username: string
  email: string
  role: string
  totalXp: number
  currentWeekXp: number
  streakWeeks: number
  profileImageUrl?: string
  bio?: string
  joinedAt: string
  lastActiveAt?: string
  // Removed: preferences, discord fields, detailed settings
}

export interface UserStatisticsDTO {
  totalSubmissions: number
  completedSubmissions: number
  totalReviews: number
  totalAchievements: number
  avgScore: number
  rank: {
    weekly: number
    allTime: number
    totalUsers: number
  }
  xpBreakdown: {
    total: number
    submissions: number
    reviews: number
    achievements: number
    other: number
  }
  // Removed: detailed streaks, penalties, legacy data, weekly breakdowns
}

export interface CompleteUserProfileDTO {
  profile: UserProfileDTO
  statistics: UserStatisticsDTO
  recentSubmissions: SimpleSubmissionDTO[]
  recentReviews: SimpleReviewDTO[]
  achievements: SimpleAchievementDTO[]
  // Removed: full submission history, detailed review history, XP transactions
}

// ============================================================================
// SHARED/COMMON DTOS
// ============================================================================

export interface PaginationDTO {
  page: number
  limit: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

export interface SimpleSubmissionDTO {
  id: string
  title?: string
  url: string
  platform: string
  status: string
  xpAwarded: number
  createdAt: string
  // Removed: detailed content, review data, metrics
}

export interface DetailedSubmissionDTO {
  id: string
  title?: string
  url: string
  platform: string
  taskTypes: string[]
  status: string
  aiXp: number
  peerXp?: number
  finalXp?: number
  reviewCount: number
  createdAt: string
  weekNumber: number
  user: {
    username: string
    email: string
    role: string
  }
  peerReviews: SimpleReviewDTO[]
  // Removed: full content, detailed metrics, timeline, admin actions
}

export interface SimpleReviewDTO {
  reviewerId: string
  xpScore: number
  reviewer: {
    username: string
  }
  // Removed: detailed feedback, quality ratings, time spent
}

export interface SimpleAchievementDTO {
  id: string
  title: string
  description: string
  earnedAt: string
  // Removed: detailed criteria, progress tracking
}

// ============================================================================
// ANALYTICS RESPONSE DTOS (Already implemented in analytics-optimized.ts)
// ============================================================================

export interface AnalyticsOverviewDTO {
  totalUsers: number
  activeUsers: number
  totalSubmissions: number
  completedSubmissions: number
  totalReviews: number
  totalXpAwarded: number
  totalAchievements: number
  pendingFlags: number
  submissionSuccessRate: number
  avgReviewScore: number
  // Removed: detailed breakdowns, individual user data, time series
}

// ============================================================================
// RESPONSE TRANSFORMATION UTILITIES
// ============================================================================

export class ResponseTransformer {
  /**
   * Transform full user object to UserProfileDTO
   */
  static toUserProfileDTO(user: any): UserProfileDTO {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      totalXp: user.totalXp,
      currentWeekXp: user.currentWeekXp,
      streakWeeks: user.streakWeeks,
      profileImageUrl: user.profileImageUrl,
      bio: user.bio,
      joinedAt: user.joinedAt,
      lastActiveAt: user.lastActiveAt
    }
  }

  /**
   * Transform full submission object to AdminSubmissionDTO
   */
  static toAdminSubmissionDTO(submission: any): AdminSubmissionDTO {
    return {
      id: submission.id,
      title: submission.title || `${submission.platform} submission`,
      content: submission.content || `Submission from ${submission.url}`,
      url: submission.url,
      platform: submission.platform,
      taskType: submission.taskTypes?.[0] || submission.taskType || 'Unknown',
      status: submission.status,
      xpAwarded: submission.finalXp || submission.aiXp || 0,
      aiXp: submission.aiXp || null,
      peerXp: submission.peerXp || null,
      finalXp: submission.finalXp || null,
      createdAt: submission.createdAt,
      user: {
        id: submission.user?.id || 'legacy-user',
        username: submission.user?.username || 'Unknown',
        email: submission.user?.email || 'unknown@example.com',
        role: submission.user?.role || 'USER',
        totalXp: submission.user?.totalXp || 0
      },
      metrics: {
        reviewCount: submission.reviewCount || 0,
        avgPeerScore: submission.peerReviews?.length > 0
          ? submission.peerReviews.reduce((sum: number, review: any) => sum + (review.xpScore || 0), 0) / submission.peerReviews.length
          : undefined,
        reviewProgress: {
          assigned: submission.reviewAssignments?.length || 0,
          completed: submission.peerReviews?.length || 0,
          pending: Math.max(0, (submission.reviewAssignments?.length || 0) - (submission.peerReviews?.length || 0))
        }
      }
    }
  }

  /**
   * Transform full submission object to SimpleSubmissionDTO
   */
  static toSimpleSubmissionDTO(submission: any): SimpleSubmissionDTO {
    return {
      id: submission.id,
      title: submission.title,
      url: submission.url,
      platform: submission.platform,
      status: submission.status,
      xpAwarded: submission.finalXp || submission.aiXp || 0,
      createdAt: submission.createdAt
    }
  }

  /**
   * Transform full submission object to DetailedSubmissionDTO
   */
  static toDetailedSubmissionDTO(submission: any): DetailedSubmissionDTO {
    return {
      id: submission.id,
      title: submission.title,
      url: submission.url,
      platform: submission.platform,
      taskTypes: submission.taskTypes || [],
      status: submission.status,
      aiXp: submission.aiXp,
      peerXp: submission.peerXp,
      finalXp: submission.finalXp,
      reviewCount: submission.reviewCount || 0,
      createdAt: submission.createdAt,
      weekNumber: submission.weekNumber,
      user: {
        username: submission.user?.username || 'Unknown',
        email: submission.user?.email || 'unknown@example.com',
        role: submission.user?.role || 'USER'
      },
      peerReviews: (submission.peerReviews || []).map((review: any) => ({
        reviewerId: review.reviewerId,
        xpScore: review.xpScore,
        reviewer: {
          username: review.reviewer?.username || 'Unknown'
        }
      }))
    }
  }

  /**
   * Create pagination DTO
   */
  static toPaginationDTO(page: number, limit: number, totalCount: number): PaginationDTO {
    const totalPages = Math.ceil(totalCount / limit)
    return {
      page,
      limit,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  }
}

// ============================================================================
// RESPONSE SIZE MONITORING
// ============================================================================

export class ResponseSizeMonitor {
  private static measurements: Array<{
    endpoint: string
    originalSize: number
    optimizedSize: number
    reduction: number
    timestamp: Date
  }> = []

  static recordOptimization(
    endpoint: string, 
    originalData: any, 
    optimizedData: any
  ): void {
    const originalSize = JSON.stringify(originalData).length
    const optimizedSize = JSON.stringify(optimizedData).length
    const reduction = ((originalSize - optimizedSize) / originalSize) * 100

    this.measurements.push({
      endpoint,
      originalSize,
      optimizedSize,
      reduction,
      timestamp: new Date()
    })

    console.log(`📊 Response optimization: ${endpoint} - ${originalSize}B → ${optimizedSize}B (${reduction.toFixed(1)}% reduction)`)
  }

  static getStats() {
    if (this.measurements.length === 0) return null

    const totalOriginal = this.measurements.reduce((sum, m) => sum + m.originalSize, 0)
    const totalOptimized = this.measurements.reduce((sum, m) => sum + m.optimizedSize, 0)
    const averageReduction = this.measurements.reduce((sum, m) => sum + m.reduction, 0) / this.measurements.length

    return {
      totalMeasurements: this.measurements.length,
      totalBytesSaved: totalOriginal - totalOptimized,
      averageReduction: averageReduction.toFixed(1),
      measurements: this.measurements.slice(-10) // Last 10 measurements
    }
  }
}
