/**
 * Legacy Account Merge API Endpoint
 * 
 * Provides API access to the merge service for manual merge initiation
 * and admin tools. Supports both user-initiated and admin-initiated merges.
 * 
 * Uses withAuth middleware for Bearer token verification.
 */

import { NextResponse } from 'next/server'
import { MergeService } from '@/lib/services/MergeService'
import { withAPIOptimization } from '@/middleware/api-optimization'
import { withAuth, withRole, AuthenticatedRequest } from '@/lib/auth-middleware'
import { isAdmin } from '@/lib/roles'

interface MergeInitiateRequest {
  realUserId: string
  discordHandle: string
  discordId?: string
  email: string
  fallbackUsername?: string
  initiatedBy?: 'SYSTEM' | 'ADMIN' | 'USER'
}

const extractString = (value: unknown): string | undefined => {
  if (!value) return undefined
  if (Array.isArray(value)) {
    const candidate = value.find(item => typeof item === 'string' && item.trim().length > 0)
    return candidate?.trim()
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  return undefined
}

/**
 * POST /api/merge/initiate
 * Initiates a legacy account merge
 */
async function postHandler(request: AuthenticatedRequest) {
  try {
    const body: MergeInitiateRequest = await request.json()

    // Validate required fields
    if (!body.realUserId || !body.discordHandle || !body.email) {
      return NextResponse.json({
        error: 'Missing required fields: realUserId, discordHandle, and email are required'
      }, { status: 400 })
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(body.realUserId)) {
      return NextResponse.json({
        error: 'Invalid realUserId format'
      }, { status: 400 })
    }

    // User is already authenticated via withAuth middleware
    const userProfile = request.userProfile

    // Authorization check: users can only merge their own accounts
    // Admins can merge any account
    const isAdminUser = isAdmin(userProfile.role)
    const isOwnAccount = userProfile.id === body.realUserId

    if (!isAdminUser && !isOwnAccount) {
      return NextResponse.json({
        error: 'Unauthorized: You can only merge your own account'
      }, { status: 403 })
    }

    const fallbackUsername = extractString(body.fallbackUsername)

    const normalizedFallback = fallbackUsername && fallbackUsername.toLowerCase() === body.discordHandle.toLowerCase()
      ? undefined
      : fallbackUsername

    // Initiate merge using the service
    const mergeService = new MergeService()
    const result = await mergeService.initiateMerge({
      realUserId: body.realUserId,
      discordHandle: body.discordHandle,
      discordId: body.discordId,
      email: body.email,
      fallbackUsername: normalizedFallback,
      initiatedBy: isAdminUser ? 'ADMIN' : 'USER'
    })

    // Return result
    if (result.success) {
      return NextResponse.json({
        success: true,
        status: result.status,
        message: result.message,
        mergeId: result.mergeId,
        details: result.details
      })
    } else {
      return NextResponse.json({
        success: false,
        status: result.status,
        message: result.message,
        error: result.error
      }, { status: result.error?.code === 'VALIDATION_FAILED' ? 400 : 500 })
    }

  } catch (error) {
    console.error('Merge initiate API error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * GET /api/merge/initiate?userId=<uuid>
 * Gets merge status for a user
 */
async function getHandler(request: AuthenticatedRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({
        error: 'Missing userId parameter'
      }, { status: 400 })
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(userId)) {
      return NextResponse.json({
        error: 'Invalid userId format'
      }, { status: 400 })
    }

    // User is already authenticated via withAuth middleware
    const userProfile = request.userProfile

    // Authorization check: users can only check their own status
    // Admins can check any user's status
    const isAdminUser = isAdmin(userProfile.role)
    const isOwnAccount = userProfile.id === userId

    if (!isAdminUser && !isOwnAccount) {
      return NextResponse.json({
        error: 'Unauthorized: You can only check your own merge status'
      }, { status: 403 })
    }

    // Get merge status using the service
    const mergeService = new MergeService()
    const status = await mergeService.getMergeStatus(userId)

    return NextResponse.json({
      success: true,
      status: status.status,
      mergeId: status.mergeId,
      startedAt: status.startedAt,
      completedAt: status.completedAt,
      errorMessage: status.errorMessage,
      progress: status.progress
    })

  } catch (error) {
    console.error('Merge status API error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * PUT /api/merge/initiate
 * Retries a failed merge (admin only)
 */
async function putHandler(request: AuthenticatedRequest) {
  try {
    const body: { mergeId: string } = await request.json()

    if (!body.mergeId) {
      return NextResponse.json({
        error: 'Missing mergeId'
      }, { status: 400 })
    }

    // Retry merge using the service
    const mergeService = new MergeService()
    const result = await mergeService.retryFailedMerge(body.mergeId)

    // Return result
    if (result.success) {
      return NextResponse.json({
        success: true,
        status: result.status,
        message: result.message,
        mergeId: result.mergeId,
        details: result.details
      })
    } else {
      return NextResponse.json({
        success: false,
        status: result.status,
        message: result.message,
        error: result.error
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Merge retry API error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Wrap handlers with auth middleware, then API optimization
export const POST = withAPIOptimization(withAuth(postHandler), { rateLimitType: 'merge', caching: false, compression: true, performanceMonitoring: true })
export const GET = withAPIOptimization(withAuth(getHandler), { rateLimitType: 'merge', caching: false, compression: true, performanceMonitoring: true })
export const PUT = withAPIOptimization(withRole('ADMIN')(putHandler), { rateLimitType: 'merge', caching: false, compression: true, performanceMonitoring: true })
