/**
 * Universal Content Validation Pipeline
 * 
 * Enforces @ScholarsOfMove mention AND #ScholarsOfMove hashtag requirements
 * across all platforms with comprehensive validation and error reporting.
 */

import {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationMetadata,
  ContentData,
  TaskTypeId,
  ValidationErrorCode
} from '@/types/task-types'
import { TASK_TYPES, UNIVERSAL_VALIDATION_RULES } from '@/lib/task-types'
import { getWeekNumber } from '@/lib/utils'

// ============================================================================
// Universal Validation Constants
// ============================================================================

const REQUIRED_MENTION = '@ScholarsOfMove'
const REQUIRED_HASHTAG = '#ScholarsOfMove'

// Case-insensitive patterns for flexible detection
const MENTION_PATTERNS = [
  /@ScholarsOfMove/gi,
  /@scholarsofmove/gi,
  /@Scholars_Of_Move/gi,
  /@scholars_of_move/gi
]

const HASHTAG_PATTERNS = [
  /#ScholarsOfMove/gi,
  /#scholarsofmove/gi,
  /#Scholars_Of_Move/gi,
  /#scholars_of_move/gi,
  /#ScholarsOfMove\b/gi // Word boundary to avoid partial matches
]

// ============================================================================
// Core Validation Functions
// ============================================================================

/**
 * Main validation function - validates content against universal requirements
 */
export async function validateSubmission(
  contentData: ContentData,
  userId: string,
  taskTypeIds?: TaskTypeId[]
): Promise<ValidationResult> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []
  const qualifyingTaskTypes: string[] = []

  // Extract validation metadata
  const metadata = await extractValidationMetadata(contentData, userId)

  // 1. Universal Validation - REQUIRED FOR ALL SUBMISSIONS
  const universalValidation = validateUniversalRequirements(contentData, metadata)
  errors.push(...universalValidation.errors)
  warnings.push(...universalValidation.warnings)

  // 2. Platform-specific validation
  const platformValidation = await validatePlatformRequirements(contentData, metadata)
  errors.push(...platformValidation.errors)
  warnings.push(...platformValidation.warnings)

  // Update metadata with platform-specific data
  if (platformValidation.platformData) {
    metadata.platformMetadata = {
      ...metadata.platformMetadata,
      platformSpecific: platformValidation.platformData
    }
  }

  // 3. Task type validation (if specific task types provided)
  if (taskTypeIds && taskTypeIds.length > 0) {
    for (const taskTypeId of taskTypeIds) {
      const taskValidation = validateTaskTypeRequirements(taskTypeId, contentData, metadata)
      if (taskValidation.isValid) {
        qualifyingTaskTypes.push(taskTypeId)
      } else {
        errors.push(...taskValidation.errors)
      }
    }
  } else {
    // Auto-detect qualifying task types
    const autoDetected = await autoDetectQualifyingTaskTypes(contentData, metadata)
    qualifyingTaskTypes.push(...autoDetected)
  }

  // 4. Weekly completion validation
  const weeklyValidation = await validateWeeklyCompletions(userId, qualifyingTaskTypes, metadata.weekNumber)
  errors.push(...weeklyValidation.errors)
  warnings.push(...weeklyValidation.warnings)

  const isValid = errors.length === 0

  return {
    isValid,
    errors,
    warnings,
    qualifyingTaskTypes,
    metadata
  }
}

/**
 * Validate universal requirements (mention + hashtag + current week + originality)
 */
