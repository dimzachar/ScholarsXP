/**
 * Multi-Task Classification System
 * 
 * Detects when content qualifies for multiple task types simultaneously
 * and calculates combined XP with proper weekly completion tracking.
 */

import {
  MultiTaskResult,
  QualifyingTask,
  WeeklyLimitApplication,
  MultiTaskMetadata,
  ContentData,
  ContentAnalysis,
  TaskTypeId,
  WeeklyProgress
} from '@/types/task-types'
import { 
  TASK_TYPES, 
  getTaskType, 
  canTaskTypesStack, 
  getMaxXpForTaskType,
  getAllTaskTypeIds
} from '@/lib/task-types'
import { validateSubmission } from '@/lib/content-validator'
import { getWeekNumber } from '@/lib/utils'

// ============================================================================
// Multi-Task Classification
// ============================================================================

/**
 * Analyze content and determine all qualifying task types with XP calculation
 */
export async function classifyMultiTask(
  contentData: ContentData,
  userId: string,
  aiAnalysis?: ContentAnalysis
): Promise<MultiTaskResult> {
  // 1. Get all potentially qualifying task types
  const potentialTaskTypes = await detectPotentialTaskTypes(contentData, aiAnalysis)
  
  // 2. Validate each task type
  const qualifyingTasks: QualifyingTask[] = []
  
  for (const taskTypeId of potentialTaskTypes) {
    const validation = await validateSubmission(contentData, userId, [taskTypeId])
    
    if (validation.isValid) {
      const xpAwarded = calculateTaskTypeXP(taskTypeId, contentData, aiAnalysis)
      const confidence = aiAnalysis?.confidence || 0.8
      
      qualifyingTasks.push({
        taskType: taskTypeId,
        xpAwarded,
        reason: generateTaskTypeReason(taskTypeId, contentData, aiAnalysis),
        confidence
      })
    }
  }

  // 3. Apply weekly limits and calculate final XP
  const weeklyLimitsApplied = await applyWeeklyLimits(userId, qualifyingTasks)
  
  // 4. Calculate total XP
  const totalXp = weeklyLimitsApplied.reduce((sum, limit) => sum + limit.cappedXp, 0)
  
  // 5. Generate metadata
  const metadata = generateMultiTaskMetadata(contentData, aiAnalysis, qualifyingTasks)

  return {
    qualifyingTasks,
    totalXp,
    weeklyLimitsApplied,
    metadata
  }
}

/**
 * Detect potential task types based on content characteristics
 */
async function detectPotentialTaskTypes(
  contentData: ContentData,
  aiAnalysis?: ContentAnalysis
): Promise<TaskTypeId[]> {
  const potentialTypes: TaskTypeId[] = []

  // Use AI analysis if available
  if (aiAnalysis && aiAnalysis.taskTypes.length > 0) {
    potentialTypes.push(...(aiAnalysis.taskTypes as TaskTypeId[]))
  }

  // Heuristic-based detection as fallback/supplement
  const heuristicTypes = detectTaskTypesHeuristically(contentData)
  
  // Combine and deduplicate
  const allTypes = [...new Set([...potentialTypes, ...heuristicTypes])]
  
  return allTypes.filter(type => TASK_TYPES[type]) // Ensure valid task types
}

/**
 * Heuristic-based task type detection
 */
function detectTaskTypesHeuristically(contentData: ContentData): TaskTypeId[] {
  const types: TaskTypeId[] = []
  const content = contentData.content.toLowerCase()
  const contentLength = contentData.content.length

  // Task A: Twitter threads (5+ tweets) OR long articles on non-restricted platforms
  if (contentData.platform === 'Twitter') {
    // For Twitter, we need to check if it's a thread with 5+ tweets
    types.push('A')
  } else if (contentLength >= 2000 &&
             !['Reddit', 'Notion', 'Medium'].includes(contentData.platform)) {
    // Long articles on platforms other than Reddit/Notion/Medium qualify for Task A
    types.push('A')
  }

  // Task B: Platform article (2000+ chars) on restricted platforms only
  if (contentLength >= 2000 &&
      ['Reddit', 'Notion', 'Medium'].includes(contentData.platform)) {
    types.push('B')
  }

  // Task C: Tutorial/guide content
  if (content.includes('tutorial') || content.includes('guide') || 
      content.includes('how to') || content.includes('step by step')) {
    types.push('C')
  }

  // Task D: Protocol explanation
  if (content.includes('protocol') || content.includes('defi') || 
      content.includes('smart contract') || content.includes('blockchain')) {
    types.push('D')
  }

  // Task E: Correction bounty
  if (content.includes('correction') || content.includes('fix') || 
      content.includes('error') || content.includes('mistake')) {
    types.push('E')
  }

  // Task F: Strategy content
  if (content.includes('strategy') || content.includes('approach') || 
      content.includes('method') || content.includes('technique')) {
    types.push('F')
  }

  return types
}

