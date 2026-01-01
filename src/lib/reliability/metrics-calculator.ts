import { ReviewerMetrics, RawReviewerData } from './types'
import { RELIABILITY_CONFIG } from '@/config/reliability'

/**
 * Calculates normalized metrics for a reviewer based on their history
 */
export function calculateReviewerMetrics(data: RawReviewerData): ReviewerMetrics {
    const reviews = data.peerReviews
    const totalReviews = reviews.length
    const { VOTE_VALIDATION_PARAMS, NORMALIZATION } = RELIABILITY_CONFIG

    // Calculate Penalty Score (from XpTransactions)
    const transactions = data.xpTransactions || []
    const penaltyTransactions = transactions.filter(t => t.type === 'PENALTY')
    const totalPenaltyAmount = penaltyTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0)
    const penaltyScore = Math.max(0, 1 - (totalPenaltyAmount / 100))

    // Default metrics for new reviewers
    if (totalReviews === 0) {
        return {
            id: data.id,
            username: data.username || data.email?.split('@')[0] || 'Unknown',
            email: data.email || '',
            totalReviews: 0,
            lateReviews: 0,
            missedReviews: data.missedReviews || 0,
            streakWeeks: data.streakWeeks || 0,
            votesValidated: 0,
            votesInvalidated: 0,
            timeliness: 0.5,
            quality: 0.5,
            accuracy: 0.5,
            voteValidation: 0.5,
            experience: 0,
            missedPenalty: Math.max(0, 1 - ((data.missedReviews || 0) * 0.25)),
            penaltyScore,
            reviewVariance: 0.75,
            latePercentage: 1.0,
            extremeMissCount: 0,
            extremeMissRate: 0,
            avgDeviation: 0,
            avgQualityRating: 0,
        }
    }

    // Timeliness
    const lateReviews = reviews.filter(r => r.isLate).length
    const rawLatePercentage = lateReviews / totalReviews
    const timeliness = 1 - rawLatePercentage
    const latePercentage = 1 - rawLatePercentage

    // Quality
    const qualityRatings = reviews
        .filter(r => r.qualityRating != null)
        .map(r => r.qualityRating!)
    const avgQualityRating = qualityRatings.length > 0
        ? qualityRatings.reduce((a, b) => a + b, 0) / qualityRatings.length
        : 0
    const quality = qualityRatings.length > 0
        ? (avgQualityRating - 1) / 4
        : 0.4

    // Accuracy
    const deviations = reviews
        .filter(r => r.submission?.finalXp != null)
        .map(r => Math.abs(r.xpScore - r.submission!.finalXp!))
    const avgDeviation = deviations.length > 0
        ? deviations.reduce((a, b) => a + b, 0) / deviations.length
        : 0
    const accuracy = deviations.length > 0
        ? Math.max(0, 1 - (avgDeviation / NORMALIZATION.MAX_DEVIATION_FOR_ACCURACY))
        : 0.5

    // Vote Validation (using configurable params)
    const votesValidated = reviews.filter(r => r.judgmentStatus === 'VALIDATED').length
    const votesInvalidated = reviews.filter(r => r.judgmentStatus === 'INVALIDATED').length
    const voteValidation = Math.min(1.0, Math.max(0,
        VOTE_VALIDATION_PARAMS.baseline +
        (votesValidated * VOTE_VALIDATION_PARAMS.bonus) -
        (votesInvalidated * VOTE_VALIDATION_PARAMS.penalty)
    ))

    // Experience
    const experience = Math.min(1, totalReviews / NORMALIZATION.MAX_REVIEWS_FOR_EXPERIENCE)

    // Missed Penalty
    const missedPenalty = Math.max(0, 1 - ((data.missedReviews || 0) * 0.25))

    // Review Variance
    const xpScores = reviews.map(r => r.xpScore)
    const meanXp = xpScores.reduce((a, b) => a + b, 0) / totalReviews
    const varianceXp = xpScores.reduce((sum, s) => sum + Math.pow(s - meanXp, 2), 0) / totalReviews
    const stdDevXp = Math.sqrt(varianceXp)
    const reviewVariance = Math.max(0, 1 - (stdDevXp / NORMALIZATION.MAX_STD_DEV_FOR_VARIANCE))

    // Extreme Misses
    const extremeMissCount = reviews.filter(r =>
        r.submission?.finalXp != null &&
        Math.abs(r.xpScore - r.submission!.finalXp!) > 50
    ).length
    const extremeMissRate = totalReviews > 0 ? extremeMissCount / totalReviews : 0

    return {
        id: data.id,
        username: data.username || data.email?.split('@')[0] || 'Unknown',
        email: data.email || '',
        totalReviews,
        lateReviews,
        missedReviews: data.missedReviews || 0,
        streakWeeks: data.streakWeeks || 0,
        votesValidated,
        votesInvalidated,
        timeliness,
        quality,
        accuracy,
        voteValidation,
        experience,
        missedPenalty,
        penaltyScore,
        reviewVariance,
        latePercentage,
        extremeMissCount,
        extremeMissRate,
        avgDeviation,
        avgQualityRating,
    }
}
