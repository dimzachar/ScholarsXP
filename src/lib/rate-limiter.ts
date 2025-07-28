/**
 * Database-Backed Rate Limiter for API Calls
 * 
 * Implements PostgreSQL-based rate limiting for:
 * - Twitter API v2 (300 requests per 15 minutes)
 * - Reddit API (60 requests per minute)
 * - Other future API integrations
 * 
 * Uses database persistence to work in serverless environments
 */

import { prisma } from '@/lib/prisma'

interface RateLimitRecord {
  id: number
  platform: string
  endpoint: string
  requestsMade: number
  windowStart: Date
  createdAt: Date
}

/**
 * Check if we can make an API request within rate limits
 */
export async function checkRateLimit(
  platform: string,
  endpoint: string,
  maxRequests: number,
  windowMs: number,
  returnDetails: boolean = false
): Promise<boolean | RateLimitRecord> {
  const now = new Date()
  const windowStart = new Date(now.getTime() - windowMs)

  try {
    // Clean up old rate limit records first
    await cleanupOldRateLimits(platform, endpoint, windowStart)

    // Get current rate limit record for this window
    const currentRecord = await prisma.$queryRaw<RateLimitRecord[]>`
      SELECT * FROM api_rate_limits
      WHERE platform = ${platform}
      AND endpoint = ${endpoint}
      AND window_start >= ${windowStart}
      ORDER BY window_start DESC
      LIMIT 1
    `

    let requestsMade = 0
    let record: RateLimitRecord | null = null

    if (currentRecord.length > 0) {
      record = currentRecord[0]
      requestsMade = record.requestsMade

      // Check if the record is from the current window
      const recordAge = now.getTime() - record.windowStart.getTime()
      if (recordAge > windowMs) {
        // Record is too old, reset counter
        requestsMade = 0
      }
    }

    const canMakeRequest = requestsMade < maxRequests

    console.log(`🔍 Rate limit check for ${platform}/${endpoint}: ${requestsMade}/${maxRequests} requests`)

    if (returnDetails && record) {
      return record
    }

    return canMakeRequest
  } catch (error) {
    console.error(`Error checking rate limit for ${platform}/${endpoint}:`, error)
    // In case of database error, allow the request but log the issue
    return true
  }
}

/**
 * Record an API request for rate limiting
 */
export async function recordApiRequest(
  platform: string,
  endpoint: string
): Promise<void> {
  const now = new Date()
  
  try {
    // Use upsert to either create new record or increment existing one
    await prisma.$executeRaw`
      INSERT INTO api_rate_limits (platform, endpoint, requests_made, window_start, created_at)
      VALUES (${platform}, ${endpoint}, 1, ${now}, ${now})
      ON CONFLICT (platform, endpoint, window_start)
      DO UPDATE SET 
        requests_made = api_rate_limits.requests_made + 1,
        created_at = ${now}
    `

    console.log(`📊 Recorded API request: ${platform}/${endpoint}`)
  } catch (error) {
    console.error(`Error recording API request for ${platform}/${endpoint}:`, error)
    // Don't throw error here as it shouldn't block the main request
  }
}

/**
 * Clean up old rate limit records
 */
async function cleanupOldRateLimits(
  platform: string,
  endpoint: string,
  windowStart: Date
): Promise<void> {
  try {
    const result = await prisma.$executeRaw`
      DELETE FROM api_rate_limits 
      WHERE platform = ${platform} 
      AND endpoint = ${endpoint} 
      AND window_start < ${windowStart}
    `

    console.log(`🧹 Cleaned up old rate limit records for ${platform}/${endpoint}`)
  } catch (error) {
    console.error(`Error cleaning up rate limits for ${platform}/${endpoint}:`, error)
  }
}

/**
 * Get current rate limit status for a platform/endpoint
 */
export async function getRateLimitStatus(
  platform: string,
  endpoint: string,
  maxRequests: number,
  windowMs: number
): Promise<{
  requestsMade: number
  maxRequests: number
  remaining: number
  resetTime: Date
  canMakeRequest: boolean
}> {
  const now = new Date()
  const windowStart = new Date(now.getTime() - windowMs)

  try {
    const currentRecord = await prisma.$queryRaw<RateLimitRecord[]>`
      SELECT * FROM api_rate_limits 
      WHERE platform = ${platform} 
      AND endpoint = ${endpoint} 
      AND window_start >= ${windowStart}
      ORDER BY window_start DESC 
      LIMIT 1
    `

    let requestsMade = 0
    let resetTime = new Date(now.getTime() + windowMs)

    if (currentRecord.length > 0) {
      const record = currentRecord[0]
      requestsMade = record.requestsMade
      if (record.windowStart) {
        resetTime = new Date(record.windowStart.getTime() + windowMs)
      }
    }

    const remaining = Math.max(0, maxRequests - requestsMade)
    const canMakeRequest = remaining > 0

    return {
      requestsMade,
      maxRequests,
      remaining,
      resetTime,
      canMakeRequest
    }
  } catch (error) {
    console.error(`Error getting rate limit status for ${platform}/${endpoint}:`, error)
    
    // Return safe defaults in case of error
    return {
      requestsMade: 0,
      maxRequests,
      remaining: maxRequests,
      resetTime: new Date(now.getTime() + windowMs),
      canMakeRequest: true
    }
  }
}

/**
 * Reset rate limits for a platform/endpoint (admin function)
 */
export async function resetRateLimit(
  platform: string,
  endpoint: string
): Promise<void> {
  try {
    await prisma.$executeRaw`
      DELETE FROM api_rate_limits 
      WHERE platform = ${platform} 
      AND endpoint = ${endpoint}
    `

    console.log(`🔄 Reset rate limits for ${platform}/${endpoint}`)
  } catch (error) {
    console.error(`Error resetting rate limits for ${platform}/${endpoint}:`, error)
    throw error
  }
}

/**
 * Get all rate limit statuses (admin function)
 */
export async function getAllRateLimitStatuses(): Promise<{
  reddit: any
}> {
  try {
    const redditStatus = await getRateLimitStatus('reddit', 'post_fetch', 60, 60 * 1000)

    return {
      reddit: {
        ...redditStatus,
        platform: 'Reddit API',
        endpoint: 'Post Fetch',
        windowDescription: '1 minute'
      }
    }
  } catch (error) {
    console.error('Error getting all rate limit statuses:', error)
    throw error
  }
}

/**
 * Cleanup old rate limit records (maintenance function)
 */
export async function cleanupAllOldRateLimits(): Promise<void> {
  const now = new Date()
  const cutoffTime = new Date(now.getTime() - (24 * 60 * 60 * 1000)) // 24 hours ago

  try {
    const result = await prisma.$executeRaw`
      DELETE FROM api_rate_limits 
      WHERE created_at < ${cutoffTime}
    `

    console.log(`🧹 Cleaned up all old rate limit records older than 24 hours`)
  } catch (error) {
    console.error('Error cleaning up all old rate limits:', error)
    throw error
  }
}
