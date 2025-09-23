/**
 * Task Type Configuration System
 * 
 * Centralized task type definitions for the enhanced Scholars_XP system
 * with new XP ranges, weekly limits, and universal validation requirements.
 */

import {
  TaskTypeConfig,
  ValidationRule,
  TaskTypeSystemConfig,
  TaskTypeId
} from '@/types/task-types'

// ============================================================================
// Universal Validation Rules (Applied to ALL Task Types)
// ============================================================================

export const UNIVERSAL_VALIDATION_RULES: ValidationRule[] = [
  {
    type: 'MENTION_REQUIRED',
    mention: '@ScholarsOfMove',
    description: 'Must mention @ScholarsOfMove in content'
  },
  {
    type: 'HASHTAG_REQUIRED',
    hashtag: '#ScholarsOfMove',
    description: 'Must include #ScholarsOfMove hashtag'
  },
  {
    type: 'CURRENT_WEEK_ONLY',
    description: 'Content must be created in current week (Monday-Sunday)'
  },
  {
    type: 'ORIGINAL_CONTENT',
    description: 'Content must be original and Movement ecosystem focused'
  }
]

// ============================================================================
// Task Type Definitions
// ============================================================================

export const TASK_TYPES: Record<TaskTypeId, TaskTypeConfig> = {
  A: {
    id: 'A',
    name: 'Thread or Long Article',
    description: 'Twitter/X thread (5+ tweets) OR Twitter Article',
    xpRange: { min: 20, max: 30 },
    maxCompletionsPerWeek: 3,
    weeklyLimit: 90, // 3 × 30
    validationRules: [
      ...UNIVERSAL_VALIDATION_RULES,
      {
        type: 'TWEET_COUNT_OR_LONG_ARTICLE',
        description: 'Must be either 5+ tweet thread OR 2000+ character article',
        minTweets: 5,
        minChars: 2000
      }
    ],
    contentRequirements: [
      { platform: 'Twitter', minLength: 5, type: 'TWEET_COUNT' },
      { platform: 'Twitter', minLength: 2000, type: 'CHARACTER_COUNT' }
    ],
    canStackWith: ['C', 'D', 'E', 'F']
  },

  B: {
    id: 'B',
    name: 'Platform Article',
    description: 'Article on Medium or Reddit (2000+ characters)',
    xpRange: { min: 75, max: 150 },
    maxCompletionsPerWeek: 3,
    weeklyLimit: 450, // 3 × 150
    validationRules: [
      ...UNIVERSAL_VALIDATION_RULES,
      {
        type: 'CHARACTER_COUNT',
        description: 'Must be at least 2000 characters',
        minCount: 2000
      },
      {
        type: 'PLATFORM_RESTRICTED',
        description: 'Must be posted on Medium or Reddit only',
        platforms: ['Reddit', 'Medium']
      }
    ],
    contentRequirements: [
      { platform: 'Reddit', minLength: 2000, type: 'CHARACTER_COUNT' },
      { platform: 'Medium', minLength: 2000, type: 'CHARACTER_COUNT' }
    ],
    platformRestrictions: ['Reddit', 'Medium'],
    canStackWith: ['A', 'C', 'D', 'E', 'F']
  },

  C: {
    id: 'C',
    name: 'Tutorial/Guide',
    description: 'Tutorial/guide on a partner app',
    xpRange: { min: 20, max: 30 },
    maxCompletionsPerWeek: 3,
    weeklyLimit: 90, // 3 × 30
    validationRules: [
      ...UNIVERSAL_VALIDATION_RULES,
      {
        type: 'TUTORIAL_CONTENT',
        description: 'Must be tutorial/guide content about partner applications',
        requiresPartnerApp: true
      }
    ],
    contentRequirements: [
      { platform: 'Any', minLength: 0, type: 'TUTORIAL_FORMAT' }
    ],
    canStackWith: ['A', 'B', 'D', 'E', 'F']
  },

  D: {
    id: 'D',
    name: 'Protocol Explanation',
    description: 'Detailed explanation of partner protocol',
    xpRange: { min: 50, max: 75 },
    maxCompletionsPerWeek: 3,
    weeklyLimit: 225, // 3 × 75
    validationRules: [
      ...UNIVERSAL_VALIDATION_RULES,
      {
        type: 'PROTOCOL_EXPLANATION',
        description: 'Must explain partner protocol functionality and usage',
        requiresPartnerProtocol: true
      }
    ],
    contentRequirements: [
      { platform: 'Any', minLength: 0, type: 'DETAILED_EXPLANATION' }
    ],
    canStackWith: ['A', 'B', 'C', 'E', 'F']
  },

  E: {
    id: 'E',
    name: 'Correction Bounty',
    description: 'Correction bounty submission',
    xpRange: { min: 50, max: 75 },
    maxCompletionsPerWeek: 3,
    weeklyLimit: 225, // 3 × 75
    validationRules: [
      ...UNIVERSAL_VALIDATION_RULES,
      {
        type: 'CORRECTION_BOUNTY',
        description: 'Must be a valid correction bounty submission',
        requiresCorrection: true
      }
    ],
    contentRequirements: [
      { platform: 'Any', minLength: 0, type: 'CORRECTION_FORMAT' }
    ],
    canStackWith: ['A', 'B', 'C', 'D', 'F']
  },

  F: {
    id: 'F',
    name: 'Strategies',
    description: 'Strategic content about Movement ecosystem',
    xpRange: { min: 50, max: 75 },
    maxCompletionsPerWeek: 3,
    weeklyLimit: 225, // 3 × 75
    validationRules: [
      ...UNIVERSAL_VALIDATION_RULES,
      {
        type: 'STRATEGY_CONTENT',
        description: 'Must contain strategic insights about Movement ecosystem',
        requiresStrategy: true
      }
    ],
    contentRequirements: [
      { platform: 'Any', minLength: 0, type: 'STRATEGY_FORMAT' }
    ],
    canStackWith: ['A', 'B', 'C', 'D', 'E']
  }
}

