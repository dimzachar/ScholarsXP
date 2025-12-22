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
import { createAuthenticatedClient } from '@/lib/supabase-server'
import { submissionService } from '@/lib/database'
import { enhancedDuplicateDetectionService } from '@/lib/enhanced-duplicate-detection'
import { withAPIOptimization } from '@/middleware/api-optimization'
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
export const POST = withAPIOptimization(
  withPermission('submit_content')(
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

    // 4. Weekly cap pre-check: max 5 non-rejected submissions this week
    const weekNumber = getWeekNumber()
    // Use authenticated client so RLS sees the user without relying on cookies
    const supabase = createAuthenticatedClient(request.user!.access_token!)
    try {
      const { count, error: capError } = await supabase
        .from('Submission')
        .select('*', { count: 'exact', head: true })
        .eq('userId', request.user!.id)
        .eq('weekNumber', weekNumber)
        .neq('status', 'REJECTED')

      if (capError) {
        console.warn('Weekly cap check failed; proceeding without cap enforcement', capError)
      } else if ((count || 0) >= 5) {
        throw new ValidationError('Weekly submission cap reached (5 total this week)', {
          weekNumber,
          cap: 5
        })
      }
    } catch (capCheckErr) {
      if (capCheckErr instanceof ValidationError) throw capCheckErr
      console.warn('Weekly cap check encountered an error; proceeding', capCheckErr)
    }

    // 5. Create submission record with PROCESSING status (< 200ms)
    const insertPayload = {
      userId: request.user!.id,
      url,
      platform,
      taskTypes: [], // Will be populated during background processing
      aiXp: 0,
      weekNumber,
      status: 'PROCESSING' as const // New fast flow status
    }

    const debugPayload = {
      userId: request.user!.id,
      platform,
      weekNumber,
      urlLength: url.length,
      urlPreview: url.slice(0, 200)
    }
    console.log('Submission insert attempt', debugPayload)

    const { data: submissionData, error: submissionError } = await supabase
      .from('Submission')
      .insert(insertPayload)
      .select()
      .single()

    let submission = submissionData
    let insertError = submissionError

    if (insertError) {
      console.error('Submission insert error', {
        message: insertError.message,
        code: insertError.code,
        details: (insertError as any)?.details,
        hint: (insertError as any)?.hint,
        routine: (insertError as any)?.routine
      })
    }

    if (
      insertError?.message?.includes('invalid input value for enum "SubmissionStatus"') &&
      insertPayload.status === 'PROCESSING'
    ) {
      console.warn('Submission status PROCESSING unsupported - falling back to PENDING')

      const { data: fallbackSubmission, error: fallbackError } = await supabase
        .from('Submission')
        .insert({
          ...insertPayload,
          status: 'PENDING'
        })
        .select()
        .single()

      if (fallbackError) {
        console.error('Submission fallback insert error', {
          message: fallbackError.message,
          code: fallbackError.code,
          details: (fallbackError as any)?.details,
          hint: (fallbackError as any)?.hint,
          routine: (fallbackError as any)?.routine
        })
      } else {
        console.log('Submission fallback insert succeeded', {
          submissionId: fallbackSubmission?.id
        })
      }

      submission = fallbackSubmission
      insertError = fallbackError
    }

    if (insertError || !submission) {
      console.error('❌ Error creating submission:', insertError)
      
      // Check if it's a unique constraint violation (duplicate URL)
      if (insertError?.code === '23505' || insertError?.message?.includes('duplicate key') || insertError?.message?.includes('unique constraint')) {
        throw new ConflictError('This URL has already been submitted', {
          duplicateType: 'URL_DUPLICATE',
          error: insertError?.message
        })
      }
      
      throw new BusinessLogicError('Failed to create submission', {
        error: insertError?.message,
        code: insertError?.code
      })
    }

    // 6. Queue for background processing (< 100ms)
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

    // 7. Return immediate success response
    const responseTime = Date.now() - startTime
    console.log(`⚡ Fast submission complete: ${submission.id} in ${responseTime}ms`)

      return createSuccessResponse({
        message: 'Submission received and is being processed',
        submissionId: submission.id,
        status: submission.status,
        estimatedProcessingTime: '1-3 minutes',
        trackingUrl: `/submissions/${submission.id}/status`,
        responseTime: `${responseTime}ms`
      })
    })
  ),
  { rateLimit: true, rateLimitType: 'api', compression: false, caching: false, performanceMonitoring: true }
)

export const GET = withAPIOptimization(
  withAuth(
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
  ),
  { rateLimit: true, rateLimitType: 'api', compression: true, caching: true, performanceMonitoring: true }
)

