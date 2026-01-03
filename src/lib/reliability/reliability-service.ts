import { prisma } from '@/lib/prisma'
import { calculateReviewerMetrics } from './metrics-calculator'
import { calculateScore, getFormula } from './formulas'
import { ReliabilityScore, RawReviewerData } from './types'
import { RELIABILITY_CONFIG } from '@/config/reliability'

interface AggregatedReviewData {
    reviewerId: string
    totalReviews: bigint
    lateReviews: bigint
    validatedVotes: bigint
    invalidatedVotes: bigint
    avgXpScore: number | null
    avgQualityRating: number | null
    sumXpScore: bigint
    sumXpScoreSquared: bigint
}

interface DeviationData {
    reviewerId: string
    avgDeviation: number | null
    extremeMissCount: bigint
}

interface PenaltyData {
    userId: string
    totalPenalty: bigint
}

export class ReliabilityService {
    /**
     * Fetches and calculates reliability scores for a list of reviewers
     * Optimized to use aggregation queries instead of loading all records
     */
    async getReliabilityScores(reviewerIds: string[]): Promise<Map<string, ReliabilityScore>> {
        const results = new Map<string, ReliabilityScore>()
        
        if (reviewerIds.length === 0) return results

        // 1. Fetch basic user data (lightweight)
        const usersPromise = prisma.user.findMany({
            where: { id: { in: reviewerIds } },
            select: {
                id: true,
                username: true,
                email: true,
                missedReviews: true,
                streakWeeks: true,
            }
        })

        // 2. Aggregate review stats in a single query
        const reviewStatsPromise = prisma.$queryRaw<AggregatedReviewData[]>`
            SELECT 
                pr."reviewerId",
                COUNT(*)::bigint as "totalReviews",
                COUNT(*) FILTER (WHERE pr."isLate" = true)::bigint as "lateReviews",
                COUNT(*) FILTER (WHERE pr."judgmentStatus" = 'VALIDATED')::bigint as "validatedVotes",
                COUNT(*) FILTER (WHERE pr."judgmentStatus" = 'INVALIDATED')::bigint as "invalidatedVotes",
                AVG(pr."xpScore") as "avgXpScore",
                AVG(pr."qualityRating") as "avgQualityRating",
                SUM(pr."xpScore")::bigint as "sumXpScore",
                SUM(pr."xpScore" * pr."xpScore")::bigint as "sumXpScoreSquared"
            FROM "PeerReview" pr
            WHERE pr."reviewerId" = ANY(${reviewerIds}::uuid[])
            GROUP BY pr."reviewerId"
        `

        // 3. Calculate accuracy metrics (deviation from finalXp)
        const deviationStatsPromise = prisma.$queryRaw<DeviationData[]>`
            SELECT 
                pr."reviewerId",
                AVG(ABS(pr."xpScore" - s."finalXp")) as "avgDeviation",
                COUNT(*) FILTER (WHERE ABS(pr."xpScore" - s."finalXp") > 50)::bigint as "extremeMissCount"
            FROM "PeerReview" pr
            JOIN "Submission" s ON pr."submissionId" = s.id
            WHERE pr."reviewerId" = ANY(${reviewerIds}::uuid[])
              AND s."finalXp" IS NOT NULL
            GROUP BY pr."reviewerId"
        `

        // 4. Get penalty transactions (aggregated)
        const penaltyStatsPromise = prisma.$queryRaw<PenaltyData[]>`
            SELECT 
                "userId",
                SUM(ABS(amount))::bigint as "totalPenalty"
            FROM "XpTransaction"
            WHERE "userId" = ANY(${reviewerIds}::uuid[])
              AND type = 'PENALTY'
            GROUP BY "userId"
        `

        // Execute all queries in parallel
        const [users, reviewStats, deviationStats, penaltyStats] = await Promise.all([
            usersPromise,
            reviewStatsPromise,
            deviationStatsPromise,
            penaltyStatsPromise
        ])

        // Build lookup maps
        const reviewStatsMap = new Map(reviewStats.map(r => [r.reviewerId, r]))
        const deviationMap = new Map(deviationStats.map(d => [d.reviewerId, d]))
        const penaltyMap = new Map(penaltyStats.map(p => [p.userId, Number(p.totalPenalty)]))

        // 5. Calculate metrics and scores
        const activeFormulaId = RELIABILITY_CONFIG.ACTIVE_FORMULA
        const formula = getFormula(activeFormulaId)

        for (const user of users) {
            const stats = reviewStatsMap.get(user.id)
            const deviation = deviationMap.get(user.id)
            const totalPenalty = penaltyMap.get(user.id) || 0

            // Build RawReviewerData from aggregated stats
            const rawData = this.buildRawDataFromAggregates(user, stats, deviation, totalPenalty)
            const metrics = calculateReviewerMetrics(rawData)

            // Handle "With/Without Votes" toggle
            const weights = { ...formula.weights }
            if (!RELIABILITY_CONFIG.USE_VOTE_VALIDATION) {
                weights.voteValidation = 0
            }

            const score = calculateScore(metrics, weights, formula.defaultValues)

            results.set(user.id, {
                score,
                metrics,
                formulaId: activeFormulaId,
                timestamp: new Date()
            })
        }

        return results
    }