// ============================================================================
// System Configuration
// ============================================================================

export const TASK_TYPE_SYSTEM_CONFIG: TaskTypeSystemConfig = {
  universalValidationRules: UNIVERSAL_VALIDATION_RULES,
  taskTypes: TASK_TYPES,
  weeklyResetDay: 1, // Monday = 1, Sunday = 7
  maxStackingBonus: 0.1, // 10% bonus for multi-task content
  crossPlatformBonusMultiplier: 1.0 // No bonus for cross-platform (same content earns separate XP)
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get task type configuration by ID
 */
export function getTaskType(taskTypeId: TaskTypeId): TaskTypeConfig {
  const taskType = TASK_TYPES[taskTypeId]
  if (!taskType) {
    throw new Error(`Invalid task type ID: ${taskTypeId}`)
  }
  return taskType
}

/**
 * Get all task type IDs
 */
export function getAllTaskTypeIds(): TaskTypeId[] {
  return Object.keys(TASK_TYPES) as TaskTypeId[]
}

/**
 * Get task types that can stack with the given task type
 */
export function getStackableTaskTypes(taskTypeId: TaskTypeId): TaskTypeId[] {
  const taskType = getTaskType(taskTypeId)
  return taskType.canStackWith as TaskTypeId[]
}

/**
 * Check if two task types can stack together
 */
export function canTaskTypesStack(taskType1: TaskTypeId, taskType2: TaskTypeId): boolean {
  const config1 = getTaskType(taskType1)
  const config2 = getTaskType(taskType2)
  
  return config1.canStackWith.includes(taskType2) && 
         config2.canStackWith.includes(taskType1)
}

/**
 * Get maximum possible XP for a task type
 */
export function getMaxXpForTaskType(taskTypeId: TaskTypeId): number {
  return getTaskType(taskTypeId).xpRange.max
}

/**
 * Get weekly limit for a task type
 */
export function getWeeklyLimitForTaskType(taskTypeId: TaskTypeId): number {
  return getTaskType(taskTypeId).weeklyLimit
}

/**
 * Get platform restrictions for a task type
 */
export function getPlatformRestrictions(taskTypeId: TaskTypeId): string[] | undefined {
  return getTaskType(taskTypeId).platformRestrictions
}

/**
 * Check if a platform is allowed for a task type
 */
export function isPlatformAllowedForTaskType(taskTypeId: TaskTypeId, platform: string): boolean {
  const restrictions = getPlatformRestrictions(taskTypeId)
  if (!restrictions) {
    return true // No restrictions means all platforms allowed
  }
  return restrictions.includes(platform)
}

/**
 * Get all task types that allow a specific platform
 */
export function getTaskTypesForPlatform(platform: string): TaskTypeId[] {
  return getAllTaskTypeIds().filter(taskTypeId => 
    isPlatformAllowedForTaskType(taskTypeId, platform)
  )
}

/**
 * Calculate total possible XP for multiple task types
 */
export function calculateMaxStackedXp(taskTypeIds: TaskTypeId[]): number {
  return taskTypeIds.reduce((total, taskTypeId) => {
    return total + getMaxXpForTaskType(taskTypeId)
  }, 0)
}

/**
 * Validate task type configuration
 */
export function validateTaskTypeConfig(config: TaskTypeConfig): boolean {
  // Check required fields
  if (!config.id || !config.name || !config.description) {
    return false
  }
  
  // Check XP range
  if (config.xpRange.min <= 0 || config.xpRange.max <= 0 || 
      config.xpRange.min > config.xpRange.max) {
    return false
  }
  
  // Check weekly limits
  if (config.maxCompletionsPerWeek <= 0 || config.weeklyLimit <= 0) {
    return false
  }
  
  // Check that weekly limit matches calculation
  if (config.weeklyLimit !== config.maxCompletionsPerWeek * config.xpRange.max) {
    return false
  }
  
  return true
}

/**
 * Get task type summary for display
 */
export function getTaskTypeSummary(taskTypeId: TaskTypeId) {
  const config = getTaskType(taskTypeId)
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    xpRange: `${config.xpRange.min}-${config.xpRange.max} XP`,
    weeklyLimit: `${config.weeklyLimit} XP/week (max ${config.maxCompletionsPerWeek} completions)`,
    platformRestrictions: config.platformRestrictions || ['All platforms'],
    canStackWith: config.canStackWith
  }
}
