/**
 * AI Evaluation Queue Service
 * 
 * Manages background AI evaluation processing with database-backed queue
 * Integrates with Supabase pg_cron for reliable processing
 */

import { prisma } from '@/lib/prisma'
import { evaluateContent, fetchContentFromUrl } from '@/lib/ai-evaluator'
import { storeContentFingerprint } from '@/lib/duplicate-content-detector'
import { ensureReviewAssignments } from '@/lib/auto-review-assignment'

export interface AiEvaluationResult {
  taskTypes: string[]
  baseXp: number
  originalityScore: number
  qualityScore: number
  confidence: number
  reasoning: string
}

export class AiEvaluationQueue {
  private static instance: AiEvaluationQueue
  private isProcessing = false
  private readonly MAX_RETRIES = 3
  private readonly PROCESSING_TIMEOUT = 120000 // 2 minutes
  private readonly DISABLE_CONTENT_FETCH = (process.env.DISABLE_CONTENT_FETCH || 'false').toLowerCase() === 'true'
  private readonly ENABLE_AI_EVALUATION = (process.env.ENABLE_AI_EVALUATION || 'true').toLowerCase() === 'true'

  static getInstance(): AiEvaluationQueue {
    if (!AiEvaluationQueue.instance) {
      AiEvaluationQueue.instance = new AiEvaluationQueue()
    }
    return AiEvaluationQueue.instance
  }

  /**
   * Queue a submission for AI evaluation
   */
  async queueEvaluation(submissionId: string): Promise<void> {
    try {
      // Check if evaluation already exists
      const existingEvaluation = await prisma.aiEvaluation.findUnique({
        where: { submissionId }
      })

      if (existingEvaluation) {
        console.log(`AI evaluation already exists for submission ${submissionId}`)
        return
      }

      // Create AI evaluation record
      await prisma.aiEvaluation.create({
        data: {
          submissionId,
          status: 'PENDING'
        }
      })

      console.log(`Queued AI evaluation for submission ${submissionId}`)

      // Trigger processing if not already running
      if (!this.isProcessing) {
        // Don't await - let it run in background
        this.processQueue().catch(error => {
          console.error('Error in background AI processing:', error)
        })
      }
    } catch (error) {
      console.error(`Error queueing AI evaluation for submission ${submissionId}:`, error)
      throw error
    }
  }

