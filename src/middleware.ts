import { NextRequest, NextResponse } from 'next/server'
import { checkEdgeRateLimit } from '@/lib/edge-rate-limit'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Create response
  const response = NextResponse.next()

  // Always bypass middleware for Next.js internals and favicon
  // Prevents accidental interception of dev HMR, flight, data, and static assets
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon.ico')
  ) {
    return response
  }

  // Disable CSP completely for development and add cache-busting headers
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  response.headers.set('Pragma', 'no-cache')
  response.headers.set('Expires', '0')

  // Protected routes - authentication is handled client-side by Privy
  // Admin role protection is handled by API routes via X-Privy-User-Id header
  // The middleware no longer checks authentication - that's done by:
  // 1. Client-side: PrivyAuthSyncContext checks Privy auth state
  // 2. API routes: auth-middleware checks X-Privy-User-Id header

  // Apply rate limiting to API routes
  const shouldRateLimit = process.env.NODE_ENV === 'production' || process.env.RATE_LIMIT_ENABLED === 'true'
  if (pathname.startsWith('/api/') && shouldRateLimit) {
    // Only apply global rate limiting to write/modify requests.
    // GET requests are handled by route-level rate limiting wrappers.
    if (request.method === 'GET') {
      return response
    }
    // Allowlist essential auth/session endpoints to prevent auth loops
    const rateLimitBypassPaths = [
      '/api/auth/session', // Supabase session cookie persistence
      '/api/notifications', // Read-heavy; handled by route-level wrapper
      '/api/admin', // Admin APIs use route-level rate limiting
      '/api/merge', // Merge endpoints use route-level strict limiter
    ]
    if (rateLimitBypassPaths.some((p) => pathname.startsWith(p))) {
      return response
    }

    // Derive a stable client identifier (first IP in x-forwarded-for)
    const fwd = request.headers.get('x-forwarded-for') || ''
    const ipFromHeader = fwd.split(',')[0]?.trim()
    const clientIP = request.ip || ipFromHeader || 'unknown'

    // Route-specific limits (per-path to avoid cross-endpoint coupling)
    // Defaults
    let maxRequests = 60 // 60 RPM per path
    const windowMs = 60_000
    // Derive endpoint key to avoid cross-endpoint coupling
    // Default: first two segments (e.g., /api/notifications)
    const segments = pathname.split('/').filter(Boolean)
    let endpointKey = segments.length >= 2 ? `/api/${segments[1]}` : '/api'
    // For admin APIs, use first three segments (e.g., /api/admin/system)
    if (segments[1] === 'admin' && segments.length >= 3) {
      endpointKey = `/api/${segments[1]}/${segments[2]}`
    }
    let endpointType = endpointKey

    // Tuned limits by endpoint
    if (endpointKey === '/api/submissions') {
      maxRequests = 10 // write-heavy
    } else if (endpointKey === '/api/peer-reviews') {
      maxRequests = 20
    } else if (endpointKey === '/api/admin') {
      // Fallback for generic admin bucket (should be rare after three-segment key)
      maxRequests = 100
    } else if (endpointKey === '/api/admin/system') {
      // System operations (separate bucket from other admin APIs)
      maxRequests = 30
    } else if (endpointKey === '/api/notifications') {
      // Higher allowance for polling/read operations
      maxRequests = 300
    } else if (endpointKey === '/api/merge') {
      // Isolate merge traffic with its own bucket
      endpointType = '/api/merge:initiate'
      maxRequests = 6
    }

    const rateLimitPassed = checkEdgeRateLimit(clientIP, maxRequests, windowMs, endpointType)
    if (!rateLimitPassed) {
      return NextResponse.json(
        {
          message: 'Rate limit exceeded. Please try again later.',
          code: 'RATE_LIMIT_EXCEEDED'
        },
        { status: 429 }
      )
    }
  }

  // Configure security headers for production
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

  // Content Security Policy for enhanced security
  if (process.env.NODE_ENV === 'production') {
    // Balanced CSP: allow inline but no eval, and restrict to known origins
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self' data: blob: https:; " +
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://platform.twitter.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com data:; " +
      "img-src 'self' data: https: blob:; " +
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com; " +
      "frame-src 'self' https://platform.twitter.com https://syndication.twitter.com https://www.redditmedia.com https://embed.reddit.com https://www.notion.so https://notion.so https://notion.site https://www.notion.com https://notion.com https://www.linkedin.com https://www.youtube.com; " +
      "frame-ancestors 'none';"
    )
  } else if (process.env.DEV_CSP_ENABLED === 'true') {
    // Optional permissive CSP for development to catch regressions without breaking tools
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; " +
      "img-src 'self' data: https: blob:; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "connect-src 'self' https: wss:; " +
      "frame-src *; " +
      "frame-ancestors 'none';"
    )
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes are handled separately)
     * - _next (all internal Next.js assets and dev endpoints)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/.*|favicon.ico).*)',
  ],
}

