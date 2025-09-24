import { prisma } from '@/lib/prisma'
import { fetchContentFromUrl, evaluateContent } from '@/lib/ai-evaluator'
import { validateSubmission } from '@/lib/content-validator'
import { enhancedDuplicateDetectionService } from '@/lib/enhanced-duplicate-detection'
import { aiEvaluationQueue } from '@/lib/ai-evaluation-queue'
import { createNotification, NotificationType } from '@/lib/notifications'
import { storeContentFingerprint } from '@/lib/duplicate-content-detector'
import { ensureReviewAssignments } from '@/lib/auto-review-assignment'

/**
 * Background processing queue for submissions
 * Handles content fetching, validation, and AI evaluation asynchronously
 */
export class SubmissionProcessingQueue {
  private static instance: SubmissionProcessingQueue
  private readonly MAX_RETRIES = 3
  private readonly PROCESSING_TIMEOUT = 300000 // 5 minutes
  private readonly CONTENT_FETCH_TIMEOUT = 15000 // 15 seconds (reduced from 30s)
  private readonly BATCH_SIZE = 5

  static getInstance(): SubmissionProcessingQueue {
    if (!SubmissionProcessingQueue.instance) {
      SubmissionProcessingQueue.instance = new SubmissionProcessingQueue()
    }
    return SubmissionProcessingQueue.instance
  }

  private shouldProcessInline(): boolean {
    return (process.env.ENABLE_IN_PROCESS_QUEUE || 'false').toLowerCase() === 'true'
  }

  /**
   * Queue a submission for background processing
   */
  async queueSubmission(submissionId: string, priority: 'HIGH' | 'NORMAL' | 'LOW' = 'NORMAL'): Promise<void> {
    try {
      // Check if processing record already exists using raw SQL
      const existingProcessing = await prisma.$queryRaw`
        SELECT id FROM "SubmissionProcessing" WHERE "submissionId" = ${submissionId}::uuid
      ` as any[]

      if (existingProcessing.length > 0) {
        console.log(`🔄 Submission processing already exists for ${submissionId}`)
        return
      }

      // Create processing record using raw SQL
      await prisma.$executeRaw`
        INSERT INTO "SubmissionProcessing" ("submissionId", "status", "priority")
        VALUES (${submissionId}::uuid, 'PENDING', ${priority})
      `

      console.log(`📥 Queued submission ${submissionId} for processing (priority: ${priority})`)

      if (this.shouldProcessInline()) {
        // Fire and forget so local/dev environments can still process immediately
        this.processQueue().catch(error => {
          console.error('❌ Error in inline submission processing:', error)
        })
      }
    } catch (error) {
      console.error(`❌ Failed to queue submission ${submissionId}:`, error)
      throw error
    }
  }

