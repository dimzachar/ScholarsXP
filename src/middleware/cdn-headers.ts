import { NextResponse } from 'next/server'
import { isAdmin } from '@/lib/roles'

/**
 * CDN headers middleware for optimizing cache behavior
 * Configures proper caching headers for different types of content
 */

export interface CacheConfig {
  maxAge: number              // Browser cache duration in seconds
  sMaxAge?: number           // CDN cache duration in seconds
  staleWhileRevalidate?: number // Stale-while-revalidate duration
  staleIfError?: number      // Stale-if-error duration
  mustRevalidate?: boolean   // Force revalidation
  noCache?: boolean          // Disable caching
  private?: boolean          // Private cache only
  immutable?: boolean        // Content never changes
  vary?: string[]            // Vary headers
}

/**
 * Add CDN-optimized cache headers to response
 */
export function addCDNHeaders(response: NextResponse, config: CacheConfig): NextResponse {
  const cacheControl = buildCacheControlHeader(config)
  
  // Set cache control header
  response.headers.set('Cache-Control', cacheControl)
  
  // Set CDN-specific headers
  if (config.sMaxAge !== undefined) {
    response.headers.set('CDN-Cache-Control', `max-age=${config.sMaxAge}`)
    response.headers.set('Vercel-CDN-Cache-Control', `max-age=${config.sMaxAge}`)
    response.headers.set('Cloudflare-CDN-Cache-Control', `max-age=${config.sMaxAge}`)
  }
  
  // Set Vary headers for proper cache key generation
  if (config.vary && config.vary.length > 0) {
    response.headers.set('Vary', config.vary.join(', '))
  }
  
  // Add ETag for better cache validation
  if (!response.headers.has('ETag') && !config.noCache) {
    const etag = generateETag(response)
    if (etag) {
      response.headers.set('ETag', etag)
    }
  }
  
  return response
}

/**
 * Build Cache-Control header string from config
 */
function buildCacheControlHeader(config: CacheConfig): string {
  const directives: string[] = []
  
  if (config.noCache) {
    directives.push('no-cache', 'no-store', 'must-revalidate')
    return directives.join(', ')
  }
  
  if (config.private) {
    directives.push('private')
  } else {
    directives.push('public')
  }
  
  directives.push(`max-age=${config.maxAge}`)
  
  if (config.sMaxAge !== undefined) {
    directives.push(`s-maxage=${config.sMaxAge}`)
  }
  
  if (config.staleWhileRevalidate !== undefined) {
    directives.push(`stale-while-revalidate=${config.staleWhileRevalidate}`)
  }
  
  if (config.staleIfError !== undefined) {
    directives.push(`stale-if-error=${config.staleIfError}`)
  }
  
  if (config.mustRevalidate) {
    directives.push('must-revalidate')
  }
  
  if (config.immutable) {
    directives.push('immutable')
  }
  
  return directives.join(', ')
}

/**
 * Generate ETag from response content
 */
function generateETag(response: NextResponse): string | null {
  try {
    // Simple hash-based ETag generation
    const content = response.body
    if (!content) return null
    
    // Create a simple hash of the content
    let hash = 0
    const str = content.toString()
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    
    return `"${Math.abs(hash).toString(36)}"`
  } catch {
    return null
  }
}

/**
 * Middleware wrapper for adding CDN headers
 */
export function withCDNHeaders<T extends unknown[]>(
  config: CacheConfig,
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    const response = await handler(...args)
    return addCDNHeaders(response, config)
  }
}

/**
 * Pre-configured cache settings for different content types
 */
