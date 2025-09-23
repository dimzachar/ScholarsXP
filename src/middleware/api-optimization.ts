import { NextRequest, NextResponse } from 'next/server'
import { withCompression } from './compression'
import { withCDNHeaders, getSmartCacheConfig } from './cdn-headers'
import type { CacheConfig } from './cdn-headers'
import { withRateLimit, RateLimiters } from './rate-limit'
import { withServerPerformanceMonitoring } from '@/lib/server-performance-monitor'

/**
 * Comprehensive API optimization middleware
 * Combines compression, caching, rate limiting, and performance monitoring
 */

export interface OptimizationConfig {
  compression?: boolean
  caching?: boolean
  rateLimit?: boolean
  performanceMonitoring?: boolean
  rateLimitType?: 'api' | 'strict' | 'auth' | 'admin' | 'upload'
  customCacheConfig?: CacheConfig
}

/**
 * Apply all optimizations to an API handler
 */
export function withAPIOptimization<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>,
  config: OptimizationConfig = {}
) {
  const {
    compression = true,
    caching = true,
    rateLimit = true,
    performanceMonitoring = true,
    rateLimitType = 'api',
    customCacheConfig
  } = config

  let optimizedHandler = handler

  // Apply performance monitoring (outermost layer)
  if (performanceMonitoring) {
    optimizedHandler = withServerPerformanceMonitoring(optimizedHandler)
  }

  // Apply rate limiting
  if (rateLimit) {
    const rateLimiter = RateLimiters[rateLimitType] || RateLimiters.api
    optimizedHandler = withRateLimit(rateLimiter, optimizedHandler)
  }

  // Apply compression
  if (compression) {
    optimizedHandler = withCompression(optimizedHandler)
  }

  // Apply CDN headers and caching
  if (caching) {
    optimizedHandler = withSmartCaching(optimizedHandler, customCacheConfig)
  }

  return optimizedHandler
}

/**
 * Smart caching wrapper that determines cache config based on endpoint
 */
function withSmartCaching<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>,
  customConfig?: CacheConfig
) {
  return async (...args: T): Promise<NextResponse> => {
    const request = args[0] as NextRequest
    const response = await handler(...args)
    
    if (customConfig) {
      return withCDNHeaders(customConfig, async () => response)()
    }
    
    // Determine cache config based on endpoint and response
    const url = new URL(request.url)
    const endpoint = url.pathname
    const isPublic = !request.headers.get('authorization')
    
    // Extract user role if available (would need to be set by auth middleware)
    const userRole = request.headers.get('x-user-role') || undefined
    
    const cacheConfig = getSmartCacheConfig(endpoint, userRole, isPublic)
    
    return withCDNHeaders(cacheConfig, async () => response)()
  }
}

/**
 * Pre-configured optimization presets for different endpoint types
 */
export const OptimizationPresets = {
  // Public API endpoints (leaderboard, public stats)
  public: {
    compression: true,
    caching: true,
    rateLimit: true,
    performanceMonitoring: true,
    rateLimitType: 'api' as const
  },
  
  // Admin endpoints
  admin: {
    compression: true,
    caching: false, // Admin data should be fresh
    rateLimit: true,
    performanceMonitoring: true,
    rateLimitType: 'admin' as const
  },
  
  // Authentication endpoints
  auth: {
    compression: false, // Small responses, security sensitive
    caching: false,
    rateLimit: true,
    performanceMonitoring: true,
    rateLimitType: 'auth' as const
  },
  
  // User-specific endpoints
  user: {
    compression: true,
    caching: true,
    rateLimit: true,
    performanceMonitoring: true,
    rateLimitType: 'api' as const,
    customCacheConfig: {
      maxAge: 60,
      private: true,
      mustRevalidate: true
    }
  },
  
  // Analytics endpoints
  analytics: {
    compression: true,
    caching: true,
    rateLimit: true,
    performanceMonitoring: true,
    rateLimitType: 'strict' as const,
    customCacheConfig: {
      maxAge: 300,
      sMaxAge: 600,
      staleWhileRevalidate: 1200
    }
  },
  
  // File upload endpoints
  upload: {
    compression: false,
    caching: false,
    rateLimit: true,
    performanceMonitoring: true,
    rateLimitType: 'upload' as const
  }
}

/**
 * Convenience functions for common optimization patterns
 */
export const withPublicOptimization = <T extends unknown[]>(handler: (...args: T) => Promise<NextResponse>) =>
  withAPIOptimization(handler, OptimizationPresets.public)

