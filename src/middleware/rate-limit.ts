import { NextRequest, NextResponse } from 'next/server'
import { multiLayerCache } from '@/lib/cache/enhanced-cache'

/**
 * Rate limiting middleware using existing multi-layer cache infrastructure
 * Protects API from abuse and ensures stability in production
 */

export interface RateLimitConfig {
  windowMs: number      // Time window in milliseconds
  maxRequests: number   // Maximum requests per window
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
  keyGenerator?: (request: NextRequest) => string
  onLimitReached?: (request: NextRequest) => void
}

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  resetTime: Date
  retryAfter?: number
}

/**
 * Rate limiting middleware factory
 */
export function createRateLimit(config: RateLimitConfig) {
  return async (request: NextRequest): Promise<NextResponse | null> => {
    const result = await checkRateLimit(request, config)
    
    if (!result.success) {
      return new NextResponse(JSON.stringify({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        limit: result.limit,
        remaining: result.remaining,
        resetTime: result.resetTime.toISOString(),
        retryAfter: result.retryAfter
      }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': result.limit.toString(),
          'X-RateLimit-Remaining': result.remaining.toString(),
          'X-RateLimit-Reset': Math.ceil(result.resetTime.getTime() / 1000).toString(),
          'Retry-After': (result.retryAfter || 60).toString()
        }
      })
    }
    
    return null // Allow request to continue
  }
}

/**
 * Check rate limit for a request
 */
export async function checkRateLimit(
  request: NextRequest, 
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const key = config.keyGenerator ? config.keyGenerator(request) : getDefaultKey(request)
  const windowKey = `rate_limit:${key}:${Math.floor(Date.now() / config.windowMs)}`
  
  try {
    // Get current count from cache
    const currentCount = await multiLayerCache.get<number>(windowKey) || 0
    const remaining = Math.max(0, config.maxRequests - currentCount - 1)
    const resetTime = new Date(Math.ceil(Date.now() / config.windowMs) * config.windowMs)
    
    if (currentCount >= config.maxRequests) {
      // Rate limit exceeded
      if (config.onLimitReached) {
        config.onLimitReached(request)
      }
      
      return {
        success: false,
        limit: config.maxRequests,
        remaining: 0,
        resetTime,
        retryAfter: Math.ceil((resetTime.getTime() - Date.now()) / 1000)
      }
    }
    
    // Increment counter
    await multiLayerCache.set(windowKey, currentCount + 1, Math.ceil(config.windowMs / 1000))
    
    return {
      success: true,
      limit: config.maxRequests,
      remaining,
      resetTime
    }
    
  } catch (error) {
    console.error('Rate limit check error:', error)
    // On error, allow the request (fail open)
    return {
      success: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
      resetTime: new Date(Date.now() + config.windowMs)
    }
  }
}

/**
 * Default key generator based on IP address
 */
function getDefaultKey(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0].trim() : 
             request.headers.get('x-real-ip') || 
             request.ip || 
             'unknown'
  return ip
}

/**
 * User-based key generator (requires authentication)
 */
export function createUserKeyGenerator(getUserId: (request: NextRequest) => string | null) {
  return (request: NextRequest): string => {
    const userId = getUserId(request)
    if (userId) {
      return `user:${userId}`
    }
    return getDefaultKey(request)
  }
}

/**
 * Endpoint-specific key generator
 */
export function createEndpointKeyGenerator(endpoint: string) {
  return (request: NextRequest): string => {
    const baseKey = getDefaultKey(request)
    return `${baseKey}:${endpoint}`
  }
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const RateLimiters = {
  // General API rate limiting
  api: createRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    keyGenerator: getDefaultKey
  }),
  
  // Strict rate limiting for expensive operations
  strict: createRateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 10,
    keyGenerator: getDefaultKey
  }),
  
  // Authentication endpoints
  auth: createRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    keyGenerator: getDefaultKey
  }),
  
  // Admin operations
  admin: createRateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
    keyGenerator: getDefaultKey
  }),
  
  // File uploads
  upload: createRateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5,
    keyGenerator: getDefaultKey
  })
}

/**
 * Rate limit middleware wrapper for API routes
 */
export function withRateLimit<T extends any[]>(
  rateLimiter: (request: NextRequest) => Promise<NextResponse | null>,
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    const request = args[0] as NextRequest
    
    // Check rate limit
    const limitResponse = await rateLimiter(request)
    if (limitResponse) {
      return limitResponse
    }
    
    // Continue with original handler
    return handler(...args)
  }
}

/**
 * Rate limiting statistics and monitoring
 */
export class RateLimitMonitor {
  private static stats = {
    totalRequests: 0,
    blockedRequests: 0,
    uniqueIPs: new Set<string>(),
    topBlockedIPs: new Map<string, number>()
  }
  
  static recordRequest(ip: string, blocked: boolean) {
    this.stats.totalRequests++
    this.stats.uniqueIPs.add(ip)
    
    if (blocked) {
      this.stats.blockedRequests++
      const currentCount = this.stats.topBlockedIPs.get(ip) || 0
      this.stats.topBlockedIPs.set(ip, currentCount + 1)
    }
  }
  
  static getStats() {
    const topBlocked = Array.from(this.stats.topBlockedIPs.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }))
    
    return {
      totalRequests: this.stats.totalRequests,
      blockedRequests: this.stats.blockedRequests,
      blockRate: this.stats.totalRequests > 0 
        ? (this.stats.blockedRequests / this.stats.totalRequests) * 100 
        : 0,
      uniqueIPs: this.stats.uniqueIPs.size,
      topBlockedIPs: topBlocked
    }
  }
  
  static reset() {
    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      uniqueIPs: new Set<string>(),
      topBlockedIPs: new Map<string, number>()
    }
  }
}

/**
 * Adaptive rate limiting based on system load
 */
export class AdaptiveRateLimit {
  private static systemLoad = 0
  private static lastCheck = Date.now()
  
  static updateSystemLoad(load: number) {
    this.systemLoad = Math.max(0, Math.min(1, load))
    this.lastCheck = Date.now()
  }
  
  static getAdaptiveLimit(baseLimit: number): number {
    // Reduce limits when system load is high
    const loadFactor = 1 - (this.systemLoad * 0.5) // Reduce by up to 50%
    return Math.ceil(baseLimit * loadFactor)
  }
  
  static createAdaptiveRateLimit(config: RateLimitConfig) {
    return createRateLimit({
      ...config,
      maxRequests: this.getAdaptiveLimit(config.maxRequests)
    })
  }
}
