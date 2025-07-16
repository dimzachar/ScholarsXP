export enum ErrorCode {
  // Validation errors
  INVALID_URL = 'INVALID_URL',
  INVALID_PLATFORM = 'INVALID_PLATFORM',
  MISSING_HASHTAG = 'MISSING_HASHTAG',
  CONTENT_TOO_SHORT = 'CONTENT_TOO_SHORT',
  CONTENT_TOO_LONG = 'CONTENT_TOO_LONG',
  
  // Security errors
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SPAM_DETECTED = 'SPAM_DETECTED',
  AI_CONTENT_DETECTED = 'AI_CONTENT_DETECTED',
  DUPLICATE_CONTENT = 'DUPLICATE_CONTENT',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  
  // System errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  AI_SERVICE_ERROR = 'AI_SERVICE_ERROR',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  CONTENT_FETCH_ERROR = 'CONTENT_FETCH_ERROR',
  
  // Business logic errors
  SUBMISSION_NOT_FOUND = 'SUBMISSION_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  INSUFFICIENT_REVIEWS = 'INSUFFICIENT_REVIEWS',
  REVIEW_ALREADY_EXISTS = 'REVIEW_ALREADY_EXISTS',
  SUBMISSION_ALREADY_PROCESSED = 'SUBMISSION_ALREADY_PROCESSED',
  
  // Generic errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

export interface AppError {
  code: ErrorCode
  message: string
  details?: any
  timestamp: Date
  userId?: string
  submissionId?: string
  severity: 'low' | 'medium' | 'high'
  retryable: boolean
}

export class XPSystemError extends Error {
  public readonly code: ErrorCode
  public readonly details?: any
  public readonly timestamp: Date
  public readonly userId?: string
  public readonly submissionId?: string
  public readonly severity: 'low' | 'medium' | 'high'
  public readonly retryable: boolean

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      details?: any
      userId?: string
      submissionId?: string
      severity?: 'low' | 'medium' | 'high'
      retryable?: boolean
    } = {}
  ) {
    super(message)
    this.name = 'XPSystemError'
    this.code = code
    this.details = options.details
    this.timestamp = new Date()
    this.userId = options.userId
    this.submissionId = options.submissionId
    this.severity = options.severity || 'medium'
    this.retryable = options.retryable || false
  }
}

export function createError(
  code: ErrorCode,
  message: string,
  options?: {
    details?: any
    userId?: string
    submissionId?: string
    severity?: 'low' | 'medium' | 'high'
    retryable?: boolean
  }
): XPSystemError {
  return new XPSystemError(code, message, options)
}

export function handleError(error: unknown): AppError {
  if (error instanceof XPSystemError) {
    logError(error)
    return {
      code: error.code,
      message: error.message,
      details: error.details,
      timestamp: error.timestamp,
      userId: error.userId,
      submissionId: error.submissionId,
      severity: error.severity,
      retryable: error.retryable
    }
  }

  // Handle Prisma errors
  if (error && typeof error === 'object' && 'code' in error) {
    const prismaError = error as any
    
    switch (prismaError.code) {
      case 'P2002':
        return {
          code: ErrorCode.DUPLICATE_CONTENT,
          message: 'Duplicate entry detected',
          details: prismaError,
          timestamp: new Date(),
          severity: 'medium',
          retryable: false
        }
      case 'P2025':
        return {
          code: ErrorCode.SUBMISSION_NOT_FOUND,
          message: 'Record not found',
          details: prismaError,
          timestamp: new Date(),
          severity: 'low',
          retryable: false
        }
      default:
        return {
          code: ErrorCode.DATABASE_ERROR,
          message: 'Database operation failed',
          details: prismaError,
          timestamp: new Date(),
          severity: 'high',
          retryable: true
        }
    }
  }

  // Handle generic errors
  const genericError = error instanceof Error ? error : new Error(String(error))
  
  const appError: AppError = {
    code: ErrorCode.UNKNOWN_ERROR,
    message: genericError.message || 'An unexpected error occurred',
    details: { stack: genericError.stack },
    timestamp: new Date(),
    severity: 'medium',
    retryable: false
  }

  logError(appError)
  return appError
}