export const withAdminOptimization = <T extends unknown[]>(handler: (...args: T) => Promise<NextResponse>) =>
  withAPIOptimization(handler, OptimizationPresets.admin)

export const withAuthOptimization = <T extends unknown[]>(handler: (...args: T) => Promise<NextResponse>) =>
  withAPIOptimization(handler, OptimizationPresets.auth)

export const withUserOptimization = <T extends unknown[]>(handler: (...args: T) => Promise<NextResponse>) =>
  withAPIOptimization(handler, OptimizationPresets.user)

export const withAnalyticsOptimization = <T extends unknown[]>(handler: (...args: T) => Promise<NextResponse>) =>
  withAPIOptimization(handler, OptimizationPresets.analytics)

export const withUploadOptimization = <T extends unknown[]>(handler: (...args: T) => Promise<NextResponse>) =>
  withAPIOptimization(handler, OptimizationPresets.upload)

/**
 * Optimization status checker
 */
export function getOptimizationStatus(request: NextRequest, response: NextResponse): {
  compression: boolean
  caching: boolean
  rateLimit: boolean
  performanceMonitoring: boolean
  responseTime?: number
  cacheHit?: boolean
  compressionRatio?: number
} {
  return {
    compression: response.headers.has('content-encoding'),
    caching: response.headers.has('cache-control'),
    rateLimit: response.headers.has('x-ratelimit-limit'),
    performanceMonitoring: response.headers.has('x-performance-monitored'),
    responseTime: response.headers.get('x-response-time') 
      ? parseInt(response.headers.get('x-response-time')!.replace('ms', ''))
      : undefined,
    cacheHit: response.headers.get('x-cache')?.includes('HIT') || false,
    compressionRatio: response.headers.get('x-compression-ratio')
      ? parseFloat(response.headers.get('x-compression-ratio')!)
      : undefined
  }
}

/**
 * Optimization health check endpoint data
 */
export function getOptimizationHealthCheck(): {
  status: 'healthy' | 'degraded' | 'unhealthy'
  optimizations: {
    compression: { enabled: boolean, working: boolean }
    caching: { enabled: boolean, working: boolean }
    rateLimit: { enabled: boolean, working: boolean }
    monitoring: { enabled: boolean, working: boolean }
  }
  performance: {
    averageResponseTime: number
    cacheHitRate: number
    compressionRate: number
    errorRate: number
  }
} {
  // This would integrate with the actual monitoring systems
  // For now, return a basic health check
  return {
    status: 'healthy',
    optimizations: {
      compression: { enabled: true, working: true },
      caching: { enabled: true, working: true },
      rateLimit: { enabled: true, working: true },
      monitoring: { enabled: true, working: true }
    },
    performance: {
      averageResponseTime: 500,
      cacheHitRate: 75,
      compressionRate: 80,
      errorRate: 2
    }
  }
}

/**
 * Middleware for enabling optimizations based on environment
 */
export function createEnvironmentOptimization() {
  const isProduction = process.env.NODE_ENV === 'production'
  
  return {
    // Disable rate limiting in development for easier testing
    rateLimit: isProduction,
    // Enable all optimizations in production
    compression: true,
    caching: true,
    performanceMonitoring: true,
    // Use stricter settings in production
    rateLimitType: isProduction ? 'strict' as const : 'api' as const
  }
}

/**
 * A/B testing for optimizations
 */
export function createOptimizationABTest(
  testName: string,
  variants: Record<string, OptimizationConfig>
) {
  return <T extends unknown[]>(handler: (...args: T) => Promise<NextResponse>) => {
    return async (...args: T): Promise<NextResponse> => {
      const request = args[0] as NextRequest
      
      // Simple hash-based variant selection
      const userId = request.headers.get('x-user-id') || request.ip || 'anonymous'
      const hash = simpleHash(userId + testName)
      const variantNames = Object.keys(variants)
      const variantIndex = hash % variantNames.length
      const variantName = variantNames[variantIndex]
      const config = variants[variantName]
      
      // Apply the selected optimization config
      const optimizedHandler = withAPIOptimization(handler, config)
      const response = await optimizedHandler(...args)
      
      // Add A/B test headers for tracking
      response.headers.set('X-AB-Test', testName)
      response.headers.set('X-AB-Variant', variantName)
      
      return response
    }
  }
}

/**
 * Simple hash function for A/B testing
 */
function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash)
}