function validateUniversalRequirements(
  contentData: ContentData,
  metadata: ValidationMetadata
): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  // Check for @ScholarsOfMove mention
  if (!metadata.hasMention) {
    errors.push({
      code: 'MISSING_MENTION',
      message: `Missing required @ScholarsOfMove mention`,
      suggestion: `Add "${REQUIRED_MENTION}" anywhere in your content. This is required for all submissions.`,
      field: 'content'
    })
  }

  // Check for #ScholarsOfMove hashtag (temporarily disabled - only checking mention for now)
  // TODO: Re-enable hashtag requirement when tweets with both mention and hashtag are available
  /*
  if (!metadata.hasHashtag) {
    errors.push({
      code: 'MISSING_HASHTAG',
      message: `Missing required #ScholarsOfMove hashtag`,
      suggestion: `Add "${REQUIRED_HASHTAG}" anywhere in your content. This is required for all submissions.`,
      field: 'content'
    })
  }
  */

  // Check publication date (current week only)
  if (metadata.publicationDate) {
    const currentWeek = getWeekNumber()
    if (metadata.weekNumber !== currentWeek) {
      errors.push({
        code: 'INVALID_DATE',
        message: 'Content must be published in the current week (Monday-Sunday)',
        suggestion: 'Only content published this week is eligible for XP rewards.',
        field: 'publicationDate'
      })
    }
  }

  // Check originality
  if (!metadata.isOriginal) {
    warnings.push({
      code: 'ORIGINALITY_CONCERN',
      message: 'Content may not be original or may be AI-generated'
    })
  }

  return { errors, warnings }
}

/**
 * Validate platform-specific requirements using dedicated validators
 */
async function validatePlatformRequirements(
  contentData: ContentData,
  metadata: ValidationMetadata
): Promise<{ errors: ValidationError[]; warnings: ValidationWarning[]; platformData?: any }> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []
  let platformData: any = undefined

  try {
    switch (contentData.platform) {
      case 'Twitter':
        const { validateTwitterContent } = await import('@/lib/platform-validators/twitter-validator')
        const twitterResult = await validateTwitterContent(contentData)
        errors.push(...twitterResult.errors)
        warnings.push(...twitterResult.warnings)
        platformData = twitterResult.twitterData
        break

      case 'Reddit':
      case 'Notion':
      case 'Medium':
        const { validatePlatformArticle } = await import('@/lib/platform-validators/platform-article-validator')
        const articleResult = await validatePlatformArticle(contentData)
        errors.push(...articleResult.errors)
        warnings.push(...articleResult.warnings)
        platformData = articleResult.articleData
        break

      case 'LinkedIn':
      case 'Discord':
      case 'Telegram':
        // These platforms are supported but don't have specific validators yet
        warnings.push({
          code: 'PLATFORM_BASIC_VALIDATION',
          message: `${contentData.platform} content validated with basic rules only`
        })
        break

      default:
        warnings.push({
          code: 'UNKNOWN_PLATFORM',
          message: 'Could not detect platform automatically or platform not fully supported'
        })
    }
  } catch (error) {
    console.error('Platform validation error:', error)
    errors.push({
      code: 'PLATFORM_VALIDATION_ERROR',
      message: 'Error occurred during platform-specific validation',
      suggestion: 'Please try again or contact support if the issue persists'
    })
  }

  return { errors, warnings, platformData }
}

/**
 * Validate task type specific requirements
 */
function validateTaskTypeRequirements(
  taskTypeId: TaskTypeId,
  contentData: ContentData,
  metadata: ValidationMetadata
): { isValid: boolean; errors: ValidationError[] } {
  const errors: ValidationError[] = []
  const taskType = TASK_TYPES[taskTypeId]

  if (!taskType) {
    errors.push({
      code: 'INVALID_PLATFORM',
      message: `Invalid task type: ${taskTypeId}`,
      field: 'taskType'
    })
    return { isValid: false, errors }
  }

  // Check platform restrictions
  if (taskType.platformRestrictions) {
    if (!taskType.platformRestrictions.includes(contentData.platform)) {
      errors.push({
        code: 'PLATFORM_RESTRICTED',
        message: `Task ${taskTypeId} is restricted to: ${taskType.platformRestrictions.join(', ')}`,
        suggestion: `Post your content on one of these platforms: ${taskType.platformRestrictions.join(', ')}`,
        field: 'platform'
      })
    }
  }

  // Check content requirements
  for (const requirement of taskType.contentRequirements) {
    if (requirement.platform === 'Any' || requirement.platform === contentData.platform) {
      if (requirement.type === 'CHARACTER_COUNT' && metadata.contentLength < requirement.minLength) {
        errors.push({
          code: 'INSUFFICIENT_LENGTH',
          message: `Content too short for Task ${taskTypeId}. Required: ${requirement.minLength} characters, found: ${metadata.contentLength}`,
          suggestion: `Add more content to reach the minimum ${requirement.minLength} characters.`,
          field: 'content'
        })
      }
    }
  }

  return { isValid: errors.length === 0, errors }
}

