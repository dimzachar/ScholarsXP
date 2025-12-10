/**
 * Edge-compatible in-memory rate limiter for middleware
 * Uses a simple sliding window approach that works in Edge Runtime
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

// In-memory store - works per-instance (sufficient for Edge functions)
const store = new Map<string, RateLimitEntry>()

// Cleanup old entries periodically to prevent memory leaks
let lastCleanup = Date.now()
const CLEANUP_INTERVAL = 60_000 // 1 minute

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) {
      store.delete(key)
    }
  }
}

/**
 * Check rate limit for Edge Runtime (middleware)
 * Returns true if request is allowed, false if rate limited
 */
export function checkEdgeRateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number,
  endpointType: string
): boolean {
  cleanup()
  
  const key = `${identifier}:${endpointType}`
  const now = Date.now()
  const entry = store.get(key)
  
  // No existing entry or window expired - create new
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  
  // Increment and check
  entry.count++
  return entry.count <= maxRequests
}
