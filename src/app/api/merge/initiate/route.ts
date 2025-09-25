/**
 * Legacy Account Merge API Endpoint
 * 
 * Provides API access to the merge service for manual merge initiation
 * and admin tools. Supports both user-initiated and admin-initiated merges.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'
import { MergeService } from '@/lib/services/MergeService'
import { withAPIOptimization } from '@/middleware/api-optimization'

interface MergeInitiateRequest {
  realUserId: string
  discordHandle: string
  discordId?: string
  email: string
  initiatedBy?: 'SYSTEM' | 'ADMIN' | 'USER'
}

/**
 * POST /api/merge/initiate
 * Initiates a legacy account merge
 */
async function postHandler(request: NextRequest) {
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

    // Get user from auth header for authorization
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({
        error: 'Missing or invalid authorization header'
      }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const supabase = createServiceClient()
    
    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({
        error: 'Invalid or expired token'
      }, { status: 401 })
    }

    // Authorization check: users can only merge their own accounts
    // Admins can merge any account
    const { data: userProfile } = await supabase
      .from('User')
      .select('role')
      .eq('id', user.id)
      .single()

    const isAdmin = userProfile?.role === 'ADMIN'
    const isOwnAccount = user.id === body.realUserId

    if (!isAdmin && !isOwnAccount) {
      return NextResponse.json({
        error: 'Unauthorized: You can only merge your own account'
      }, { status: 403 })
    }

    // Initiate merge using the service
    const mergeService = new MergeService()
    const result = await mergeService.initiateMerge({
      realUserId: body.realUserId,
      discordHandle: body.discordHandle,
      discordId: body.discordId,
      email: body.email,
      initiatedBy: isAdmin ? 'ADMIN' : 'USER'
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
async function getHandler(request: NextRequest) {
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

    // Get user from auth header for authorization
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({
        error: 'Missing or invalid authorization header'
      }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const supabase = createServiceClient()
    
    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({
        error: 'Invalid or expired token'
      }, { status: 401 })
    }

    // Authorization check: users can only check their own status
    // Admins can check any user's status
    const { data: userProfile } = await supabase
      .from('User')
      .select('role')
      .eq('id', user.id)
      .single()

    const isAdmin = userProfile?.role === 'ADMIN'
    const isOwnAccount = user.id === userId

    if (!isAdmin && !isOwnAccount) {
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
 * Retries a failed merge
 */
async function putHandler(request: NextRequest) {
  try {
    const body: { mergeId: string } = await request.json()

    if (!body.mergeId) {
      return NextResponse.json({
        error: 'Missing mergeId'
      }, { status: 400 })
    }

    // Get user from auth header for authorization
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({
        error: 'Missing or invalid authorization header'
      }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const supabase = createServiceClient()
    
    // Verify the token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({
        error: 'Invalid or expired token'
      }, { status: 401 })
    }

    // Check if user is admin (only admins can retry merges)
    const { data: userProfile } = await supabase
      .from('User')
      .select('role')
      .eq('id', user.id)
      .single()

    if (userProfile?.role !== 'ADMIN') {
      return NextResponse.json({
        error: 'Unauthorized: Only admins can retry failed merges'
      }, { status: 403 })
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

export const POST = withAPIOptimization(postHandler, { rateLimitType: 'merge', caching: false, compression: true, performanceMonitoring: true })
export const GET = withAPIOptimization(getHandler, { rateLimitType: 'merge', caching: false, compression: true, performanceMonitoring: true })
export const PUT = withAPIOptimization(putHandler, { rateLimitType: 'merge', caching: false, compression: true, performanceMonitoring: true })
