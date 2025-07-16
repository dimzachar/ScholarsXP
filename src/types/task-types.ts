/**
 * Task Type System - TypeScript Interfaces
 * 
 * Comprehensive type definitions for the enhanced Scholars_XP task type system
 * supporting multi-task classification, universal validation, and weekly completion tracking.
 */

// ============================================================================
// Core Task Type Configuration
// ============================================================================

export interface TaskTypeConfig {
  id: string
  name: string
  description: string
  xpRange: { min: number; max: number }
  maxCompletionsPerWeek: number
  weeklyLimit: number // maxCompletionsPerWeek × xpRange.max
  validationRules: ValidationRule[]
  contentRequirements: ContentRequirement[]
  platformRestrictions?: string[] // Specific platforms required (e.g., ['Reddit', 'Notion', 'Medium'])
  canStackWith: string[] // Other task types this can combine with
}

// ============================================================================
// Validation System
// ============================================================================

export interface ValidationRule {
  type: ValidationRuleType
  description: string
  // Universal validation properties
  mention?: string // e.g., '@ScholarsOfMove'
  hashtag?: string // e.g., '#ScholarsOfMove'
  // Content-specific validation properties
  minTweets?: number
  minChars?: number
  minCount?: number
  platforms?: string[]
  requiresPartnerApp?: boolean
  requiresPartnerProtocol?: boolean
  requiresCorrection?: boolean
  requiresStrategy?: boolean
}

export type ValidationRuleType = 
  // Universal validation (applied to ALL task types)
  | 'MENTION_REQUIRED'
  | 'HASHTAG_REQUIRED'
  | 'CURRENT_WEEK_ONLY'
  | 'ORIGINAL_CONTENT'
  // Task-specific validation
  | 'TWEET_COUNT_OR_LONG_ARTICLE'
  | 'CHARACTER_COUNT'
  | 'PLATFORM_RESTRICTED'
  | 'TUTORIAL_CONTENT'
  | 'PROTOCOL_EXPLANATION'
  | 'CORRECTION_BOUNTY'
  | 'STRATEGY_CONTENT'

export interface ContentRequirement {
  platform: string // 'Twitter', 'Reddit', 'Notion', 'Medium', 'Any'
  minLength: number
  type: ContentRequirementType
}

export type ContentRequirementType = 
  | 'TWEET_COUNT'
  | 'CHARACTER_COUNT'
  | 'TUTORIAL_FORMAT'
  | 'DETAILED_EXPLANATION'
  | 'CORRECTION_FORMAT'
  | 'STRATEGY_FORMAT'

// ============================================================================
// Validation Results
// ============================================================================

export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  qualifyingTaskTypes: string[] // Multiple task types this content qualifies for
  metadata: ValidationMetadata
}

export interface ValidationError {
  code: ValidationErrorCode
  message: string
  suggestion?: string
  field?: string
}

export type ValidationErrorCode = 
  | 'MISSING_MENTION'
  | 'MISSING_HASHTAG'
  | 'INSUFFICIENT_LENGTH'
  | 'INVALID_DATE'
  | 'DUPLICATE_CONTENT'
  | 'PLATFORM_RESTRICTED'
  | 'WEEKLY_LIMIT_EXCEEDED'
  | 'CONTENT_NOT_ACCESSIBLE'
  | 'INVALID_PLATFORM'

export interface ValidationWarning {
  code: string
  message: string
}

export interface ValidationMetadata {
  hasMention: boolean
  hasHashtag: boolean
  mentionLocation?: string // Where @ScholarsOfMove was found
  hashtagLocation?: string // Where #ScholarsOfMove was found
  contentLength: number
  platform: string
  publicationDate?: Date
  weekNumber: number
  isOriginal: boolean
  weeklyCompletions: Record<string, number> // Current week completions per task type
  platformMetadata?: Record<string, any>
}

// ============================================================================
// Multi-Task Classification
// ============================================================================