export const CacheConfigs = {
  // Static assets (images, CSS, JS)
  static: {
    maxAge: 31536000,        // 1 year
    sMaxAge: 31536000,       // 1 year CDN
    immutable: true,
    vary: ['Accept-Encoding']
  } as CacheConfig,
  
  // API responses with frequent updates
  apiShort: {
    maxAge: 60,              // 1 minute browser
    sMaxAge: 300,            // 5 minutes CDN
    staleWhileRevalidate: 600, // 10 minutes stale
    vary: ['Accept-Encoding', 'Authorization']
  } as CacheConfig,
  
  // API responses with moderate updates
  apiMedium: {
    maxAge: 300,             // 5 minutes browser
    sMaxAge: 900,            // 15 minutes CDN
    staleWhileRevalidate: 1800, // 30 minutes stale
    vary: ['Accept-Encoding', 'Authorization']
  } as CacheConfig,
  
  // API responses with infrequent updates
  apiLong: {
    maxAge: 1800,            // 30 minutes browser
    sMaxAge: 3600,           // 1 hour CDN
    staleWhileRevalidate: 7200, // 2 hours stale
    vary: ['Accept-Encoding', 'Authorization']
  } as CacheConfig,
  
  // User-specific content
  private: {
    maxAge: 60,              // 1 minute browser
    private: true,
    mustRevalidate: true,
    vary: ['Authorization']
  } as CacheConfig,
  
  // No cache for sensitive data
  noCache: {
    maxAge: 0,
    noCache: true
  } as CacheConfig,
  
  // Analytics and metrics
  analytics: {
    maxAge: 300,             // 5 minutes browser
    sMaxAge: 600,            // 10 minutes CDN
    staleWhileRevalidate: 1200, // 20 minutes stale
    vary: ['Accept-Encoding', 'Authorization']
  } as CacheConfig,
  
  // Leaderboard data
  leaderboard: {
    maxAge: 120,             // 2 minutes browser
    sMaxAge: 300,            // 5 minutes CDN
    staleWhileRevalidate: 600, // 10 minutes stale
    vary: ['Accept-Encoding']
  } as CacheConfig,
  
  // User profiles
  profile: {
    maxAge: 60,              // 1 minute browser
    sMaxAge: 180,            // 3 minutes CDN
    staleWhileRevalidate: 360, // 6 minutes stale
    private: true,
    vary: ['Authorization']
  } as CacheConfig
}

/**
 * Smart cache configuration based on endpoint and user role
 */
export function getSmartCacheConfig(
  endpoint: string, 
  userRole?: string, 
  isPublic: boolean = false
): CacheConfig {
  // No cache for admin operations (includes DEVELOPER)
  if (isAdmin(userRole) && endpoint.includes('/admin/')) {
    return CacheConfigs.noCache
  }
  
  // Private cache for user-specific data
  if (!isPublic && endpoint.includes('/user/')) {
    return CacheConfigs.private
  }
  
  // Endpoint-specific configurations
  if (endpoint.includes('/analytics')) {
    return CacheConfigs.analytics
  }
  
  if (endpoint.includes('/leaderboard')) {
    return CacheConfigs.leaderboard
  }
  
  if (endpoint.includes('/profile')) {
    return CacheConfigs.profile
  }
  
  if (endpoint.includes('/submissions')) {
    return CacheConfigs.apiShort
  }
  
  // Default to medium caching
  return CacheConfigs.apiMedium
}

/**
 * Cache performance monitoring
 */
export class CachePerformanceMonitor {
  private static metrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    cacheBypass: 0,
    avgResponseTime: 0,
    totalResponseTime: 0
  }
  
  static recordRequest(
    cacheStatus: 'hit' | 'miss' | 'bypass',
    responseTime: number
  ) {
    this.metrics.totalRequests++
    this.metrics.totalResponseTime += responseTime
    this.metrics.avgResponseTime = this.metrics.totalResponseTime / this.metrics.totalRequests
    
    switch (cacheStatus) {
      case 'hit':
        this.metrics.cacheHits++
        break
      case 'miss':
        this.metrics.cacheMisses++
        break
      case 'bypass':
        this.metrics.cacheBypass++
        break
    }
  }
  
  static getMetrics() {
    return {
      ...this.metrics,
      cacheHitRate: this.metrics.totalRequests > 0 
        ? (this.metrics.cacheHits / this.metrics.totalRequests) * 100 
        : 0,
      cacheMissRate: this.metrics.totalRequests > 0 
        ? (this.metrics.cacheMisses / this.metrics.totalRequests) * 100 
        : 0,
      cacheBypassRate: this.metrics.totalRequests > 0 
        ? (this.metrics.cacheBypass / this.metrics.totalRequests) * 100 
        : 0
    }
  }
  
  static reset() {
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheBypass: 0,
      avgResponseTime: 0,
      totalResponseTime: 0
    }
  }
}

/**
 * Conditional caching based on response content
 */
export function getConditionalCacheConfig(
  responseSize: number,
  contentType: string,
  isError: boolean = false
): CacheConfig {
  // Don't cache errors
  if (isError) {
    return CacheConfigs.noCache
  }
  
  // Cache large responses longer to reduce server load
  if (responseSize > 100 * 1024) { // > 100KB
    return CacheConfigs.apiLong
  }
  
  // Cache medium responses moderately
  if (responseSize > 10 * 1024) { // > 10KB
    return CacheConfigs.apiMedium
  }
  
  // Cache small responses for shorter periods
  return CacheConfigs.apiShort
}