export function logError(error: XPSystemError | AppError) {
  const errorData = {
    code: error.code,
    message: error.message,
    details: error.details,
    timestamp: error.timestamp,
    userId: error.userId,
    submissionId: error.submissionId,
    severity: error.severity
  }

  // Log to console (in production, this would go to a proper logging service)
  console.error(`[ERROR ${error.severity.toUpperCase()}]`, errorData)

  // In a real application, you would:
  // 1. Send to logging service (e.g., Sentry, LogRocket)
  // 2. Store in error database for analysis
  // 3. Send alerts for high-severity errors
  // 4. Update metrics and monitoring dashboards
}

export function getErrorMessage(code: ErrorCode): string {
  const errorMessages: Record<ErrorCode, string> = {
    [ErrorCode.INVALID_URL]: 'The provided URL is not valid',
    [ErrorCode.INVALID_PLATFORM]: 'Only Twitter/X and Medium links are supported',
    [ErrorCode.MISSING_HASHTAG]: 'Content must include the #ScholarXP hashtag',
    [ErrorCode.CONTENT_TOO_SHORT]: 'Content is too short (minimum 50 characters)',
    [ErrorCode.CONTENT_TOO_LONG]: 'Content is too long (maximum 50,000 characters)',
    
    [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please try again later',
    [ErrorCode.SPAM_DETECTED]: 'Content appears to be spam or promotional',
    [ErrorCode.AI_CONTENT_DETECTED]: 'AI-generated content is not allowed',
    [ErrorCode.DUPLICATE_CONTENT]: 'This content has already been submitted',
    [ErrorCode.UNAUTHORIZED_ACCESS]: 'You are not authorized to perform this action',
    
    [ErrorCode.DATABASE_ERROR]: 'Database operation failed. Please try again',
    [ErrorCode.AI_SERVICE_ERROR]: 'AI evaluation service is temporarily unavailable',
    [ErrorCode.EXTERNAL_API_ERROR]: 'External service is temporarily unavailable',
    [ErrorCode.CONTENT_FETCH_ERROR]: 'Failed to fetch content from the provided URL',
    
    [ErrorCode.SUBMISSION_NOT_FOUND]: 'Submission not found',
    [ErrorCode.USER_NOT_FOUND]: 'User not found',
    [ErrorCode.INSUFFICIENT_REVIEWS]: 'Not enough peer reviews to finalize XP',
    [ErrorCode.REVIEW_ALREADY_EXISTS]: 'You have already reviewed this submission',
    [ErrorCode.SUBMISSION_ALREADY_PROCESSED]: 'This submission has already been processed',
    
    [ErrorCode.UNKNOWN_ERROR]: 'An unexpected error occurred',
    [ErrorCode.VALIDATION_ERROR]: 'Validation failed',
    [ErrorCode.INTERNAL_ERROR]: 'Internal server error'
  }

  return errorMessages[code] || 'An error occurred'
}

export function isRetryableError(error: AppError): boolean {
  const retryableCodes = [
    ErrorCode.DATABASE_ERROR,
    ErrorCode.AI_SERVICE_ERROR,
    ErrorCode.EXTERNAL_API_ERROR,
    ErrorCode.CONTENT_FETCH_ERROR
  ]

  return error.retryable || retryableCodes.includes(error.code)
}

export function shouldNotifyUser(error: AppError): boolean {
  // Don't notify users about system errors they can't fix
  const systemOnlyErrors = [
    ErrorCode.DATABASE_ERROR,
    ErrorCode.INTERNAL_ERROR
  ]

  return !systemOnlyErrors.includes(error.code)
}

export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000
): Promise<T> {
  let lastError: any

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      
      const appError = handleError(error)
      
      if (!isRetryableError(appError) || attempt === maxRetries) {
        throw error
      }

      // Exponential backoff
      const delay = delayMs * Math.pow(2, attempt - 1)
      await new Promise(resolve => setTimeout(resolve, delay))
      
      console.log(`Retrying operation (attempt ${attempt + 1}/${maxRetries}) after ${delay}ms`)
    }
  }

  throw lastError
}