/**
 * Calculate XP for a specific task type
 */
function calculateTaskTypeXP(
  taskTypeId: TaskTypeId,
  contentData: ContentData,
  aiAnalysis?: ContentAnalysis
): number {
  const taskType = getTaskType(taskTypeId)
  const { min, max } = taskType.xpRange

  // Use AI analysis for quality-based scoring if available
  if (aiAnalysis && aiAnalysis.baseXp > 0) {
    // Map AI base XP (0-100) to task type range
    const normalizedScore = Math.min(aiAnalysis.baseXp / 100, 1)
    const qualityXp = min + (normalizedScore * (max - min))
    
    // Apply originality multiplier
    const originalityMultiplier = Math.max(0.5, aiAnalysis.originalityScore || 1)
    
    return Math.round(qualityXp * originalityMultiplier)
  }

  // Fallback to heuristic scoring
  return calculateHeuristicXP(taskTypeId, contentData)
}

/**
 * Heuristic XP calculation based on content characteristics
 */
function calculateHeuristicXP(taskTypeId: TaskTypeId, contentData: ContentData): number {
  const taskType = getTaskType(taskTypeId)
  const { min, max } = taskType.xpRange
  const contentLength = contentData.content.length

  // Base score on content length and complexity
  let qualityScore = 0.7 // Default to 70% of range

  // Adjust based on content length
  if (contentLength > 3000) qualityScore = 0.9
  else if (contentLength > 2000) qualityScore = 0.8
  else if (contentLength > 1000) qualityScore = 0.7
  else if (contentLength > 500) qualityScore = 0.6
  else qualityScore = 0.5

  // Platform-specific adjustments
  if (contentData.platform === 'Medium' || contentData.platform === 'Notion') {
    qualityScore += 0.1 // Bonus for long-form platforms
  }

  // Ensure score is within bounds
  qualityScore = Math.max(0.5, Math.min(1.0, qualityScore))

  return Math.round(min + (qualityScore * (max - min)))
}

/**
 * Generate reason for task type qualification
 */
function generateTaskTypeReason(
  taskTypeId: TaskTypeId,
  contentData: ContentData,
  aiAnalysis?: ContentAnalysis
): string {
  const taskType = getTaskType(taskTypeId)
  const contentLength = contentData.content.length

  if (aiAnalysis && aiAnalysis.reasoning) {
    return `AI Analysis: ${aiAnalysis.reasoning}`
  }

  // Generate heuristic-based reason
  switch (taskTypeId) {
    case 'A':
      return contentData.platform === 'Twitter' 
        ? 'Detected as Twitter thread content'
        : `Long-form content (${contentLength} characters)`
    
    case 'B':
      return `Platform article on ${contentData.platform} (${contentLength} characters)`
    
    case 'C':
      return 'Content identified as tutorial/guide format'
    
    case 'D':
      return 'Content contains protocol explanation elements'
    
    case 'E':
      return 'Content identified as correction bounty submission'
    
    case 'F':
      return 'Content contains strategic insights'
    
    default:
      return `Qualified for ${taskType.name} based on content analysis`
  }
}

/**
 * Apply weekly limits to qualifying tasks
 */
