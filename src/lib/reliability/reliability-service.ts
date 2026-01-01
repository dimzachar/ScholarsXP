import { prisma } from '@/lib/prisma'
import { calculateReviewerMetrics } from './metrics-calculator'
import { calculateScore, getFormula } from './formulas'
import { ReviewerMetrics, ReliabilityScore, RawReviewerData } from './types'
import { RELIABILITY_CONFIG } from '@/config/reliability'

export class ReliabilityService {
    /**
     * Fetches and calculates reliability scores for a list of reviewers
     */
    async getReliabilityScores(reviewerIds: string[]): Promise<Map<string, ReliabilityScore>> {
        const results = new Map<string, ReliabilityScore>()

        // 1. Fetch raw data for all reviewers
        const reviewersData = await prisma.user.findMany({
            where: { id: { in: reviewerIds } },
            select: {
                id: true,
                username: true,
                email: true,
                missedReviews: true,
                streakWeeks: true,
                peerReviews: {
                    select: {
                        xpScore: true,
                        qualityRating: true,
                        isLate: true,
                        judgmentStatus: true,
                        createdAt: true,
                        submission: {
                            select: { finalXp: true }
                        }
                    },
                    orderBy: { createdAt: 'desc' },

                },
                xpTransactions: {
                    select: {
                        amount: true,
                        type: true
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 50 // Limit to most recent 50 transactions
                }
            }
        })

        // 2. Calculate metrics and scores
        const activeFormulaId = RELIABILITY_CONFIG.ACTIVE_FORMULA
        const formula = getFormula(activeFormulaId)

        for (const rawData of reviewersData) {
            const metrics = calculateReviewerMetrics(rawData as unknown as RawReviewerData)

            // Handle "With/Without Votes" toggle
            const weights = { ...formula.weights }
            if (!RELIABILITY_CONFIG.USE_VOTE_VALIDATION) {
                weights.voteValidation = 0
                // Note: calculateScore already handles redistribution if weights sum != 1
            }

            const score = calculateScore(metrics, weights, formula.defaultValues)

            results.set(rawData.id, {
                score,
                metrics,
                formulaId: activeFormulaId,
                timestamp: new Date()
            })
        }

        return results
    }

    /**
     * Calculates a shadow score for comparison without affecting production
     */
    async getShadowScore(reviewerId: string, shadowFormulaId: string = 'CUSTOM_V1'): Promise<ReliabilityScore | null> {
        const scores = await this.getReliabilityScores([reviewerId])
        const result = scores.get(reviewerId)

        if (!result) return null

        const shadowFormula = getFormula(shadowFormulaId)
        const shadowScore = calculateScore(result.metrics, shadowFormula.weights, shadowFormula.defaultValues)

        return {
            ...result,
            score: shadowScore,
            formulaId: shadowFormulaId
        }
    }
}

export const reliabilityService = new ReliabilityService()
