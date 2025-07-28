/**
 * Enhanced Error Handling for Content Fetching
 * 
 * Provides comprehensive error handling, retry logic, and fallback strategies
 * for Twitter API, Reddit API, and other content fetching operations
 */

export interface RetryConfig {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  exponentialBackoff: boolean
  retryableErrors: string[]
}

export interface ErrorContext {
  url: string
  platform: string
  method: string
  attempt: number
  maxAttempts: number
}

export class ContentFetchError extends Error {
  public readonly code: string
  public readonly platform: string
  public readonly url: string
  public readonly isRetryable: boolean
  public readonly originalError?: Error

  constructor(
    message: string,
    code: string,
    platform: string,
    url: string,
    isRetryable: boolean = false,
    originalError?: Error
  ) {
    super(message)
    this.name = 'ContentFetchError'
    this.code = code
    this.platform = platform
    this.url = url
    this.isRetryable = isRetryable
    this.originalError = originalError
  }
}

/**
 * Default retry configurations for different platforms
 */
export const RETRY_CONFIGS: Record<string, RetryConfig> = {
  twitter: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    exponentialBackoff: true,
    retryableErrors: ['RATE_LIMIT', 'NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR']
  },
  reddit: {
    maxRetries: 3,
    baseDelayMs: 2000, // Reddit is more strict about rate limiting
    maxDelayMs: 15000,
    exponentialBackoff: true,
    retryableErrors: ['RATE_LIMIT', 'NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR']
  },
  llm: {
    maxRetries: 2,
    baseDelayMs: 1500,
    maxDelayMs: 8000,
    exponentialBackoff: true,
    retryableErrors: ['RATE_LIMIT', 'NETWORK_ERROR', 'TIMEOUT', 'SERVER_ERROR']
  },
  mcp: {
    maxRetries: 2,
    baseDelayMs: 2000,
    maxDelayMs: 12000,
    exponentialBackoff: true,
    retryableErrors: ['NETWORK_ERROR', 'TIMEOUT', 'BROWSER_ERROR']
  }
}

/**
 * Classify error types for appropriate handling
 */
export function classifyError(error: any, platform: string): {
  code: string
  isRetryable: boolean
  message: string
} {
  // Handle Twitter API errors
  if (platform === 'twitter') {
    if (error.code === 429 || error.message?.includes('rate limit')) {
      return {
        code: 'RATE_LIMIT',
        isRetryable: true,
        message: 'Twitter API rate limit exceeded'
      }
    }
    if (error.code === 404) {
      return {
        code: 'NOT_FOUND',
        isRetryable: false,
        message: 'Tweet not found or not accessible'
      }
    }
    if (error.code === 401 || error.code === 403) {
      return {
        code: 'AUTH_ERROR',
        isRetryable: false,
        message: 'Twitter API authentication failed'
      }
    }
    if (error.code >= 500) {
      return {
        code: 'SERVER_ERROR',
        isRetryable: true,
        message: 'Twitter API server error'
      }
    }
  }

  // Handle Reddit API errors
  if (platform === 'reddit') {
    if (error.statusCode === 429 || error.message?.includes('rate limit')) {
      return {
        code: 'RATE_LIMIT',
        isRetryable: true,
        message: 'Reddit API rate limit exceeded'
      }
    }
    if (error.statusCode === 404) {
      return {
        code: 'NOT_FOUND',
        isRetryable: false,
        message: 'Reddit post not found or not accessible'
      }
    }
    if (error.statusCode === 403) {
      return {
        code: 'FORBIDDEN',
        isRetryable: false,
        message: 'Reddit post is private or restricted'
      }
    }
    if (error.statusCode === 401) {
      return {
        code: 'AUTH_ERROR',
        isRetryable: false,
        message: 'Reddit API authentication failed'
      }
    }
    if (error.statusCode >= 500) {
      return {
        code: 'SERVER_ERROR',
        isRetryable: true,
        message: 'Reddit API server error'
      }
    }
  }

  // Handle network and timeout errors
  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    return {
      code: 'NETWORK_ERROR',
      isRetryable: true,
      message: 'Network connection error'
    }
  }

  if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
    return {
      code: 'TIMEOUT',
      isRetryable: true,
      message: 'Request timeout'
    }
  }

  // Default classification
  return {
    code: 'UNKNOWN_ERROR',
    isRetryable: false,
    message: error.message || 'Unknown error occurred'
  }
}