async function applyWeeklyLimits(
  userId: string,
  qualifyingTasks: QualifyingTask[]
): Promise<WeeklyLimitApplication[]> {
  const weekNumber = getWeekNumber()
  const weeklyProgress = await getUserWeeklyProgress(userId, weekNumber)
  
  return qualifyingTasks.map(task => {
    const taskType = getTaskType(task.taskType as TaskTypeId)
    const progress = weeklyProgress.taskTypeProgress[task.taskType] || {
      completions: 0,
      xpEarned: 0,
      maxCompletions: taskType.maxCompletionsPerWeek,
      weeklyLimit: taskType.weeklyLimit
    }

    // Check if user has reached completion limit
    if (progress.completions >= taskType.maxCompletionsPerWeek) {
      return {
        taskType: task.taskType,
        originalXp: task.xpAwarded,
        cappedXp: 0,
        remainingCapacity: 0,
        completionsUsed: progress.completions,
        maxCompletions: taskType.maxCompletionsPerWeek
      }
    }

    // Check if adding this XP would exceed weekly limit
    const potentialTotal = progress.xpEarned + task.xpAwarded
    const cappedXp = Math.min(task.xpAwarded, taskType.weeklyLimit - progress.xpEarned)
    
    return {
      taskType: task.taskType,
      originalXp: task.xpAwarded,
      cappedXp: Math.max(0, cappedXp),
      remainingCapacity: Math.max(0, taskType.weeklyLimit - progress.xpEarned),
      completionsUsed: progress.completions,
      maxCompletions: taskType.maxCompletionsPerWeek
    }
  })
}

/**
 * Generate multi-task metadata
 */
function generateMultiTaskMetadata(
  contentData: ContentData,
  aiAnalysis?: ContentAnalysis,
  qualifyingTasks?: QualifyingTask[]
): MultiTaskMetadata {
  // Calculate quality multiplier based on multiple factors
  let qualityMultiplier = 1.0

  if (aiAnalysis) {
    // Base quality on AI analysis
    qualityMultiplier = Math.max(0.5, aiAnalysis.qualityScore || aiAnalysis.baseXp / 100)
    
    // Apply originality bonus
    if (aiAnalysis.originalityScore > 0.8) {
      qualityMultiplier *= 1.1
    }
  }

  // Calculate stacking bonus for multi-task content
  let stackingBonus = 0
  if (qualifyingTasks && qualifyingTasks.length > 1) {
    stackingBonus = qualifyingTasks.length * 0.05 // 5% bonus per additional task type
  }

  return {
    contentAnalysis: aiAnalysis || {
      taskTypes: qualifyingTasks?.map(t => t.taskType) || [],
      baseXp: 0,
      originalityScore: 1.0,
      reasoning: 'Heuristic analysis',
      confidence: 0.7,
      qualityScore: 0.7
    },
    stackingBonus,
    qualityMultiplier
  }
}

/**
 * Get user's weekly progress (placeholder - will integrate with database)
 */
async function getUserWeeklyProgress(userId: string, weekNumber: number): Promise<WeeklyProgress> {
  // This will be implemented with actual database queries
  // For now, return empty progress
  return {
    userId,
    weekNumber,
    year: new Date().getFullYear(),
    taskTypeProgress: {},
    totalXp: 0,
    totalSubmissions: 0
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if content can qualify for multiple task types
 */
export function canContentStackTaskTypes(taskTypes: TaskTypeId[]): boolean {
  if (taskTypes.length <= 1) return true

  // Check if all task types can stack with each other
  for (let i = 0; i < taskTypes.length; i++) {
    for (let j = i + 1; j < taskTypes.length; j++) {
      if (!canTaskTypesStack(taskTypes[i], taskTypes[j])) {
        return false
      }
    }
  }

  return true
}

/**
 * Get maximum possible XP for content across all qualifying task types
 */
export function getMaxPossibleXP(taskTypes: TaskTypeId[]): number {
  return taskTypes.reduce((total, taskType) => {
    return total + getMaxXpForTaskType(taskType)
  }, 0)
}

/**
 * Format multi-task result for display
 */
export function formatMultiTaskResult(result: MultiTaskResult): string {
  const taskSummary = result.qualifyingTasks
    .map(task => `${task.taskType}: ${task.xpAwarded} XP`)
    .join(', ')
  
  return `Total: ${result.totalXp} XP (${taskSummary})`
}
