import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import path from 'path'
import { xpAnalyticsService } from './xp-analytics'
import { prisma } from '@/lib/prisma'
import { getWeekNumber, getWeekBoundaries, recalculateCurrentWeekXp } from '@/lib/utils'
import { generateReviewSummary } from '@/lib/ai-summary'
import { reliabilityService } from './reliability/reliability-service'
import { RELIABILITY_CONFIG } from '@/config/reliability'
import { getFormula, calculateScore } from './reliability/formulas'
import { notifySubmissionFinalized } from '@/lib/notifications'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface ConsensusResult {
  submissionId: string
  finalXp: number
  consensusScore: number
  aiWeight: number
  peerWeight: number
  reviewCount: number
  agreement: number
  confidence: 'high' | 'medium' | 'low'
  outliers: string[]
  details: {
    aiXp: number
    peerXpScores: number[]
    weightedAverage: number
    adjustments: string[]
  }
}

export interface ReviewerReliability {
  reviewerId: string
  reliabilityScore: number
  totalReviews: number
  averageDeviation: number
  qualityRating: number
}

/**
 * Service for calculating consensus scores from AI and peer reviews
 */
export class ConsensusCalculatorService {
  private readonly AI_BASE_WEIGHT = 0.0 // AI disabled for consensus (peer-only)
  private readonly PEER_BASE_WEIGHT = 1.0 // 100% weight for peer reviews
  private readonly MIN_REVIEWS_FOR_CONSENSUS = (() => {
    const envValue = parseInt(
      process.env.REQUIRED_REVIEWS_FOR_FINALIZATION ||
      process.env.REVIEWER_MINIMUM_REQUIRED ||
      process.env.MIN_REVIEWERS_REQUIRED ||
      '',
      10
    )

    if (!Number.isNaN(envValue) && envValue > 0) {
      return envValue
    }

    return 3
  })()
  private readonly OUTLIER_THRESHOLD = 2.0 // Standard deviations
  private readonly HIGH_CONFIDENCE_THRESHOLD = 0.8
  private readonly MEDIUM_CONFIDENCE_THRESHOLD = 0.6