/**
 * Calculate delay for retry with exponential backoff
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig
): number {
  if (!config.exponentialBackoff) {
    return config.baseDelayMs
  }

  const delay = config.baseDelayMs * Math.pow(2, attempt - 1)
  return Math.min(delay, config.maxDelayMs)
}

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  context: ErrorContext,
  config?: Partial<RetryConfig>
): Promise<T> {
  const retryConfig = { ...RETRY_CONFIGS[context.platform], ...config }
  let lastError: Error

  for (let attempt = 1; attempt <= retryConfig.maxRetries + 1; attempt++) {
    try {
      console.log(`🔄 Attempt ${attempt}/${retryConfig.maxRetries + 1} for ${context.platform} ${context.method}: ${context.url}`)
      
      const result = await operation()
      
      if (attempt > 1) {
        console.log(`✅ Success on attempt ${attempt} for ${context.platform} ${context.method}`)
      }
      
      return result
    } catch (error: any) {
      lastError = error
      const errorInfo = classifyError(error, context.platform)
      
      console.error(`❌ Attempt ${attempt} failed for ${context.platform} ${context.method}:`, {
        url: context.url,
        code: errorInfo.code,
        message: errorInfo.message,
        isRetryable: errorInfo.isRetryable
      })

      // Don't retry if this is the last attempt or error is not retryable
      if (attempt > retryConfig.maxRetries || !errorInfo.isRetryable) {
        throw new ContentFetchError(
          errorInfo.message,
          errorInfo.code,
          context.platform,
          context.url,
          errorInfo.isRetryable,
          error
        )
      }

      // Check if this error type is retryable for this platform
      if (!retryConfig.retryableErrors.includes(errorInfo.code)) {
        throw new ContentFetchError(
          errorInfo.message,
          errorInfo.code,
          context.platform,
          context.url,
          false,
          error
        )
      }

      // Calculate and wait for retry delay
      const delay = calculateRetryDelay(attempt, retryConfig)
      console.log(`⏳ Waiting ${delay}ms before retry ${attempt + 1}`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  // This should never be reached, but TypeScript requires it
  throw lastError!
}

/**
 * Timeout wrapper for operations
 */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    operation,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(timeoutMessage))
      }, timeoutMs)
    })
  ])
}

/**
 * Log error for monitoring and debugging
 */
export function logError(error: ContentFetchError, context?: any): void {
  console.error('🚨 Content Fetch Error:', {
    message: error.message,
    code: error.code,
    platform: error.platform,
    url: error.url,
    isRetryable: error.isRetryable,
    context,
    stack: error.stack
  })

  // In production, you might want to send this to a monitoring service
  // like Sentry, DataDog, or CloudWatch
}

/**
 * Create user-friendly error messages
 */
export function createUserFriendlyErrorMessage(error: ContentFetchError): string {
  switch (error.code) {
    case 'RATE_LIMIT':
      return `${error.platform} API rate limit exceeded. Please try again in a few minutes.`
    
    case 'NOT_FOUND':
      return `Content not found. Please check that the URL is correct and the content is publicly accessible.`
    
    case 'AUTH_ERROR':
      return `Authentication failed with ${error.platform} API. Please contact support.`
    
    case 'FORBIDDEN':
      return `Content is private or restricted. Please ensure the content is publicly accessible.`
    
    case 'NETWORK_ERROR':
      return `Network connection error. Please check your internet connection and try again.`
    
    case 'TIMEOUT':
      return `Request timed out. The content source may be slow to respond. Please try again.`
    
    case 'SERVER_ERROR':
      return `${error.platform} API is experiencing issues. Please try again later.`
    
    default:
      return `Unable to fetch content from ${error.platform}. Please try again or contact support if the issue persists.`
  }
}
