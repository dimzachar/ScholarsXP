import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit } from '@/lib/security'
import { verifyAuthToken } from '@/lib/auth-middleware'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Create response
  const response = NextResponse.next()

  // Disable CSP completely for development and add cache-busting headers
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  response.headers.set('Pragma', 'no-cache')
  response.headers.set('Expires', '0')

  // Protected routes that require authentication
  const protectedRoutes = ['/dashboard', '/admin', '/profile', '/submissions']

  if (protectedRoutes.some(route => pathname.startsWith(route))) {
    // Check if this is an OAuth callback (has code parameter)
    const url = new URL(request.url)
    const hasAuthCode = url.searchParams.has('code')

    // If it's an OAuth callback, let it through to be processed by the client
    if (hasAuthCode) {
      // OAuth callback detected, allowing through to client
      return response
    }

    const token = request.cookies.get('sb-access-token')?.value

    if (!token) {
      // No access token found, redirecting to login
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Verify JWT and get user role
    const { user, error } = await verifyAuthToken(token)
    if (error || !user) {
      // Token verification failed, redirecting to login
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // Role-based route protection
    if (pathname.startsWith('/admin') && user.role !== 'ADMIN') {
      // Admin access denied, redirecting to dashboard
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // User authenticated successfully (log removed to reduce console noise)
  }

  // Apply rate limiting to API routes
  const shouldRateLimit = process.env.NODE_ENV === 'production' || process.env.RATE_LIMIT_ENABLED === 'true'
  if (pathname.startsWith('/api/') && shouldRateLimit) {
    // Allowlist essential auth/session endpoints to prevent auth loops
    const rateLimitBypassPaths = [
      '/api/auth/session', // Supabase session cookie persistence
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
    // Use the first two path segments as endpoint key, e.g. /api/notifications
    const segments = pathname.split('/').filter(Boolean)
    const endpointKey = segments.length >= 2 ? `/api/${segments[1]}` : '/api'
    let endpointType = endpointKey

    // Tuned limits by endpoint
    if (endpointKey === '/api/submissions') {
      maxRequests = 10 // write-heavy
    } else if (endpointKey === '/api/peer-reviews') {
      maxRequests = 20
    } else if (endpointKey === '/api/admin') {
      maxRequests = 100
    } else if (endpointKey === '/api/notifications') {
      // Higher allowance for polling/read operations
      maxRequests = 300
    } else if (endpointKey === '/api/merge') {
      // Isolate merge traffic with its own bucket
      endpointType = '/api/merge:initiate'
      maxRequests = 6
    }

    const rateLimitPassed = await checkRateLimit(clientIP, maxRequests, windowMs, endpointType)
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
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}