export interface MultiTaskResult {
  qualifyingTasks: QualifyingTask[]
  totalXp: number
  weeklyLimitsApplied: WeeklyLimitApplication[]
  metadata: MultiTaskMetadata
}

export interface QualifyingTask {
  taskType: string
  xpAwarded: number
  reason: string
  confidence: number // 0-1 confidence score from AI evaluation
}

export interface WeeklyLimitApplication {
  taskType: string
  originalXp: number
  cappedXp: number
  remainingCapacity: number
  completionsUsed: number
  maxCompletions: number
}

export interface MultiTaskMetadata {
  contentAnalysis: ContentAnalysis
  stackingBonus?: number
  crossPlatformBonus?: number
  qualityMultiplier: number
}

// ============================================================================
// Content Analysis
// ============================================================================

export interface ContentData {
  url: string
  platform: string
  content: string
  title?: string
  metadata?: Record<string, any>
  extractedAt: Date
}

export interface ContentAnalysis {
  taskTypes: string[]
  baseXp: number
  originalityScore: number
  reasoning: string
  confidence: number
  qualityScore: number
  platformSpecificData?: Record<string, any>
}

// ============================================================================
// Weekly Progress Tracking
// ============================================================================

export interface WeeklyProgress {
  userId: string
  weekNumber: number
  year: number
  taskTypeProgress: Record<string, TaskTypeProgress>
  totalXp: number
  totalSubmissions: number
}

export interface TaskTypeProgress {
  taskType: string
  completions: number
  maxCompletions: number
  xpEarned: number
  weeklyLimit: number
  remainingCapacity: number
  submissions: WeeklySubmission[]
}

export interface WeeklySubmission {
  submissionId: string
  xpAwarded: number
  completedAt: Date
  url: string
  platform: string
}

// ============================================================================
// API Response Types
// ============================================================================

export interface TaskTypeInfoResponse {
  taskTypes: TaskTypeConfig[]
  userWeeklyProgress: WeeklyProgress
  currentWeek: {
    weekNumber: number
    year: number
    startDate: Date
    endDate: Date
  }
}

export interface ContentValidationResponse {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  metadata: ValidationMetadata
  suggestedTaskTypes?: string[]
  estimatedXp?: { min: number; max: number }
}

export interface SubmissionEvaluationResponse {
  submissionId: string
  status: 'VALIDATED' | 'REJECTED' | 'FLAGGED'
  multiTaskResult?: MultiTaskResult
  validationResult: ValidationResult
  nextSteps: string[]
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface TaskTypeSystemConfig {
  universalValidationRules: ValidationRule[]
  taskTypes: Record<string, TaskTypeConfig>
  weeklyResetDay: number // 1 = Monday, 7 = Sunday
  maxStackingBonus: number
  crossPlatformBonusMultiplier: number
}

// ============================================================================
// Utility Types
// ============================================================================

export type TaskTypeId = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export type Platform = 
  | 'Twitter'
  | 'Medium'
  | 'Reddit'
  | 'Notion'
  | 'LinkedIn'
  | 'Discord'
  | 'Telegram'
  | 'Other'

export type SubmissionStatus = 
  | 'PENDING'
  | 'VALIDATING'
  | 'AI_REVIEWED'
  | 'PEER_REVIEWED'
  | 'FINALIZED'
  | 'REJECTED'
  | 'FLAGGED'

// ============================================================================
// Error Types
// ============================================================================

export class TaskTypeValidationError extends Error {
  constructor(
    message: string,
    public code: ValidationErrorCode,
    public field?: string,
    public suggestion?: string
  ) {
    super(message)
    this.name = 'TaskTypeValidationError'
  }
}

export class WeeklyLimitExceededError extends Error {
  constructor(
    message: string,
    public taskType: string,
    public currentCompletions: number,
    public maxCompletions: number
  ) {
    super(message)
    this.name = 'WeeklyLimitExceededError'
  }
}
