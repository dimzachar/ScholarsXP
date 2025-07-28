/**
 * Error Codes - Standardized Error Classification System
 *
 * Part of the API Error Handling Standardization Initiative
 *
 * This module provides:
 * - Comprehensive error code definitions organized by HTTP status
 * - i18n-ready error message mappings
 * - Type-safe error code constants
 */

export const ERROR_CODES = {
  // Input validation (400)
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_URL: 'INVALID_URL',
  INVALID_FORMAT: 'INVALID_FORMAT',
  CONTENT_TOO_SHORT: 'CONTENT_TOO_SHORT',
  CONTENT_TOO_LONG: 'CONTENT_TOO_LONG',
  INVALID_PLATFORM: 'INVALID_PLATFORM',
  MISSING_HASHTAG: 'MISSING_HASHTAG',

  // Authentication & Authorization (401/403)
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',

  // Resources (404/409)
  NOT_FOUND: 'NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  SUBMISSION_NOT_FOUND: 'SUBMISSION_NOT_FOUND',
  REVIEW_NOT_FOUND: 'REVIEW_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  DUPLICATE_URL: 'DUPLICATE_URL',
  DUPLICATE_CONTENT: 'DUPLICATE_CONTENT',
  REVIEW_ALREADY_EXISTS: 'REVIEW_ALREADY_EXISTS',

  // Business logic (422)
  BUSINESS_ERROR: 'BUSINESS_ERROR',
  SUBMISSION_ALREADY_PROCESSED: 'SUBMISSION_ALREADY_PROCESSED',
  INSUFFICIENT_REVIEWS: 'INSUFFICIENT_REVIEWS',
  WEEKLY_LIMIT_EXCEEDED: 'WEEKLY_LIMIT_EXCEEDED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SPAM_DETECTED: 'SPAM_DETECTED',
  AI_CONTENT_DETECTED: 'AI_CONTENT_DETECTED',

  // System (500)
  SERVER_ERROR: 'SERVER_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  AI_SERVICE_ERROR: 'AI_SERVICE_ERROR',
  EXTERNAL_API_ERROR: 'EXTERNAL_API_ERROR',
  CONTENT_FETCH_ERROR: 'CONTENT_FETCH_ERROR',
  CREATION_FAILED: 'CREATION_FAILED',
  UPDATE_FAILED: 'UPDATE_FAILED',
  DELETE_FAILED: 'DELETE_FAILED'
} as const

// Error code to message mapping for i18n support
export const ERROR_MESSAGES = {
  // Input validation
  [ERROR_CODES.INVALID_INPUT]: 'error.invalid_input',
  [ERROR_CODES.MISSING_FIELD]: 'error.missing_field',
  [ERROR_CODES.INVALID_URL]: 'error.invalid_url',
  [ERROR_CODES.INVALID_FORMAT]: 'error.invalid_format',
  [ERROR_CODES.CONTENT_TOO_SHORT]: 'error.content_too_short',
  [ERROR_CODES.CONTENT_TOO_LONG]: 'error.content_too_long',
  [ERROR_CODES.INVALID_PLATFORM]: 'error.invalid_platform',
  [ERROR_CODES.MISSING_HASHTAG]: 'error.missing_hashtag',

  // Authentication & Authorization
  [ERROR_CODES.UNAUTHORIZED]: 'error.unauthorized',
  [ERROR_CODES.FORBIDDEN]: 'error.forbidden',
  [ERROR_CODES.INSUFFICIENT_PERMISSIONS]: 'error.insufficient_permissions',
  [ERROR_CODES.TOKEN_EXPIRED]: 'error.token_expired',
  [ERROR_CODES.INVALID_TOKEN]: 'error.invalid_token',

  // Resources
  [ERROR_CODES.NOT_FOUND]: 'error.not_found',
  [ERROR_CODES.USER_NOT_FOUND]: 'error.user_not_found',
  [ERROR_CODES.SUBMISSION_NOT_FOUND]: 'error.submission_not_found',
  [ERROR_CODES.REVIEW_NOT_FOUND]: 'error.review_not_found',
  [ERROR_CODES.CONFLICT]: 'error.conflict',
  [ERROR_CODES.DUPLICATE_URL]: 'error.duplicate_url',
  [ERROR_CODES.DUPLICATE_CONTENT]: 'error.duplicate_content',
  [ERROR_CODES.REVIEW_ALREADY_EXISTS]: 'error.review_already_exists',

  // Business logic
  [ERROR_CODES.BUSINESS_ERROR]: 'error.business_error',
  [ERROR_CODES.SUBMISSION_ALREADY_PROCESSED]: 'error.submission_already_processed',
  [ERROR_CODES.INSUFFICIENT_REVIEWS]: 'error.insufficient_reviews',
  [ERROR_CODES.WEEKLY_LIMIT_EXCEEDED]: 'error.weekly_limit_exceeded',
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'error.rate_limit_exceeded',
  [ERROR_CODES.SPAM_DETECTED]: 'error.spam_detected',
  [ERROR_CODES.AI_CONTENT_DETECTED]: 'error.ai_content_detected',

  // System
  [ERROR_CODES.SERVER_ERROR]: 'error.server_error',
  [ERROR_CODES.DATABASE_ERROR]: 'error.database_error',
  [ERROR_CODES.AI_SERVICE_ERROR]: 'error.ai_service_error',
  [ERROR_CODES.EXTERNAL_API_ERROR]: 'error.external_api_error',
  [ERROR_CODES.CONTENT_FETCH_ERROR]: 'error.content_fetch_error',
  [ERROR_CODES.CREATION_FAILED]: 'error.creation_failed',
  [ERROR_CODES.UPDATE_FAILED]: 'error.update_failed',
  [ERROR_CODES.DELETE_FAILED]: 'error.delete_failed'
} as const

// Type for error codes
export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES]
