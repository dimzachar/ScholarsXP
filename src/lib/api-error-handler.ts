/**
 * API Error Handler - Centralized Error Handling System
 *
 * Part of the API Error Handling Standardization Initiative
 *
 * This module provides:
 * - Custom error classes with proper HTTP status codes
 * - Request ID generation and propagation system
 * - Structured logging with configurable log levels
 * - Standardized error response format
 */

import { NextRequest } from 'next/server'
import { ERROR_CODES } from './error-codes'

export interface APIError {
  error: string
  code: string
  details?: Record<string, any>
}

export interface APIErrorResponse {
  success: false
  error: APIError
}

export interface ErrorContext {
  endpoint: string
  method: string
  userId?: string
  requestId: string
  userAgent?: string | null
}

// Request ID utilities
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function getOrCreateRequestId(request: NextRequest): string {
  // Check for existing X-Request-ID header for end-to-end tracing
  const existingId = request.headers.get('X-Request-ID') ||
                    request.headers.get('x-request-id')
  return existingId || generateRequestId()
}

// Custom Error Classes
export class APIError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number,
    public details?: Record<string, any>
  ) {
    super(message)
    this.name = 'APIError'
  }
}

export class ValidationError extends APIError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, ERROR_CODES.INVALID_INPUT, 400, details)
    this.name = 'ValidationError'
  }
}

export class AuthorizationError extends APIError {
  constructor(message: string = 'Access denied') {
    super(message, ERROR_CODES.FORBIDDEN, 403)
    this.name = 'AuthorizationError'
  }
}

export class NotFoundError extends APIError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, ERROR_CODES.NOT_FOUND, 404)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends APIError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, ERROR_CODES.CONFLICT, 409, details)
    this.name = 'ConflictError'
  }
}

export class BusinessLogicError extends APIError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, ERROR_CODES.BUSINESS_ERROR, 422, details)
    this.name = 'BusinessLogicError'
  }
}

// Log level configuration
const LOG_LEVEL = process.env.LOG_LEVEL || 'ERROR'
const LOG_LEVELS = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 }

export class APIErrorHandler {
  static createError(
    code: string,
    message: string,
    statusCode: number,
    details?: Record<string, any>
  ): { response: APIErrorResponse; statusCode: number } {
    return {
      response: {
        success: false,
        error: {
          error: message,
          code,
          details
        }
      },
      statusCode
    }
  }

  static logError(
    error: Error,
    context: ErrorContext,
    level: 'ERROR' | 'WARN' | 'INFO' = 'ERROR'
  ): void {
    // Check if we should log at this level
    if (LOG_LEVELS[level] > LOG_LEVELS[LOG_LEVEL as keyof typeof LOG_LEVELS]) {
      return
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      context: {
        endpoint: context.endpoint,
        method: context.method,
        userId: context.userId,
        requestId: context.requestId,
        userAgent: context.userAgent
      }
    }

    console.error(JSON.stringify(logEntry, null, 2))
  }
}