  /**
   * Process pending AI evaluations
   * This method is called by both the application and Supabase pg_cron
   */
  async processQueue(): Promise<{ processed: number; failed: number }> {
    if (this.isProcessing) {
      console.log('AI evaluation processing already in progress')
      return { processed: 0, failed: 0 }
    }

    this.isProcessing = true
    let processed = 0
    let failed = 0

    try {
      console.log('🤖 Starting AI evaluation queue processing...')

      // Get pending evaluations marked as PROCESSING by pg_cron
      const processingEvaluations = await prisma.aiEvaluation.findMany({
        where: {
          status: 'PROCESSING',
          retryCount: { lt: this.MAX_RETRIES }
        },
        include: {
          submission: true
        },
        orderBy: { processingStartedAt: 'asc' },
        take: 5 // Process up to 5 at a time
      })

      // Also get some PENDING evaluations if we have capacity
      const pendingEvaluations = await prisma.aiEvaluation.findMany({
        where: {
          status: 'PENDING',
          retryCount: { lt: this.MAX_RETRIES }
        },
        include: {
          submission: true
        },
        orderBy: { createdAt: 'asc' },
        take: Math.max(0, 5 - processingEvaluations.length)
      })

      const allEvaluations = [...processingEvaluations, ...pendingEvaluations]

      if (allEvaluations.length === 0) {
        console.log('No AI evaluations to process')
        return { processed: 0, failed: 0 }
      }

      console.log(`Processing ${allEvaluations.length} AI evaluations`)

      for (const evaluation of allEvaluations) {
        try {
          const result = await this.processEvaluation(evaluation)
          if (result) {
            processed++
          } else {
            failed++
          }
        } catch (error) {
          console.error(`Error processing evaluation ${evaluation.id}:`, error)
          failed++
        }
      }

      console.log(`✅ AI evaluation processing complete: ${processed} processed, ${failed} failed`)
      return { processed, failed }

    } catch (error) {
      console.error('Error in AI evaluation queue processing:', error)
      return { processed, failed }
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Process a single AI evaluation
   */
  private async processEvaluation(evaluation: any): Promise<boolean> {
    const startTime = Date.now()

    try {
      // Mark as processing if not already
      if (evaluation.status !== 'PROCESSING') {
        await prisma.aiEvaluation.update({
          where: { id: evaluation.id },
          data: {
            status: 'PROCESSING',
            processingStartedAt: new Date()
          }
        })
      }

      console.log(`Processing AI evaluation for submission ${evaluation.submissionId}`)

      // Check for timeout on existing processing evaluations
      if (evaluation.processingStartedAt) {
        const processingTime = Date.now() - evaluation.processingStartedAt.getTime()
        if (processingTime > this.PROCESSING_TIMEOUT) {
          console.log(`AI evaluation ${evaluation.id} timed out, retrying`)
          await this.handleEvaluationError(evaluation.id, 'Processing timeout')
          return false
        }
      }

      // If AI eval or content fetch is disabled, short-circuit to AI_REVIEWED without fetching
      if (this.DISABLE_CONTENT_FETCH || !this.ENABLE_AI_EVALUATION) {
        console.log(`⚙️  AI/content fetch disabled. Marking submission ${evaluation.submissionId} as AI_REVIEWED without evaluation.`)

        const platform = (evaluation.submission.platform || '').toLowerCase()
        const taskTypes = platform.includes('twitter') || platform.includes('x.com')
          ? ['A']
          : (platform.includes('reddit') || platform.includes('notion') || platform.includes('medium'))
            ? ['B']
            : []

        // Complete evaluation record with placeholders
        await prisma.aiEvaluation.update({
          where: { id: evaluation.id },
          data: {
            status: 'COMPLETED',
            taskTypes: [],
            baseXp: 0,
            originalityScore: 0,
            qualityScore: 0,
            confidence: 0,
            reasoning: 'AI evaluation disabled: content fetch and LLM scoring are turned off',
            processingCompletedAt: new Date()
          }
        })

        // Update submission to proceed to peer review
        await prisma.submission.update({
          where: { id: evaluation.submissionId },
          data: {
            status: 'AI_REVIEWED',
            aiXp: 0,
            taskTypes
          }
        })

        if (evaluation.submission.userId) {
          const result = await ensureReviewAssignments(evaluation.submissionId, evaluation.submission.userId, { taskTypes })

          // Persist assignment attempt to database
          await prisma.submission.update({
            where: { id: evaluation.submissionId },
            data: {
              assignmentAttemptedAt: new Date(),
              assignmentError: result.success
                ? null
                : JSON.stringify({
                  status: result.status,
                  error: result.error,
                  timestamp: new Date().toISOString()
                })
            }
          })
        } else {
          console.warn(`[PeerReview] Skipping auto-assignment for ${evaluation.submissionId}: submission userId missing`)
        }

        const processingTime = Date.now() - startTime
        console.log(`✅ Skipped AI eval for ${evaluation.submissionId} in ${processingTime}ms - Ready for peer review (AI disabled)`)
        return true
      }

      // Fetch content
      const contentData = await fetchContentFromUrl(evaluation.submission.url)

      // Optional debug preview of extracted content (before AI)
      const logPreview = (process.env.LOG_EXTRACTED_CONTENT_PREVIEW || 'false').toLowerCase() === 'true'
      if (logPreview && contentData && typeof contentData.content === 'string') {
        const preview = contentData.content.substring(0, 600).replace(/\s+/g, ' ').trim()
        console.log(`🧾 [AI Eval Preview] ${evaluation.submissionId} ` +
          `(platform=${contentData.platform}, method=${contentData.metadata?.extractionMethod || 'unknown'}, ` +
          `len=${contentData.content.length})\n` +
          `${preview}${contentData.content.length > 600 ? '…' : ''}`)
      }

      // Evaluate content
      const analysis = await evaluateContent(contentData)

      // Store content fingerprint for duplicate detection
      await storeContentFingerprint(evaluation.submissionId, contentData)

      // Update evaluation record with results
      await prisma.aiEvaluation.update({
        where: { id: evaluation.id },
        data: {
          status: 'COMPLETED',
          taskTypes: analysis.taskTypes,
          baseXp: analysis.baseXp,
          originalityScore: analysis.originalityScore,
          qualityScore: analysis.qualityScore || 0.8, // Default quality score
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
          processingCompletedAt: new Date()
        }
      })

      // Update submission with AI results - use existing AI_REVIEWED status
      await prisma.submission.update({
        where: { id: evaluation.submissionId },
        data: {
          taskTypes: analysis.taskTypes,
          aiXp: analysis.baseXp,
          originalityScore: analysis.originalityScore,
          status: 'AI_REVIEWED' // Use existing status flow
        }
      })

      if (evaluation.submission.userId) {
        const result = await ensureReviewAssignments(evaluation.submissionId, evaluation.submission.userId, { taskTypes: analysis.taskTypes })

        // Persist assignment attempt to database
        await prisma.submission.update({
          where: { id: evaluation.submissionId },
          data: {
            assignmentAttemptedAt: new Date(),
            assignmentError: result.success
              ? null
              : JSON.stringify({
                status: result.status,
                error: result.error,
                timestamp: new Date().toISOString()
              })
          }
        })
      } else {
        console.warn(`[PeerReview] Skipping auto-assignment for ${evaluation.submissionId}: submission userId missing`)
      }

      // Send notification about submission being ready for peer review
      const submission = await prisma.submission.findUnique({
        where: { id: evaluation.submissionId },
        include: { user: true }
      })

      if (submission) {
        const { createNotification, NotificationType } = await import('@/lib/notifications')
        await createNotification(
          submission.userId,
          NotificationType.SUBMISSION_PROCESSED,
          '📝 Ready for Peer Review',
          `Your submission is now ready for peer review! Reviewers will check it meets all requirements and determine your final XP.`,
          {
            submissionId: evaluation.submissionId,
            aiXp: analysis.baseXp,
            taskTypes: analysis.taskTypes,
            url: submission.url,
            nextStep: 'peer_review'
          }
        )
      }

      const processingTime = Date.now() - startTime
      console.log(`✅ Background processing completed for submission ${evaluation.submissionId} in ${processingTime}ms - Ready for peer review with ${analysis.baseXp} XP`)

      return true

    } catch (error) {
      console.error(`AI evaluation failed for ${evaluation.id}:`, error)
      await this.handleEvaluationError(evaluation.id, error instanceof Error ? error.message : 'Unknown error')
      return false
    }
  }

  /**
   * Handle evaluation errors with retry logic
   */
  private async handleEvaluationError(evaluationId: string, errorMessage: string): Promise<void> {
    try {
      const evaluation = await prisma.aiEvaluation.findUnique({
        where: { id: evaluationId }
      })

      if (!evaluation) {
        console.error(`Evaluation ${evaluationId} not found`)
        return
      }

      const newRetryCount = evaluation.retryCount + 1
      const shouldFail = newRetryCount >= this.MAX_RETRIES

      await prisma.aiEvaluation.update({
        where: { id: evaluationId },
        data: {
          status: shouldFail ? 'FAILED' : 'PENDING',
          retryCount: newRetryCount,
          errorMessage,
          processingStartedAt: null // Reset processing time
        }
      })

      if (shouldFail) {
        console.error(`AI evaluation ${evaluationId} failed permanently after ${this.MAX_RETRIES} retries`)

        // Update submission status to indicate AI evaluation failed
        await prisma.submission.update({
          where: { id: evaluation.submissionId },
          data: {
            status: 'PENDING' // Keep as pending so it can be manually reviewed
          }
        })
      } else {
        console.log(`AI evaluation ${evaluationId} will be retried (attempt ${newRetryCount}/${this.MAX_RETRIES})`)
      }
    } catch (error) {
      console.error(`Error handling evaluation error for ${evaluationId}:`, error)
    }
  }

  /**
   * Get evaluation statistics
   */
  async getEvaluationStats(): Promise<{
    total: number
    pending: number
    processing: number
    completed: number
    failed: number
    averageProcessingTime: number
    successRate: number
  }> {
    try {
      const stats = await prisma.aiEvaluation.groupBy({
        by: ['status'],
        _count: {
          id: true
        }
      })

      const total = stats.reduce((sum, stat) => sum + stat._count.id, 0)
      const completed = stats.find(s => s.status === 'COMPLETED')?._count.id || 0
      const failed = stats.find(s => s.status === 'FAILED')?._count.id || 0
      const pending = stats.find(s => s.status === 'PENDING')?._count.id || 0
      const processing = stats.find(s => s.status === 'PROCESSING')?._count.id || 0

      // Calculate average processing time for completed evaluations
      const completedEvaluations = await prisma.aiEvaluation.findMany({
        where: {
          status: 'COMPLETED',
          processingStartedAt: { not: null },
          processingCompletedAt: { not: null }
        },
        select: {
          processingStartedAt: true,
          processingCompletedAt: true
        },
        take: 100 // Sample last 100 for average
      })

      let averageProcessingTime = 0
      if (completedEvaluations.length > 0) {
        const totalTime = completedEvaluations.reduce((sum, evaluation) => {
          if (evaluation.processingStartedAt && evaluation.processingCompletedAt) {
            return sum + (evaluation.processingCompletedAt.getTime() - evaluation.processingStartedAt.getTime())
          }
          return sum
        }, 0)
        averageProcessingTime = totalTime / completedEvaluations.length
      }

      const successRate = total > 0 ? (completed / (completed + failed)) * 100 : 0

      return {
        total,
        pending,
        processing,
        completed,
        failed,
        averageProcessingTime,
        successRate
      }
    } catch (error) {
      console.error('Error getting evaluation stats:', error)
      return {
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        averageProcessingTime: 0,
        successRate: 0
      }
    }
  }

  /**
   * Retry failed evaluations
   */
  async retryFailedEvaluations(): Promise<number> {
    try {
      const result = await prisma.aiEvaluation.updateMany({
        where: {
          status: 'FAILED',
          retryCount: { lt: this.MAX_RETRIES }
        },
        data: {
          status: 'PENDING',
          errorMessage: null,
          processingStartedAt: null
        }
      })

      console.log(`Reset ${result.count} failed evaluations for retry`)
      return result.count
    } catch (error) {
      console.error('Error retrying failed evaluations:', error)
      return 0
    }
  }
}

export const aiEvaluationQueue = AiEvaluationQueue.getInstance()
