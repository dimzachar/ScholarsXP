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
    const clientIP = request.ip || request.headers.get('x-forwarded-for') || 'unknown'

    // Different rate limits for different endpoints
    let maxRequests = 60 // Default: 60 requests per minute
    let windowMs = 60000 // 1 minute
    let endpointType = 'general'

    if (pathname.startsWith('/api/submissions')) {
      maxRequests = 10 // Stricter limit for submissions
      windowMs = 60000
      endpointType = 'submissions'
    } else if (pathname.startsWith('/api/peer-reviews')) {
      maxRequests = 20 // Moderate limit for reviews
      windowMs = 60000
      endpointType = 'reviews'
    } else if (pathname.startsWith('/api/admin')) {
      maxRequests = 100 // Higher limit for admin operations
      windowMs = 60000
      endpointType = 'admin'
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
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; " +
      // Allow Twitter widgets script. Inline scripts remain disallowed.
      "script-src 'self' https://cdn.jsdelivr.net https://platform.twitter.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://platform.twitter.com https://syndication.twitter.com https://api.twitter.com https://*.twimg.com https://*.twitter.com; " +
      // Allow embeds for YouTube, Twitter, Reddit, Notion, LinkedIn
      "frame-src 'self' https://platform.twitter.com https://syndication.twitter.com https://www.redditmedia.com https://embed.reddit.com https://www.notion.so https://notion.so https://notion.site https://www.notion.com https://notion.com https://www.linkedin.com; " +
      // Disallow this app from being embedded elsewhere
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

