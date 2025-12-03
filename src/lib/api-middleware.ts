/**
 * API Middleware - Error Handling Wrapper and Utilities
 *
 * Part of the API Error Handling Standardization Initiative
 *
 * This module provides:
 * - withErrorHandling wrapper function for consistent error handling
 * - Request ID propagation through X-Request-ID headers
 * - Success response helpers
 * - Validation utilities
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  APIErrorHandler,
  APIError,
  ValidationError,
  getOrCreateRequestId,
  ErrorContext
} from './api-error-handler'
import { ERROR_CODES } from './error-codes'

/**
 * Error handling middleware wrapper for API routes
 * Provides consistent error handling, logging, and request ID propagation
 */
export function withErrorHandling<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    const request = args[0] as NextRequest
    const requestId = getOrCreateRequestId(request)

    try {
      const response = await handler(...args)
      
      // Add request ID to successful responses for tracing
      response.headers.set('X-Request-ID', requestId)
      return response
    } catch (error) {
      // Extract context for logging
      const context: ErrorContext = {
        endpoint: request.url,
        method: request.method,
        userId: (request as any).user?.id,
        requestId,
        userAgent: request.headers.get('user-agent')
      }

      // Log the error with context
      APIErrorHandler.logError(error as Error, context)

      // Handle known error types
      if (error instanceof APIError) {
        const { response, statusCode } = APIErrorHandler.createError(
          error.code,
          error.message,
          error.statusCode,
          error.details
        )

        // Add request ID to response headers for tracing
        const nextResponse = NextResponse.json(response, { status: statusCode })
        nextResponse.headers.set('X-Request-ID', requestId)
        return nextResponse
      }

      // Handle specific error types that might not be APIError instances
      if (error instanceof Error) {
        // Database constraint violations
        if ((error as any).code === '23505') {
          const { response, statusCode } = APIErrorHandler.createError(
            ERROR_CODES.CONFLICT,
            'Resource already exists',
            409,
            { constraint: (error as any).constraint }
          )
          
          const nextResponse = NextResponse.json(response, { status: statusCode })
          nextResponse.headers.set('X-Request-ID', requestId)
          return nextResponse
        }

        // Database connection errors
        if ((error as any).code === 'ECONNREFUSED' || (error as any).code === 'ENOTFOUND') {
          const { response, statusCode } = APIErrorHandler.createError(
            ERROR_CODES.DATABASE_ERROR,
            'Database connection failed',
            500
          )
          
          const nextResponse = NextResponse.json(response, { status: statusCode })
          nextResponse.headers.set('X-Request-ID', requestId)
          return nextResponse
        }

        // JSON parsing errors
        if (error.message.includes('JSON') || error.message.includes('parse')) {
          const { response, statusCode } = APIErrorHandler.createError(
            ERROR_CODES.INVALID_FORMAT,
            'Invalid JSON format',
            400
          )
          
          const nextResponse = NextResponse.json(response, { status: statusCode })
          nextResponse.headers.set('X-Request-ID', requestId)
          return nextResponse
        }
      }

      // Default to internal server error for unknown errors
      const { response, statusCode } = APIErrorHandler.createError(
        ERROR_CODES.SERVER_ERROR,
        'An unexpected error occurred',
        500
      )

      const nextResponse = NextResponse.json(response, { status: statusCode })
      nextResponse.headers.set('X-Request-ID', requestId)
      return nextResponse
    }
  }
}

/**
 * Success response helper to ensure consistent format
 */
export function createSuccessResponse(data: any, status: number = 200): NextResponse {
  return NextResponse.json({
    success: true,
    data
  }, { status })
}

/**
 * Validation helper for required fields
 */
export function validateRequiredFields(
  data: Record<string, any>, 
  requiredFields: string[]
): void {
  const missingFields = requiredFields.filter(field => 
    data[field] === undefined || data[field] === null || data[field] === ''
  )

  if (missingFields.length > 0) {
    throw new ValidationError(
      `Missing required fields: ${missingFields.join(', ')}`,
      { missingFields }
    )
  }
}

/**
 * URL validation helper
 */
export function validateUrl(url: string): void {
  try {
    new URL(url)
  } catch {
    throw new ValidationError(
      'Invalid URL format',
      { url }
    )
  }

  // Check for blocked Twitter accounts
  const { isBlockedTwitterAccount } = require('./security')
  const blockedCheck = isBlockedTwitterAccount(url)
  if (blockedCheck.blocked) {
    throw new ValidationError(
      `Submissions from @${blockedCheck.account} are not allowed. Please submit your own content.`,
      { blockedAccount: blockedCheck.account }
    )
  }
}