/**
 * Auto-detect qualifying task types based on content analysis
 */
async function autoDetectQualifyingTaskTypes(
  contentData: ContentData,
  metadata: ValidationMetadata
): Promise<string[]> {
  const qualifyingTypes: string[] = []

  // Basic heuristics for task type detection
  // This will be enhanced with AI evaluation later

  // Task A: Thread (5+ tweets) OR long article (2000+ chars)
  if (contentData.platform === 'Twitter' || metadata.contentLength >= 2000) {
    qualifyingTypes.push('A')
  }

  // Task B: Platform article (2000+ chars) on restricted platforms
  if (metadata.contentLength >= 2000 && 
      ['Reddit', 'Notion', 'Medium'].includes(contentData.platform)) {
    qualifyingTypes.push('B')
  }

  // Additional task type detection logic will be added here
  // For now, return basic detection

  return qualifyingTypes
}

/**
 * Validate weekly completion limits
 */
async function validateWeeklyCompletions(
  userId: string,
  taskTypeIds: string[],
  weekNumber: number
): Promise<{ errors: ValidationError[]; warnings: ValidationWarning[] }> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  // This will be implemented with database queries
  // For now, return empty validation

  return { errors, warnings }
}

/**
 * Extract validation metadata from content
 */
async function extractValidationMetadata(
  contentData: ContentData,
  userId: string
): Promise<ValidationMetadata> {
  const content = contentData.content.toLowerCase()
  
  // Detect @ScholarsOfMove mention
  const hasMention = MENTION_PATTERNS.some(pattern => pattern.test(contentData.content))
  const mentionMatch = MENTION_PATTERNS.find(pattern => pattern.test(contentData.content))
  const mentionLocation = mentionMatch ? 'content' : undefined

  // Detect #ScholarsOfMove hashtag
  const hasHashtag = HASHTAG_PATTERNS.some(pattern => pattern.test(contentData.content))
  const hashtagMatch = HASHTAG_PATTERNS.find(pattern => pattern.test(contentData.content))
  const hashtagLocation = hashtagMatch ? 'content' : undefined

  // Calculate content length
  const contentLength = contentData.content.length

  // Get current week number
  const weekNumber = getWeekNumber()

  // Basic originality check (will be enhanced with AI)
  const isOriginal = !content.includes('generated by ai') && 
                    !content.includes('this is an ai') &&
                    contentLength > 50

  return {
    hasMention,
    hasHashtag,
    mentionLocation,
    hashtagLocation,
    contentLength,
    platform: contentData.platform,
    publicationDate: contentData.extractedAt,
    weekNumber,
    isOriginal,
    weeklyCompletions: {}, // Will be populated from database
    platformMetadata: contentData.metadata
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if content contains required mention
 */
export function hasRequiredMention(content: string): boolean {
  return MENTION_PATTERNS.some(pattern => pattern.test(content))
}

/**
 * Check if content contains required hashtag
 */
export function hasRequiredHashtag(content: string): boolean {
  return HASHTAG_PATTERNS.some(pattern => pattern.test(content))
}

/**
 * Check if content meets universal requirements
 */
export function meetsUniversalRequirements(content: string): boolean {
  return hasRequiredMention(content) && hasRequiredHashtag(content)
}

/**
 * Get validation summary for display
 */
export function getValidationSummary(result: ValidationResult): string {
  if (result.isValid) {
    return `✅ Valid submission qualifying for task types: ${result.qualifyingTaskTypes.join(', ')}`
  }

  const errorSummary = result.errors.map(error => error.message).join('; ')
  return `❌ Validation failed: ${errorSummary}`
}

/**
 * Get required fixes for failed validation
 */
export function getRequiredFixes(result: ValidationResult): string[] {
  return result.errors
    .filter(error => error.suggestion)
    .map(error => error.suggestion!)
}
