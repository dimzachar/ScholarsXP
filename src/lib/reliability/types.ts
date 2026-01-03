/**
 * Core types for the Reliability Formula System
 */

export interface ReviewerMetrics {
    id: string
    username: string
    email: string

    // Raw counts
    totalReviews: number
    lateReviews: number
    missedReviews: number
    streakWeeks: number
    votesValidated: number
    votesInvalidated: number

    // Calculated (0-1 normalized)
    timeliness: number
    quality: number
    accuracy: number
    voteValidation: number
    experience: number
    missedPenalty: number
    penaltyScore: number
    reviewVariance: number
    latePercentage: number
    extremeMissCount: number
    extremeMissRate: number

    // Average deviation in XP points
    avgDeviation: number
    avgQualityRating: number
}

export interface FormulaWeights {
    timeliness: number
    quality: number
    accuracy: number
    voteValidation: number
    experience: number
    missedPenalty: number
    penaltyScore: number
    reviewVariance: number
    latePercentage: number
}

export interface ReliabilityScore {
    score: number
    metrics: ReviewerMetrics
    formulaId: string
    timestamp: Date
}

export interface FormulaDefinition {
    id: string
    name: string
    description: string
    weights: FormulaWeights
    defaultValues?: Partial<Record<keyof FormulaWeights, number>>
}

/**
 * Interface for raw data required to calculate metrics
 */
export interface RawReviewerData {
    id: string
    username: string | null
    email: string
    missedReviews: number
    streakWeeks: number
    peerReviews: {
        xpScore: number
        qualityRating: number | null
        isLate: boolean
        judgmentStatus: string
        createdAt: Date
        submission: { finalXp: number | null } | null
    }[]
    xpTransactions: {
        amount: number
        type: string
    }[]
}
