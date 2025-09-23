/**
 * Weekly Task Tracking System
 * 
 * Tracks weekly completions per task type (max 3 each) and enforces
 * weekly XP limits with Monday-Sunday week boundaries.
 */

import {
  WeeklyProgress,
  TaskTypeProgress,
  TaskTypeId
} from '@/types/task-types'
import { TASK_TYPES } from '@/lib/task-types'
import { getWeekNumber, getWeekBoundaries } from '@/lib/utils'
import { prisma } from '@/lib/prisma'

// ============================================================================
// Weekly Progress Tracking
// ============================================================================

/**
 * Get user's weekly progress for current week
 */
export async function getCurrentWeeklyProgress(userId: string): Promise<WeeklyProgress> {
  const currentWeek = getWeekNumber()
  const currentYear = new Date().getFullYear()
  
  return await getWeeklyProgress(userId, currentWeek, currentYear)
}

/**
 * Get user's weekly progress for specific week
 */
export async function getWeeklyProgress(
  userId: string, 
  weekNumber: number, 
  year: number
): Promise<WeeklyProgress> {
  const { startDate, endDate } = getWeekBoundaries(weekNumber, year)
  
  // Get all submissions for the week
  const submissions = await prisma.submission.findMany({
    where: {
      userId,
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      status: 'FINALIZED'
    },
    select: {
      id: true,
      taskTypes: true,
      finalXp: true,
      createdAt: true,
      url: true,
      platform: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  // Initialize task type progress
  const taskTypeProgress: Record<string, TaskTypeProgress> = {}
  
  // Initialize all task types
  Object.keys(TASK_TYPES).forEach(taskTypeId => {
    const taskType = TASK_TYPES[taskTypeId as TaskTypeId]
    taskTypeProgress[taskTypeId] = {
      taskType: taskTypeId,
      completions: 0,
      maxCompletions: taskType.maxCompletionsPerWeek,
      xpEarned: 0,
      weeklyLimit: taskType.weeklyLimit,
      remainingCapacity: taskType.weeklyLimit,
      submissions: []
    }
  })

  // Process submissions and calculate progress
  let totalXp = 0
  const totalSubmissions = submissions.length

  for (const submission of submissions) {
    const submissionXp = submission.finalXp || 0
    totalXp += submissionXp

    // Process each task type for this submission
    for (const taskTypeId of submission.taskTypes) {
      if (taskTypeProgress[taskTypeId]) {
        const progress = taskTypeProgress[taskTypeId]
        
        // Increment completion count
        progress.completions += 1
        
        // Add XP (distributed evenly across task types for this submission)
        const xpPerTaskType = submissionXp / submission.taskTypes.length
        progress.xpEarned += xpPerTaskType
        
        // Update remaining capacity
        progress.remainingCapacity = Math.max(0, progress.weeklyLimit - progress.xpEarned)
        
        // Add to submissions list
        progress.submissions.push({
          submissionId: submission.id,
          xpAwarded: xpPerTaskType,
          completedAt: submission.createdAt,
          url: submission.url,
          platform: submission.platform
        })
      }
    }
  }

  return {
    userId,
    weekNumber,
    year,
    taskTypeProgress,
    totalXp,
    totalSubmissions
  }
}

/**
 * Check if user can submit for specific task types
 */
export async function canUserSubmitForTaskTypes(
  userId: string,
  taskTypeIds: TaskTypeId[]
): Promise<{ canSubmit: boolean; blockedTaskTypes: string[]; reasons: string[] }> {
  const weeklyProgress = await getCurrentWeeklyProgress(userId)
  const blockedTaskTypes: string[] = []
  const reasons: string[] = []

  for (const taskTypeId of taskTypeIds) {
    const progress = weeklyProgress.taskTypeProgress[taskTypeId]
    
    if (!progress) {
      blockedTaskTypes.push(taskTypeId)
      reasons.push(`Invalid task type: ${taskTypeId}`)
      continue
    }

    // Check completion limit
    if (progress.completions >= progress.maxCompletions) {
      blockedTaskTypes.push(taskTypeId)
      reasons.push(
        `Task ${taskTypeId}: Weekly completion limit reached (${progress.completions}/${progress.maxCompletions})`
      )
    }

    // Check XP limit (if very close to limit)
    if (progress.remainingCapacity < 10) { // Less than 10 XP remaining
      blockedTaskTypes.push(taskTypeId)
      reasons.push(
        `Task ${taskTypeId}: Weekly XP limit nearly reached (${Math.round(progress.xpEarned)}/${progress.weeklyLimit} XP)`
      )
    }
  }

  return {
    canSubmit: blockedTaskTypes.length === 0,
    blockedTaskTypes,
    reasons
  }
}

/**
 * Reserve weekly capacity for a submission (before processing)
 */
export async function reserveWeeklyCapacity(
  userId: string,
  taskTypeIds: TaskTypeId[],
  estimatedXp: number
): Promise<{ success: boolean; errors: string[] }> {
  const canSubmit = await canUserSubmitForTaskTypes(userId, taskTypeIds)
  
  if (!canSubmit.canSubmit) {
    return {
      success: false,
      errors: canSubmit.reasons
    }
  }

  // Additional check for estimated XP
  const weeklyProgress = await getCurrentWeeklyProgress(userId)
  const errors: string[] = []

  for (const taskTypeId of taskTypeIds) {
    const progress = weeklyProgress.taskTypeProgress[taskTypeId]
    const xpPerTaskType = estimatedXp / taskTypeIds.length

    if (progress.remainingCapacity < xpPerTaskType) {
      errors.push(
        `Task ${taskTypeId}: Estimated XP (${Math.round(xpPerTaskType)}) exceeds remaining capacity (${Math.round(progress.remainingCapacity)})`
      )
    }
  }

  return {
    success: errors.length === 0,
    errors
  }
}

/**
 * Update weekly progress after submission finalization
 */
export async function updateWeeklyProgress(
  userId: string,
  submissionId: string,
  taskTypeIds: TaskTypeId[],
  finalXp: number
): Promise<void> {
  // The progress will be automatically updated when we query next time
  // since it's calculated from the database submissions
  
  // We could implement caching here if needed for performance
  console.log(`Updated weekly progress for user ${userId}, submission ${submissionId}, XP: ${finalXp}`)
}

/**
 * Get weekly leaderboard
 */
export async function getWeeklyLeaderboard(
  weekNumber?: number,
  year?: number,
  limit: number = 10
): Promise<Array<{ userId: string; totalXp: number; totalSubmissions: number; rank: number }>> {
  const currentWeek = weekNumber || getWeekNumber()
  const currentYear = year || new Date().getFullYear()
  const { startDate, endDate } = getWeekBoundaries(currentWeek, currentYear)

  const leaderboard = await prisma.submission.groupBy({
    by: ['userId'],
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      status: 'FINALIZED'
    },
    _sum: {
      finalXp: true
    },
    _count: {
      id: true
    },
    orderBy: {
      _sum: {
        finalXp: 'desc'
      }
    },
    take: limit
  })

  return leaderboard.map((entry, index) => ({
    userId: entry.userId,
    totalXp: entry._sum.finalXp || 0,
    totalSubmissions: entry._count.id,
    rank: index + 1
  }))
}

/**
 * Get task type completion statistics for the week
 */
export async function getWeeklyTaskTypeStats(
  weekNumber?: number,
  year?: number
): Promise<Record<string, { completions: number; totalXp: number; avgXp: number }>> {
  const currentWeek = weekNumber || getWeekNumber()
  const currentYear = year || new Date().getFullYear()
  const { startDate, endDate } = getWeekBoundaries(currentWeek, currentYear)

  const submissions = await prisma.submission.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate
      },
      status: 'FINALIZED'
    },
    select: {
      taskTypes: true,
      finalXp: true
    }
  })

  const stats: Record<string, { completions: number; totalXp: number; avgXp: number }> = {}

  // Initialize all task types
  Object.keys(TASK_TYPES).forEach(taskTypeId => {
    stats[taskTypeId] = { completions: 0, totalXp: 0, avgXp: 0 }
  })

  // Process submissions
  for (const submission of submissions) {
    const xpPerTaskType = (submission.finalXp || 0) / submission.taskTypes.length

    for (const taskTypeId of submission.taskTypes) {
      if (stats[taskTypeId]) {
        stats[taskTypeId].completions += 1
        stats[taskTypeId].totalXp += xpPerTaskType
      }
    }
  }

  // Calculate averages
  Object.keys(stats).forEach(taskTypeId => {
    const stat = stats[taskTypeId]
    stat.avgXp = stat.completions > 0 ? stat.totalXp / stat.completions : 0
  })

  return stats
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if user has reached weekly limit for any task type
 */