  /**
   * Calculate consensus for a submission
   */
  async calculateConsensus(submissionId: string): Promise<ConsensusResult | null> {
    try {
      // Get submission and reviews
      const { data: submission, error: submissionError } = await supabase
        .from('Submission')
        .select(`
          id,
          aiXp,
          status,
          userId,
          peerReviews:PeerReview(
            id,
            reviewerId,
            xpScore,
            qualityRating,
            isLate,
            createdAt,
            reviewer:User(id, username, totalXp, missedReviews)
          )
        `)
        .eq('id', submissionId)
        .single()

      if (submissionError || !submission) {
        console.error('Error fetching submission for consensus:', submissionError)
        return null
      }

      const reviews = submission.peerReviews || []

      if (reviews.length < this.MIN_REVIEWS_FOR_CONSENSUS) {
        console.log(`Insufficient reviews for consensus: ${reviews.length} < ${this.MIN_REVIEWS_FOR_CONSENSUS}`)
        return null
      }

      console.log(`🔍 Processing consensus for submission ${submissionId} with ${reviews.length} reviews`)
      console.log(`📊 Review scores:`, reviews.map(r => ({ id: r.id, score: r.xpScore, reviewer: r.reviewerId })))

      // Calculate reviewer reliability scores using the new Reliability Service
      const reliabilityMap = await reliabilityService.getReliabilityScores(
        reviews.map(r => r.reviewerId)
      )

      // Map to the internal interface for compatibility with existing methods
      const reviewerReliabilities = new Map<string, ReviewerReliability>()
      reliabilityMap.forEach((res, id) => {
        reviewerReliabilities.set(id, {
          reviewerId: id,
          reliabilityScore: res.score,
          totalReviews: res.metrics.totalReviews,
          averageDeviation: res.metrics.avgDeviation,
          qualityRating: res.metrics.avgQualityRating
        })
      })

      // Detect and handle outliers
      const peerXpScores = reviews.map(r => r.xpScore)
      const outliers = this.detectOutliers(peerXpScores, reviews)

      // Calculate weighted peer average
      const weightedPeerAverage = this.calculateWeightedPeerAverage(
        reviews,
        reviewerReliabilities,
        outliers
      )

      // --- SHADOW MODE LOGGING (Non-blocking) ---
      if (RELIABILITY_CONFIG.ENABLE_SHADOW_MODE) {
        setImmediate(async () => {
          try {
            const shadowFormula = getFormula('CUSTOM_V1')
            let shadowWeightedSum = 0
            let shadowTotalWeight = 0

            const outlierIds = new Set(outliers.map(o => o.reviewId))
            const validReviews = reviews.filter(review => !outlierIds.has(review.id))

            for (const review of validReviews) {
              const res = reliabilityMap.get(review.reviewerId)
              if (res) {
                const shadowScore = calculateScore(res.metrics, shadowFormula.weights)
                shadowWeightedSum += (review.xpScore || 0) * shadowScore
                shadowTotalWeight += shadowScore
              }
            }

            const shadowConsensus = shadowTotalWeight > 0 ? shadowWeightedSum / shadowTotalWeight : weightedPeerAverage
            const delta = shadowConsensus - weightedPeerAverage

            // Log to database
            await prisma.shadowConsensusLog.create({
              data: {
                submissionId,
                activeFormulaId: RELIABILITY_CONFIG.ACTIVE_FORMULA,
                activeScore: weightedPeerAverage,
                shadowFormulaId: 'CUSTOM_V1',
                shadowScore: shadowConsensus,
                delta: delta
              }
            })
          } catch (shadowError) {
            console.warn('[SHADOW MODE] Failed to log shadow consensus:', shadowError)
          }
        })
      }
      // ---------------------------

      // Peer-only consensus: compute agreement among peers, ignore AI completely
      const agreement = this.calculateAgreement(peerXpScores)
      const aiWeight = 0
      const peerWeight = 1

      // Final XP is peer-only (weighted by reviewer reliability, outliers removed)
      const finalXp = Math.round(weightedPeerAverage)
      // Store consensusScore as peer agreement (0-1) for UI/analytics
      const consensusScore = Math.round(agreement * 100) / 100

      // Calculate confidence level
      const confidence = this.calculateConfidence(agreement, reviews.length, reviewerReliabilities)

      // Prepare adjustments log
      const adjustments = []
      if (outliers.length > 0) {
        adjustments.push(`Excluded ${outliers.length} outlier review(s)`)
      }

      const result: ConsensusResult = {
        submissionId,
        finalXp,
        consensusScore,
        aiWeight,
        peerWeight,
        reviewCount: reviews.length,
        agreement: Math.round(agreement * 100) / 100,
        confidence,
        outliers: outliers.map(o => o.reviewId),
        details: {
          aiXp: submission.aiXp,
          peerXpScores,
          weightedAverage: Math.round(weightedPeerAverage * 100) / 100,
          adjustments
        }
      }

      // Update submission with consensus results
      await this.updateSubmissionWithConsensus(submissionId, result)

      // Award reviewer quality bonuses automatically based on agreement with final XP
      try {
        const threshold = 15 // points within final XP to count as accurate
        for (const r of reviews) {
          const deviation = Math.abs((r.xpScore || 0) - finalXp)
          if (deviation <= threshold) {
            await xpAnalyticsService.recordXpTransaction(
              r.reviewerId,
              2,
              'REVIEW_REWARD',
              `Quality bonus for accurate review on submission ${submissionId}`,
              submissionId
            )
          }
        }
      } catch (e) {
        console.warn('Failed to award reviewer quality bonuses:', e)
      }

      console.log(`✅ Consensus calculated for submission ${submissionId}: ${finalXp} XP (confidence: ${confidence})`)

      return result

    } catch (error) {
      console.error('Error calculating consensus:', error)
      return null
    }
  }

  /**
   * Legacy method kept for interface compatibility, now redirects to ReliabilityService
   * @deprecated Use reliabilityService.getReliabilityScores directly
   */
  private async calculateReviewerReliabilities(reviewerIds: string[]): Promise<Map<string, ReviewerReliability>> {
    const reliabilityMap = await reliabilityService.getReliabilityScores(reviewerIds)
    const results = new Map<string, ReviewerReliability>()

    reliabilityMap.forEach((res, id) => {
      results.set(id, {
        reviewerId: id,
        reliabilityScore: res.score,
        totalReviews: res.metrics.totalReviews,
        averageDeviation: res.metrics.avgDeviation,
        qualityRating: res.metrics.avgQualityRating
      })
    })

    return results
  }

