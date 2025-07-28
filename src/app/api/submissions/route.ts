/**
 * Submissions API Route - MIGRATED to Standardized Error Handling
 *
 * Part of the API Error Handling Standardization Initiative
 *
 * Changes Applied:
 * - Added withErrorHandling wrapper
 * - Standardized error response format
 * - Added request ID propagation
 * - Replaced manual error handling with custom error classes
 */

import { detectPlatform, getWeekNumber } from '@/lib/utils'
import { withPermission, withAuth, AuthenticatedRequest } from '@/lib/auth-middleware'
import { submissionProcessingQueue } from '@/lib/submission-processing-queue'
import { createServiceClient } from '@/lib/supabase-server'
import { submissionService } from '@/lib/database'
import { enhancedDuplicateDetectionService } from '@/lib/enhanced-duplicate-detection'
import {
  withErrorHandling,
  createSuccessResponse,
  validateRequiredFields,
  validateUrl
} from '@/lib/api-middleware'
import {
  ValidationError,
  ConflictError,
  BusinessLogicError
} from '@/lib/api-error-handler'

/**
 * Fast submission endpoint - provides immediate response while queuing heavy operations
 * Target response time: < 3 seconds
 */
export const POST = withPermission('submit_content')(
  withErrorHandling(async (request: AuthenticatedRequest) => {
    const startTime = Date.now()

    const { url } = await request.json()

    // ========================================
    // FAST OPERATIONS ONLY (< 2 seconds total)
    // ========================================

    // 1. Basic URL validation (< 100ms)
    validateRequiredFields({ url }, ['url'])
    validateUrl(url)

    // 2. Platform detection (< 100ms)
    const platform = detectPlatform(url)
    if (!platform) {
      throw new ValidationError(
        'Platform not supported. Supported platforms: Twitter/X, Medium, Reddit, Notion, LinkedIn, Discord, Telegram',
        {
          supportedPlatforms: ['Twitter/X', 'Medium', 'Reddit', 'Notion', 'LinkedIn', 'Discord', 'Telegram'],
          detectedPlatform: null
        }
      )
    }

    console.log(`⚡ Fast submission processing: ${url} (platform: ${platform})`)

    // 3. Fast URL duplicate check using unified service (< 500ms)
    console.log(`🔍 Fast duplicate check for: ${url}`)
    const duplicateCheck = await enhancedDuplicateDetectionService.checkForDuplicate(
      url,
      null, // No content data needed for URL_ONLY mode
      request.user!.id,
      'URL_ONLY' // Fast mode - only check URL duplicates
    )

    if (duplicateCheck.isDuplicate) {
      console.log(`❌ Fast duplicate check failed: ${duplicateCheck.duplicateType}`)
      throw new ConflictError(duplicateCheck.message, {
        duplicateType: duplicateCheck.duplicateType,
        duplicateSource: duplicateCheck.duplicateSource
      })
    }

    console.log(`✅ Fast duplicate check passed - URL is unique`)

    // 4. Create submission record with PROCESSING status (< 200ms)
    const supabase = createServiceClient()
    const weekNumber = getWeekNumber()
    const { data: submission, error: submissionError } = await supabase
      .from('Submission')
      .insert({
        userId: request.user!.id,
        url,
        platform,
        taskTypes: [], // Will be populated during background processing
        aiXp: 0,
        weekNumber,
        status: 'PROCESSING' // New fast flow status
      })
      .select()
      .single()

    if (submissionError || !submission) {
      console.error('❌ Error creating submission:', submissionError)
      throw new BusinessLogicError('Failed to create submission', {
        error: submissionError?.message,
        code: submissionError?.code
      })
    }

    // 5. Queue for background processing (< 100ms)
    try {
      await submissionProcessingQueue.queueSubmission(submission.id, 'NORMAL')
      console.log(`📥 Queued submission ${submission.id} for background processing`)
    } catch (queueError) {
      console.error(`❌ Failed to queue submission ${submission.id}:`, queueError)
      // Don't fail the submission - mark for manual processing
      await supabase
        .from('Submission')
        .update({ status: 'FLAGGED' })
        .eq('id', submission.id)
    }

    // 6. Return immediate success response
    const responseTime = Date.now() - startTime
    console.log(`⚡ Fast submission complete: ${submission.id} in ${responseTime}ms`)

    return createSuccessResponse({
      message: 'Submission received and is being processed',
      submissionId: submission.id,
      status: 'PROCESSING',
      estimatedProcessingTime: '1-3 minutes',
      trackingUrl: `/submissions/${submission.id}/status`,
      responseTime: `${responseTime}ms`
    })
  })
)

export const GET = withAuth(
  withErrorHandling(async (request: AuthenticatedRequest) => {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    const userOnly = searchParams.get('userOnly') === 'true'

    let submissions

    if (userOnly || request.userProfile!.role === 'USER') {
      // Users can only see their own submissions
      submissions = await submissionService.findManyByUser(request.user!.id, limit)
    } else {
      // Reviewers and admins can see all submissions
      submissions = await submissionService.findManyWithUser(limit)
    }

    return createSuccessResponse({
      submissions,
      userRole: request.userProfile!.role
    })
  })
)