export async function hasReachedWeeklyLimits(userId: string): Promise<{
  hasReachedLimits: boolean
  limitedTaskTypes: string[]
  details: Record<string, { completions: number; maxCompletions: number; xpEarned: number; weeklyLimit: number }>
}> {
  const weeklyProgress = await getCurrentWeeklyProgress(userId)
  const limitedTaskTypes: string[] = []
  const details: Record<string, { completions: number; maxCompletions: number; xpEarned: number; weeklyLimit: number }> = {}

  Object.entries(weeklyProgress.taskTypeProgress).forEach(([taskTypeId, progress]) => {
    details[taskTypeId] = {
      completions: progress.completions,
      maxCompletions: progress.maxCompletions,
      xpEarned: Math.round(progress.xpEarned),
      weeklyLimit: progress.weeklyLimit
    }

    if (progress.completions >= progress.maxCompletions || progress.remainingCapacity <= 0) {
      limitedTaskTypes.push(taskTypeId)
    }
  })

  return {
    hasReachedLimits: limitedTaskTypes.length > 0,
    limitedTaskTypes,
    details
  }
}

/**
 * Get remaining capacity for all task types
 */
export async function getRemainingCapacity(userId: string): Promise<Record<string, {
  remainingCompletions: number
  remainingXp: number
  canSubmit: boolean
}>> {
  const weeklyProgress = await getCurrentWeeklyProgress(userId)
  const capacity: Record<string, { remainingCompletions: number; remainingXp: number; canSubmit: boolean }> = {}

  Object.entries(weeklyProgress.taskTypeProgress).forEach(([taskTypeId, progress]) => {
    capacity[taskTypeId] = {
      remainingCompletions: Math.max(0, progress.maxCompletions - progress.completions),
      remainingXp: Math.max(0, progress.remainingCapacity),
      canSubmit: progress.completions < progress.maxCompletions && progress.remainingCapacity > 0
    }
  })

  return capacity
}

/**
 * Format weekly progress for display
 */
export function formatWeeklyProgress(progress: WeeklyProgress): string {
  const taskSummary = Object.entries(progress.taskTypeProgress)
    .map(([taskType, prog]) => 
      `${taskType}: ${prog.completions}/${prog.maxCompletions} (${Math.round(prog.xpEarned)}/${prog.weeklyLimit} XP)`
    )
    .join(', ')

  return `Week ${progress.weekNumber}: ${progress.totalXp} XP total. ${taskSummary}`
}