  /**
   * Detect outlier reviews using statistical methods
   */
  private detectOutliers(scores: number[], reviews: any[]): { reviewId: string; score: number; reason: string }[] {
    if (scores.length < 3) return [] // Need at least 3 reviews to detect outliers

    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length
    const standardDeviation = Math.sqrt(variance)

    const outliers = []

    for (let i = 0; i < scores.length; i++) {
      const score = scores[i]
      const zScore = Math.abs((score - mean) / standardDeviation)

      if (zScore > this.OUTLIER_THRESHOLD) {
        outliers.push({
          reviewId: reviews[i].id,
          score,
          reason: `Z-score: ${zScore.toFixed(2)} (threshold: ${this.OUTLIER_THRESHOLD})`
        })
      }
    }

    return outliers
  }

  /**
   * Calculate weighted average of peer reviews
   */
  private calculateWeightedPeerAverage(
    reviews: any[],
    reliabilities: Map<string, ReviewerReliability>,
    outliers: { reviewId: string }[]
  ): number {
    const outlierIds = new Set(outliers.map(o => o.reviewId))
    const validReviews = reviews.filter(review => !outlierIds.has(review.id))

    if (validReviews.length === 0) {
      // If all reviews are outliers, use simple average
      return reviews.reduce((sum, review) => sum + review.xpScore, 0) / reviews.length
    }

    let weightedSum = 0
    let totalWeight = 0

    for (const review of validReviews) {
      const reliability = reliabilities.get(review.reviewerId)
      const weight = reliability ? reliability.reliabilityScore : 0.5

      weightedSum += review.xpScore * weight
      totalWeight += weight
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0
  }

  /**
   * Calculate agreement level among peer reviews
   */
  private calculateAgreement(scores: number[]): number {
    if (scores.length < 2) return 1.0

    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length
    const standardDeviation = Math.sqrt(variance)

    // Convert standard deviation to agreement score (0-1)
    // Lower standard deviation = higher agreement
    const maxExpectedStdDev = 25 // Assume max std dev of 25 points
    return Math.max(0, 1 - (standardDeviation / maxExpectedStdDev))
  }

  /**
   * Calculate dynamic weights based on review quality and agreement
   */
  private calculateDynamicWeights(
    agreement: number,
    reviewCount: number,
    reliabilities: Map<string, ReviewerReliability>
  ): { aiWeight: number; peerWeight: number } {
    // Calculate average reviewer reliability
    const reliabilityScores = Array.from(reliabilities.values()).map(r => r.reliabilityScore)
    const averageReliability = reliabilityScores.length > 0
      ? reliabilityScores.reduce((sum, score) => sum + score, 0) / reliabilityScores.length
      : 0.5

    // Adjust weights based on factors
    let aiWeight = this.AI_BASE_WEIGHT
    let peerWeight = this.PEER_BASE_WEIGHT

    // Higher agreement and reliability = more weight to peers
    if (agreement > 0.8 && averageReliability > 0.7) {
      aiWeight = 0.3
      peerWeight = 0.7
    }
    // Lower agreement or reliability = more weight to AI
    else if (agreement < 0.5 || averageReliability < 0.4) {
      aiWeight = 0.6
      peerWeight = 0.4
    }
    // More reviews = slightly more weight to peers
    else if (reviewCount >= 5) {
      aiWeight = 0.35
      peerWeight = 0.65
    }

    return { aiWeight, peerWeight }
  }

  /**
   * Calculate confidence level in the consensus
   */
  private calculateConfidence(
    agreement: number,
    reviewCount: number,
    reliabilities: Map<string, ReviewerReliability>
  ): 'high' | 'medium' | 'low' {
    const reliabilityScores = Array.from(reliabilities.values()).map(r => r.reliabilityScore)
    const averageReliability = reliabilityScores.length > 0
      ? reliabilityScores.reduce((sum, score) => sum + score, 0) / reliabilityScores.length
      : 0.5

    const confidenceScore = (agreement * 0.4) + (averageReliability * 0.4) + (Math.min(reviewCount / 5, 1) * 0.2)

    if (confidenceScore >= this.HIGH_CONFIDENCE_THRESHOLD) {
      return 'high'
    } else if (confidenceScore >= this.MEDIUM_CONFIDENCE_THRESHOLD) {
      return 'medium'
    } else {
      return 'low'
    }
  }

  /**
   * Update submission with consensus results using atomic transaction
   */
  private async updateSubmissionWithConsensus(submissionId: string, result: ConsensusResult): Promise<void> {
    // ✅ SAFE: All operations in single atomic transaction
    await prisma.$transaction(async (tx) => {
      const startTime = Date.now()

      try {
        // 1. Get submission to find userId
        const submission = await tx.submission.findUnique({
          where: { id: submissionId },
          select: { userId: true, url: true }
        })

        if (!submission) {
          throw new Error(`Submission ${submissionId} not found`)
        }

        // 2. Enforce weekly finalization cap (max 5 FINALIZED per user per week)
        const now = new Date()
        const { startDate, endDate } = getWeekBoundaries(getWeekNumber(now), now.getFullYear())
        const finalizedThisWeek = await tx.submission.count({
          where: {
            userId: submission.userId,
            status: 'FINALIZED',
            createdAt: { gte: startDate, lte: endDate }
          }
        })
        if (finalizedThisWeek >= 5) {
          throw new Error('Weekly submission cap reached (5). Cannot finalize additional submissions this week.')
        }

        // 3. Update submission with consensus results
        await tx.submission.update({
          where: { id: submissionId },
          data: {
            finalXp: result.finalXp,
            consensusScore: result.consensusScore,
            status: 'FINALIZED'
          }
        })

        // 3.5. Generate AI summary asynchronously (non-blocking)
        // We do this outside the transaction to avoid blocking finalization
        setImmediate(async () => {
          try {
            const reviews = await prisma.peerReview.findMany({
              where: { submissionId },
              select: { comments: true, xpScore: true, qualityRating: true }
            })

            if (reviews.length > 0) {
              const summary = await generateReviewSummary(
                submission.url || 'Untitled Submission',
                reviews
              )

              if (!summary.startsWith('Failed to generate') && !summary.startsWith('No detailed feedback')) {
                await prisma.submission.update({
                  where: { id: submissionId },
                  data: {
                    aiSummary: summary,
                    summaryGeneratedAt: new Date()
                  }
                })
                console.log(`✅ AI summary generated for submission ${submissionId}`)
              }
            }
          } catch (err) {
            console.warn(`⚠️ Failed to generate AI summary for ${submissionId}:`, err)
          }
        })

        // 4. Update user's total XP and recalculate current week XP
        const recalculatedWeekXp = await recalculateCurrentWeekXp(tx, submission.userId)
        await tx.user.update({
          where: { id: submission.userId },
          data: {
            totalXp: { increment: result.finalXp },
            currentWeekXp: recalculatedWeekXp
          }
        })

        // 5. Update weekly stats (atomic upsert)
        const currentWeek = getWeekNumber(new Date())
        await tx.weeklyStats.upsert({
          where: {
            userId_weekNumber: {
              userId: submission.userId,
              weekNumber: currentWeek
            }
          },
          update: {
            xpTotal: { increment: result.finalXp }
          },
          create: {
            userId: submission.userId,
            weekNumber: currentWeek,
            xpTotal: result.finalXp,
            reviewsDone: 0,
            reviewsMissed: 0
          }
        })

        // 6. Create audit trail - Check for existing transaction to prevent duplicates using raw SQL
        console.log(`🔍 Checking for existing transaction for submission ${submissionId} using raw SQL...`)

        // Use raw SQL to avoid Prisma enum comparison issues
        // Cast UUID parameters properly to avoid type mismatch
        const existingTransactions: Array<{ id: string }> = await tx.$queryRaw`
          SELECT id FROM "XpTransaction" 
          WHERE "userId" = ${submission.userId}::uuid
          AND "sourceId" = ${submissionId}::uuid
          AND type = 'SUBMISSION_REWARD'
        `

        const existingTransaction = existingTransactions.length > 0 ? { id: existingTransactions[0].id } : null

        console.log(`🔍 Existing transaction check result:`, existingTransaction ? 'FOUND' : 'NOT FOUND')

        if (!existingTransaction) {
          console.log(`📝 Creating new XP transaction for submission ${submissionId} using raw SQL...`)
          await tx.$executeRaw`
            INSERT INTO "XpTransaction" ("userId", amount, type, "sourceId", description, "weekNumber", "createdAt")
            VALUES (${submission.userId}::uuid, ${result.finalXp}, 'SUBMISSION_REWARD', ${submissionId}::uuid, ${`Consensus XP awarded for submission: ${submission.url}`}, ${currentWeek}, NOW())
          `
          console.log(`✅ Created XP transaction for submission ${submissionId}: ${result.finalXp} XP`)
        } else {
          console.log(`⚠️ XP transaction already exists for submission ${submissionId}, skipping duplicate`)
        }

        const duration = Date.now() - startTime
        console.log(`✅ Consensus transaction completed in ${duration}ms for submission ${submissionId}: ${result.finalXp} XP`)

        // Invalidate user profile cache after XP update
        const { CacheInvalidation } = await import('@/lib/cache/invalidation')
        const { multiLayerCache } = await import('@/lib/cache/enhanced-cache')
        const cacheInvalidation = new CacheInvalidation(multiLayerCache)
        await cacheInvalidation.invalidateOnUserAction('xp_awarded', submission.userId)
        console.log(`🗑️ Cache invalidated for user ${submission.userId} after XP award`)

        // Send submission finalized notification (fire and forget)
        notifySubmissionFinalized(submission.userId, submissionId, result.finalXp, submission.url).catch(err => {
          console.warn('Failed to send submission finalized notification:', err)
        })

      } catch (error) {
        const duration = Date.now() - startTime
        console.error(`❌ Consensus transaction failed after ${duration}ms for submission ${submissionId}:`, error)
        throw error // This will rollback the transaction
      }
    })
  }

  /**
   * Get consensus summary for admin dashboard
   */
  async getConsensusSummary(timeframe: 'day' | 'week' | 'month' = 'week'): Promise<{
    totalProcessed: number
    averageConfidence: number
    highConfidence: number
    mediumConfidence: number
    lowConfidence: number
    averageReviewCount: number
  }> {
    try {
      const startDate = new Date()
      switch (timeframe) {
        case 'day':
          startDate.setDate(startDate.getDate() - 1)
          break
        case 'week':
          startDate.setDate(startDate.getDate() - 7)
          break
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1)
          break
      }

      const { data: submissions } = await supabase
        .from('Submission')
        .select('consensusScore, reviewCount')
        .eq('status', 'FINALIZED')
        .gte('updatedAt', startDate.toISOString())

      if (!submissions || submissions.length === 0) {
        return {
          totalProcessed: 0,
          averageConfidence: 0,
          highConfidence: 0,
          mediumConfidence: 0,
          lowConfidence: 0,
          averageReviewCount: 0
        }
      }

      // Calculate confidence distribution (simplified)
      let highConfidence = 0
      let mediumConfidence = 0
      let lowConfidence = 0

      submissions.forEach(sub => {
        const confidence = sub.consensusScore || 0
        if (confidence >= this.HIGH_CONFIDENCE_THRESHOLD) {
          highConfidence++
        } else if (confidence >= this.MEDIUM_CONFIDENCE_THRESHOLD) {
          mediumConfidence++
        } else {
          lowConfidence++
        }
      })

      const averageReviewCount = submissions.reduce((sum, sub) => sum + (sub.reviewCount || 0), 0) / submissions.length

      return {
        totalProcessed: submissions.length,
        averageConfidence: submissions.reduce((sum, sub) => sum + (sub.consensusScore || 0), 0) / submissions.length,
        highConfidence,
        mediumConfidence,
        lowConfidence,
        averageReviewCount: Math.round(averageReviewCount * 10) / 10
      }

    } catch (error) {
      console.error('Error getting consensus summary:', error)
      return {
        totalProcessed: 0,
        averageConfidence: 0,
        highConfidence: 0,
        mediumConfidence: 0,
        lowConfidence: 0,
        averageReviewCount: 0
      }
    }
  }
}

// Export singleton instance
export const consensusCalculatorService = new ConsensusCalculatorService()