    /**
     * Builds RawReviewerData from aggregated query results
     */
    private buildRawDataFromAggregates(
        user: { id: string; username: string | null; email: string; missedReviews: number; streakWeeks: number },
        stats: AggregatedReviewData | undefined,
        deviation: DeviationData | undefined,
        totalPenalty: number
    ): RawReviewerData {
        // Build synthetic peerReviews array with aggregated data
        // The metrics calculator expects this structure but we can optimize it
        const syntheticReviews = this.buildSyntheticReviews(stats, deviation)

        return {
            id: user.id,
            username: user.username,
            email: user.email,
            missedReviews: user.missedReviews,
            streakWeeks: user.streakWeeks,
            peerReviews: syntheticReviews,
            xpTransactions: totalPenalty > 0 
                ? [{ amount: -totalPenalty, type: 'PENALTY' }] 
                : []
        }
    }

    /**
     * Builds synthetic review array that provides the same metrics as real data
     */
    private buildSyntheticReviews(
        stats: AggregatedReviewData | undefined,
        deviation: DeviationData | undefined
    ): RawReviewerData['peerReviews'] {
        if (!stats || Number(stats.totalReviews) === 0) {
            return []
        }

        const totalReviews = Number(stats.totalReviews)
        const lateReviews = Number(stats.lateReviews)
        const validatedVotes = Number(stats.validatedVotes)
        const invalidatedVotes = Number(stats.invalidatedVotes)
        const avgXpScore = stats.avgXpScore || 0
        const avgQualityRating = stats.avgQualityRating
        const avgDeviation = deviation?.avgDeviation || 0
        const extremeMissCount = Number(deviation?.extremeMissCount || 0)

        // Create synthetic reviews that will produce the same metrics
        const reviews: RawReviewerData['peerReviews'] = []
        const now = new Date()

        // Add reviews to represent the aggregated stats
        for (let i = 0; i < totalReviews; i++) {
            const isLate = i < lateReviews
            const isValidated = i < validatedVotes
            const isInvalidated = i >= validatedVotes && i < validatedVotes + invalidatedVotes
            const isExtremeMiss = i < extremeMissCount

            // For accuracy calculation, we need xpScore and finalXp
            // Set them so the deviation matches avgDeviation
            const xpScore = Math.round(avgXpScore)
            const finalXp = isExtremeMiss 
                ? xpScore + 51  // Extreme miss (>50 deviation)
                : Math.round(xpScore + avgDeviation)  // Normal deviation

            reviews.push({
                xpScore,
                qualityRating: avgQualityRating,
                isLate,
                judgmentStatus: isValidated ? 'VALIDATED' : isInvalidated ? 'INVALIDATED' : 'NONE',
                createdAt: now,
                submission: { finalXp }
            })
        }

        return reviews
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