  /**
   * Process the submission queue
   */
  async processQueue(): Promise<{ processed: number; failed: number }> {
    let processed = 0
    let failed = 0

    try {
      console.log('🚀 Starting submission processing queue...')

      const staleThreshold = new Date(Date.now() - this.PROCESSING_TIMEOUT)

      // Claim a batch of jobs atomically so multiple workers can operate safely
      const pendingSubmissions = await prisma.$transaction(async tx => {
        return tx.$queryRaw`
          WITH next_jobs AS (
            SELECT
              sp.id,
              sp.priority,
              sp."createdAt" AS job_created_at
            FROM "SubmissionProcessing" sp
            WHERE sp."retryCount" < ${this.MAX_RETRIES}
              AND (
                sp.status = 'PENDING'
                OR (sp.status = 'PROCESSING' AND (sp."processingStartedAt" IS NULL OR sp."processingStartedAt" < ${staleThreshold}))
              )
            ORDER BY
              CASE sp.priority
                WHEN 'HIGH' THEN 3
                WHEN 'NORMAL' THEN 2
                WHEN 'LOW' THEN 1
              END DESC,
              sp."createdAt" ASC
            LIMIT ${this.BATCH_SIZE}
            FOR UPDATE SKIP LOCKED
          ),
          updated AS (
            UPDATE "SubmissionProcessing" AS sp
            SET status = 'PROCESSING',
                "processingStartedAt" = NOW()
            FROM next_jobs
            WHERE sp.id = next_jobs.id
            RETURNING
              sp.id,
              sp."submissionId",
              sp.status,
              sp.priority,
              sp."retryCount",
              sp."createdAt",
              sp."processingStartedAt",
              next_jobs.job_created_at
          )
          SELECT
            updated.id,
            updated."submissionId",
            updated.status,
            updated.priority,
            updated."retryCount",
            updated."createdAt",
            updated."processingStartedAt",
            s.id as submission_id,
            s.url as submission_url,
            s."userId" as submission_userId,
            s.platform as submission_platform,
            u.id as user_id,
            u.username as user_username,
            u.email as user_email
          FROM updated
          JOIN "Submission" s ON s.id = updated."submissionId"
          JOIN "User" u ON u.id = s."userId"
          ORDER BY
            CASE updated.priority
              WHEN 'HIGH' THEN 3
              WHEN 'NORMAL' THEN 2
              WHEN 'LOW' THEN 1
            END DESC,
            updated.job_created_at ASC
        ` as any[]
      })

      if (pendingSubmissions.length === 0) {
        console.log('📭 No submissions to process')
        return { processed: 0, failed: 0 }
      }

      console.log(`🔄 Processing ${pendingSubmissions.length} submissions`)

      // Process each submission
      for (const processing of pendingSubmissions) {
        try {
          // Transform raw SQL result to expected format
          const transformedProcessing = {
            id: processing.id,
            submissionId: processing.submissionId,
            status: processing.status,
            priority: processing.priority,
            retryCount: processing.retryCount,
            createdAt: processing.createdAt,
            submission: {
              id: processing.submission_id,
              url: processing.submission_url,
              userId: processing.submission_userId,
              platform: processing.submission_platform,
              user: {
                id: processing.user_id,
                username: processing.user_username,
                email: processing.user_email
              }
            }
          }

          const success = await this.processSubmission(transformedProcessing)
          if (success) {
            processed++
          } else {
            failed++
          }
        } catch (error) {
          console.error(`❌ Error processing submission ${processing.submissionId}:`, error)
          failed++
        }
      }

      console.log(`✅ Submission processing complete: ${processed} processed, ${failed} failed`)
      return { processed, failed }
    } catch (error) {
      console.error('❌ Error running submission processing queue:', error)
      return { processed, failed }
    }
  }

  /**
   * Process a single submission
   */
  private async processSubmission(processing: any): Promise<boolean> {
    const { submissionId, submission } = processing
    const startTime = Date.now()

    try {
      console.log(`🔄 Processing submission ${submissionId}: ${submission.url}`)

      // Extract userId from the correct location
      const userId = submission.submission_userId || submission.userId || submission.user?.id

      // Global kill-switch: skip content fetching/validation when disabled
      const DISABLE_CONTENT_FETCH = (process.env.DISABLE_CONTENT_FETCH || 'false').toLowerCase() === 'true'
      const ENABLE_AI_EVALUATION = (process.env.ENABLE_AI_EVALUATION || 'true').toLowerCase() === 'true'

      const heuristicTaskTypes = (() => {
        const platform = (submission.platform || '').toLowerCase()
        if (platform.includes('twitter') || platform.includes('x.com')) return ['A']
        if (platform.includes('reddit') || platform.includes('notion') || platform.includes('medium')) return ['B']
        return []
      })()
      if (DISABLE_CONTENT_FETCH || !ENABLE_AI_EVALUATION) {
        console.log(`⚙️  Content fetching/AI evaluation disabled. Fast-pathing ${submissionId} to AI_REVIEWED for peer review.`)

        await prisma.submission.update({
          where: { id: submissionId },
          data: {
            status: 'AI_REVIEWED',
            aiXp: 0,
            taskTypes: heuristicTaskTypes
          }
        })

        await prisma.$executeRaw`
          UPDATE "SubmissionProcessing"
          SET status = 'COMPLETED', "processingCompletedAt" = NOW()
          WHERE id = ${processing.id}::uuid
        `

        await createNotification(
          userId,
          NotificationType.SUBMISSION_PROCESSING,
          '✅ Submission Ready for Review',
          'Your submission is ready for peer review.',
          { submissionId, platform: submission.platform, skipAI: true }
        )

        if (userId) {
          await ensureReviewAssignments(submissionId, userId, { taskTypes: heuristicTaskTypes })
        } else {
          console.warn(`[PeerReview] Skipping auto-assignment for ${submissionId}: submission userId missing`)
        }

        console.log(`✅ Submission ${submissionId} routed to peer review (AI disabled)`)
        return true
      }

      // Early platform check: Skip all validation for Twitter (peer review only)
      // Allow override via env to test thread extraction and AI evaluation for Twitter
      const enableTwitterExtraction = (process.env.TWITTER_EXTRACT_THREADS || 'false').toLowerCase() === 'true'
      if (submission.platform === 'Twitter' && !enableTwitterExtraction) {
        console.log(`🐦 Twitter submission detected - skipping content fetching and validation, routing directly to peer review`)

        // Skip AI evaluation and content validation, go directly to peer review
        await prisma.submission.update({
          where: { id: submissionId },
          data: {
            status: 'AI_REVIEWED', // Skip AI evaluation step
            aiXp: 0, // No AI XP for Twitter
            originalityScore: 0.8, // Default originality score for peer review
            taskTypes: ['A'] // Default task type for Twitter content (peer reviewers will verify)
          }
        })

        // Mark processing as completed
        await prisma.$executeRaw`
          UPDATE "SubmissionProcessing"
          SET status = 'COMPLETED', "processingCompletedAt" = NOW()
          WHERE id = ${processing.id}::uuid
        `

        // Platform-specific notification message
        const notificationMessage = 'Your Twitter submission is ready for peer review. Peer reviewers will verify that it meets all requirements including @ScholarsOfMove mention and #ScholarsOfMove hashtag. You\'ll be notified when reviewers complete their evaluation!'

        // Notify user that submission is ready for peer review
        await createNotification(
          userId,
          NotificationType.SUBMISSION_PROCESSING,
          '✅ Submission Ready for Review',
          notificationMessage,
          { submissionId, platform: submission.platform, skipAI: true, skipValidation: true, taskTypes: ['A'] }
        )

        if (userId) {
          await ensureReviewAssignments(submissionId, userId, { taskTypes: ['A'] })
        } else {
          console.warn(`[PeerReview] Skipping auto-assignment for ${submissionId}: submission userId missing`)
        }

        console.log(`✅ Twitter submission ${submissionId} routed directly to peer review (no validation or AI evaluation)`)
        return true
      }

      // Step 1: Fetch content (URL duplicates already checked in fast API)
      console.log(`📄 Fetching content for ${submissionId}`)
      let contentData
      try {
        const isTwitter = submission.platform === 'Twitter'
        const twitterThreadsEnabled = (process.env.TWITTER_EXTRACT_THREADS || 'false').toLowerCase() === 'true'
        const contentFetchTimeout = (isTwitter && twitterThreadsEnabled)
          ? Math.max(this.CONTENT_FETCH_TIMEOUT, 60000) // Allow up to 60s for Apify runs
          : this.CONTENT_FETCH_TIMEOUT

        contentData = await this.withTimeout(
          fetchContentFromUrl(submission.url),
          contentFetchTimeout,
          'Content fetching timeout'
        )

        // Optional debug preview of extracted content
        const logPreview = (process.env.LOG_EXTRACTED_CONTENT_PREVIEW || 'false').toLowerCase() === 'true'
        if (logPreview && contentData && typeof contentData.content === 'string') {
          const preview = contentData.content.substring(0, 600).replace(/\s+/g, ' ').trim()
          console.log(`🧾 [Content Preview] ${submissionId} ` +
            `(platform=${contentData.platform}, method=${contentData.metadata?.extractionMethod || 'unknown'}, ` +
            `len=${contentData.content.length})\n` +
            `${preview}${contentData.content.length > 600 ? '…' : ''}`)
        }
      } catch (fetchError) {
        // If content fetching fails completely, reject with specific error
        if (fetchError.message.includes('timeout') || fetchError.message.includes('429')) {
          throw fetchError // Let the rate limit handler deal with this
        }

        await this.rejectSubmission(
          submissionId,
          processing.id,
          'CONTENT_FETCH_FAILED',
          `Unable to fetch content from URL: ${fetchError.message}`
        )
        return true
      }

      // Step 2: Content validation FIRST (fast local operation)
      // Optimization: Check validation before expensive duplicate detection
      // This avoids unnecessary database queries for content missing @ScholarsOfMove mentions/hashtags
      console.log(`✅ Validating content for ${submissionId}`)
      const validationResult = await validateSubmission(contentData, userId)

      if (!validationResult.isValid) {
        await this.rejectSubmission(
          submissionId,
          processing.id,
          'VALIDATION_FAILED',
          'Content validation failed',
          validationResult.errors
        )
        return true
      }

      // Step 3: Content similarity duplicate check (expensive operation, only for valid content)
      // Note: URL duplicates already checked in fast API, so we only check content duplicates
      console.log(`🔍 Checking content duplicates for validated content: ${submissionId}`)
      const contentDuplicateCheck = await enhancedDuplicateDetectionService.checkForDuplicate(
        submission.url,
        contentData,
        userId,
        'CONTENT_ONLY' // Only check content duplicates - URL already checked in fast API
      )

      if (contentDuplicateCheck.isDuplicate) {
        await this.rejectSubmission(
          submissionId,
          processing.id,
          'DUPLICATE_CONTENT',
          `Content is a duplicate (${contentDuplicateCheck.duplicateType})`
        )
        return true
      }

      // Step 4: Store content fingerprint for future duplicate detection
      await storeContentFingerprint(submissionId, contentData)

      // Step 5: Update submission with validated task types
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: 'PENDING', // Use existing PENDING status for AI evaluation
          taskTypes: validationResult.qualifyingTaskTypes
        }
      })

      // Step 6: Queue for background processing (Twitter already handled earlier)
      console.log(`📝 Queueing background processing for ${submission.platform} content ${submissionId}`)
      await aiEvaluationQueue.queueEvaluation(submissionId)

      // Step 7: Mark processing as completed using raw SQL
      await prisma.$executeRaw`
        UPDATE "SubmissionProcessing"
        SET status = 'COMPLETED', "processingCompletedAt" = NOW()
        WHERE id = ${processing.id}::uuid
      `

      const processingTime = Date.now() - startTime
      console.log(`✅ Successfully processed ${submissionId} in ${processingTime}ms`)

      // Notification message for non-Twitter platforms (Twitter handled earlier)
      const notificationMessage = 'Your submission has been validated and is being prepared for peer review. You\'ll be notified when it\'s ready!'

      // Notify user that submission is being processed
      await createNotification(
        userId,
        NotificationType.SUBMISSION_PROCESSING,
        '✅ Submission Received',
        notificationMessage,
        { submissionId, processingTime, platform: submission.platform }
      )

      return true

    } catch (error) {
      console.error(`❌ Error processing submission ${submissionId}:`, error)

      // Handle rate limiting errors with longer delay
      if (error.message.includes('429') || error.message.includes('Rate limit')) {
        console.log(`⏳ Rate limit hit for ${submissionId}, will retry with longer delay`)
        // Don't count rate limit as a regular retry - just delay and try again
        setTimeout(() => {
          this.processQueue().catch(console.error)
        }, 60000) // Wait 1 minute for rate limits
        return false
      }

      await this.handleProcessingError(processing, error)
      return false
    }
  }

  /**
   * Reject a submission with proper notifications
   * Keep submission in PROCESSING status but mark processing as failed with detailed error
   */
  private async rejectSubmission(
    submissionId: string,
    processingId: string,
    reason: string,
    message: string,
    validationErrors?: any[]
  ): Promise<void> {
    try {
      // Keep submission in PROCESSING status (don't change to REJECTED)
      // The detailed error will be in the processing record and notifications

      // Mark processing as failed with detailed error message using raw SQL
      await prisma.$executeRaw`
        UPDATE "SubmissionProcessing"
        SET status = 'FAILED',
            "processingCompletedAt" = NOW(),
            "errorMessage" = ${`${reason}: ${message}`}
        WHERE id = ${processingId}::uuid
      `

      // Get submission details for notification using raw SQL
      const submissions = await prisma.$queryRaw`
        SELECT s.id, s.url, s."userId", u.username, u.email
        FROM "Submission" s
        JOIN "User" u ON s."userId" = u.id
        WHERE s.id = ${submissionId}::uuid
      ` as any[]

      const submission = submissions[0]
      if (submission && submission.userId) {
        // Create detailed user-friendly notification with specific fixes
        const notificationTitle = '❌ Submission Needs Attention'
        let notificationMessage = ''

        if (reason === 'DUPLICATE_CONTENT') {
          notificationMessage = 'This content has already been submitted. Please submit original content only.'
        } else if (reason === 'VALIDATION_FAILED' && validationErrors) {
          // Group errors by type to avoid duplicates
          const errorGroups = {
            mention: false,
            hashtag: false,
            length: [],
            other: []
          }

          validationErrors.forEach(error => {
            if (error.code === 'MISSING_MENTION') {
              errorGroups.mention = true
            } else if (error.code === 'MISSING_HASHTAG') {
              errorGroups.hashtag = true
            } else if (error.code === 'INSUFFICIENT_LENGTH') {
              errorGroups.length.push(error.message)
            } else {
              errorGroups.other.push(error.message)
            }
          })

          const errorMessages = []

          if (errorGroups.mention) {
            errorMessages.push('📝 Add "@ScholarsOfMove" mention anywhere in your content')
          }

          if (errorGroups.hashtag) {
            errorMessages.push('🏷️ Add "#ScholarsOfMove" hashtag to your content')
          }

          errorGroups.length.forEach(msg => {
            errorMessages.push(`📏 ${msg}`)
          })

          errorGroups.other.forEach(msg => {
            errorMessages.push(`⚠️ ${msg}`)
          })

          notificationMessage = `Your submission needs attention:\n\n${errorMessages.join('\n')}\n\n✅ Fix these issues and submit again to earn XP!`
        } else {
          notificationMessage = 'Please check the submission requirements and try again.'
        }

        // Create notification using the notification library
        await createNotification(
          submission.userId,
          NotificationType.SUBMISSION_REJECTED,
          notificationTitle,
          notificationMessage,
          {
            submissionId,
            reason,
            validationErrors,
            url: submission.url,
            detailedErrors: validationErrors
          }
        )
      }

      console.log(`❌ Rejected submission ${submissionId}: ${reason}`)
    } catch (error) {
      console.error(`❌ Error rejecting submission ${submissionId}:`, error)
    }
  }

  /**
   * Handle processing errors with retry logic
   */
  private async handleProcessingError(processing: any, error: any): Promise<void> {
    const { id: processingId, submissionId, retryCount } = processing

    try {
      if (retryCount < this.MAX_RETRIES - 1) {
        // Retry with exponential backoff
        const delay = Math.pow(2, retryCount) * 1000 // 1s, 2s, 4s

        await prisma.$executeRaw`
          UPDATE "SubmissionProcessing"
          SET status = 'PENDING',
              "retryCount" = ${retryCount + 1},
              "errorMessage" = ${error.message},
              "processingStartedAt" = NULL
          WHERE id = ${processingId}::uuid
        `

        console.log(`🔄 Retrying submission ${submissionId} in ${delay}ms (attempt ${retryCount + 2}/${this.MAX_RETRIES})`)

        if (this.shouldProcessInline()) {
          // Allow inline processors (local/dev) to retry quickly without waiting for cron
          setTimeout(() => {
            this.processQueue().catch(console.error)
          }, delay)
        }
      } else {
        // Max retries exceeded - mark as failed
        await this.rejectSubmission(
          submissionId,
          processingId,
          'PROCESSING_FAILED',
          `Processing failed after ${this.MAX_RETRIES} attempts: ${error.message}`
        )
      }
    } catch (updateError) {
      console.error(`❌ Error handling processing error for ${submissionId}:`, updateError)
    }
  }

  /**
   * Timeout wrapper for promises
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
      })
    ])
  }
}

// Export singleton instance
export const submissionProcessingQueue = SubmissionProcessingQueue.getInstance()
