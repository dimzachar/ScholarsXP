import { FormulaDefinition, FormulaWeights, ReviewerMetrics } from './types'

/**
 * Formula A: Legacy Production Baseline
 */
export const LEGACY_FORMULA: FormulaDefinition = {
    id: 'LEGACY',
    name: 'Formula A: Current (Baseline)',
    description: 'Legacy production formula: 30% timeliness + 70% quality',
    weights: {
        timeliness: 0.30,
        quality: 0.70,
        accuracy: 0,
        voteValidation: 0,
        experience: 0,
        missedPenalty: 0,
        penaltyScore: 0,
        reviewVariance: 0,
        latePercentage: 0,
    },
    defaultValues: {
        quality: 0.625 // 3.5 out of 5 (normalized: (3.5-1)/4)
    }
}

/**
 * Custom Formula V1: Optimized Data-Driven
 */
export const CUSTOM_V1_FORMULA: FormulaDefinition = {
    id: 'CUSTOM_V1',
    name: 'Custom Formula V1 (Shadow)',
    description: 'Optimized (Exp 39.9%, Time 31.7%, Pen 13.3%, Late 5.5%, Var 3.2%, Acc 2.8%, Missed 2.2%, Vote 1.4%)',
    weights: {
        timeliness: 0.317,
        quality: 0,
        accuracy: 0.028,
        voteValidation: 0.014,
        experience: 0.399,
        missedPenalty: 0.022,
        penaltyScore: 0.133,
        reviewVariance: 0.032,
        latePercentage: 0.055,
    },
    defaultValues: {
        voteValidation: 0.65
    }
}

export const CUSTOM_V2_FORMULA: FormulaDefinition = {
    id: 'CUSTOM_V2',
    name: 'Custom Formula V2 (Vote Validation)',
    description: 'Optimized Vote Focus (Exp 39.6%, Vote 16.1%, Acc 15.3%, Late 11.1%, Time 9.9%, Missed 4.8%, Pen 2.0%, Var 1.2%)',
    weights: {
        timeliness: 0.099,
        quality: 0,
        accuracy: 0.153,
        voteValidation: 0.161,
        experience: 0.396,
        missedPenalty: 0.048,
        penaltyScore: 0.020,
        reviewVariance: 0.012,
        latePercentage: 0.111,
    },
    defaultValues: {
        voteValidation: 0.65
    }
}

/**
 * Calculates the final reliability score using a specific formula
 */
export function calculateScore(
    metrics: ReviewerMetrics,
    weights: FormulaWeights,
    defaultValues?: Partial<Record<keyof FormulaWeights, number>>
): number {
    // 1. Identify metrics with missing data
    const hasQuality = metrics.avgQualityRating > 0
    const hasAccuracy = metrics.totalReviews > 0 && metrics.accuracy !== 0.5
    const hasVotes = metrics.votesValidated > 0 || metrics.votesInvalidated > 0

    // 2. Prepare values (use defaults if metric is missing and default is provided)
    const values = { ...metrics }
    const adjustedWeights = { ...weights }
    const missingMetrics: (keyof FormulaWeights)[] = []

    // Quality check
    if (!hasQuality && weights.quality > 0) {
        if (defaultValues?.quality !== undefined) {
            values.quality = defaultValues.quality
        } else {
            missingMetrics.push('quality')
        }
    }

    // Accuracy check
    if (!hasAccuracy && weights.accuracy > 0) {
        if (defaultValues?.accuracy !== undefined) {
            values.accuracy = defaultValues.accuracy
        } else {
            missingMetrics.push('accuracy')
        }
    }

    // Vote Validation check
    if (!hasVotes && weights.voteValidation > 0) {
        if (defaultValues?.voteValidation !== undefined) {
            values.voteValidation = defaultValues.voteValidation
        } else {
            missingMetrics.push('voteValidation')
        }
    }

    // 3. Redistribute weights for remaining missing metrics
    if (missingMetrics.length > 0) {
        let weightToRedistribute = 0
        missingMetrics.forEach(m => {
            weightToRedistribute += adjustedWeights[m]
            adjustedWeights[m] = 0
        })

        /**
         * REDISTRIBUTION LOGIC:
         * If a metric is missing (e.g. quality data for new reviewers), its weight is 
         * redistributed among active metrics. By default, timeliness, experience, 
         * and penaltyScore are considered "active" even if their initial weight is 0.
         * This ensures a stable baseline (e.g. 77.1% for new on-time reviewers).
         */
        const activeMetrics = (Object.keys(adjustedWeights) as (keyof FormulaWeights)[]).filter(k =>
            !missingMetrics.includes(k) && (adjustedWeights[k] > 0 || ['timeliness', 'experience', 'penaltyScore'].includes(k))
        )

        if (activeMetrics.length > 0) {
            const share = weightToRedistribute / activeMetrics.length
            activeMetrics.forEach(m => {
                adjustedWeights[m] += share
            })
        }
    }

    // 4. Calculate weighted sum
    const score =
        (values.timeliness * adjustedWeights.timeliness) +
        (values.quality * adjustedWeights.quality) +
        (values.accuracy * adjustedWeights.accuracy) +
        (values.voteValidation * adjustedWeights.voteValidation) +
        (values.experience * adjustedWeights.experience) +
        (values.missedPenalty * adjustedWeights.missedPenalty) +
        (values.penaltyScore * adjustedWeights.penaltyScore) +
        (values.reviewVariance * adjustedWeights.reviewVariance) +
        (values.latePercentage * adjustedWeights.latePercentage)

    return Math.max(0.0, Math.min(1.0, score))
}

/**
 * Gets the formula definition by ID
 */
export function getFormula(id: string): FormulaDefinition {
    switch (id) {
        case 'CUSTOM_V1':
            return CUSTOM_V1_FORMULA
        case 'CUSTOM_V2':
            return CUSTOM_V2_FORMULA
        case 'LEGACY':
        default:
            return LEGACY_FORMULA
    }
}

export const identifyBad = (r: ReviewerMetrics): { isBad: boolean; reasons: string[] } => {
    const reasons: string[] = []

    // Hard failures (ANY one = bad)
    if (r.missedPenalty < 0.75) reasons.push('Misses 25%+ of assignments')
    if (r.penaltyScore < 0.80) reasons.push('Admin penalties (20+ points)')
    // if (r.extremeMissCount >= 2 && r.totalReviews >= 5) reasons.push(`${r.extremeMissCount} extreme misses (>50 XP off)`)

    // If any hard failure, they're bad immediately
    if (reasons.length > 0) {
        return { isBad: true, reasons }
    }

    // Soft failures (need 2+)
    const softFailures: string[] = []
    if (r.timeliness < 0.70) softFailures.push('Very late (<70%)')
    if (r.accuracy < 0.50 && r.totalReviews > 5) softFailures.push('Very low accuracy (<50%)')
    // if (r.totalReviews > 25 && r.extremeMissRate > 0.15) softFailures.push('Frequent extreme judgment errors (>15% rate)')

    const isBad = softFailures.length >= 2
    return { isBad, reasons: softFailures }
}

export const getBadReviewerReason = (r: ReviewerMetrics): string | null => {
    const result = identifyBad(r)
    return result.isBad ? result.reasons.join(', ') : null
}

export const identifyGood = (r: ReviewerMetrics): { isGood: boolean; strengths: string[] } => {
    // Core requirements (ALL must be true)
    // REMOVED: reviewVariance check - variance is normal for veterans
    const coreRequirements = {
        experience: r.experience >= 0.50,        // 25+ reviews
        reliability: r.missedPenalty >= 0.90,    // <10% miss rate
        noPenalties: r.penaltyScore >= 0.90,     // No admin issues
        timeliness: r.timeliness >= 0.85         // Usually on time
    }

    const corePass = Object.values(coreRequirements).every(x => x)
    if (!corePass) return { isGood: false, strengths: [] }

    // Bonus strengths (need 1+)
    const strengths: string[] = []
    if (r.experience >= 1.0) strengths.push('Veteran (50+ reviews)')
    if (r.timeliness >= 0.95) strengths.push('Very punctual (95%+)')
    if (r.accuracy >= 0.70) strengths.push('Accurate (70%+)')
    if (r.accuracy >= 0.65) strengths.push('Good accuracy (65%+)')

    return { isGood: strengths.length >= 1, strengths }
}

export function classifyReviewers(reviewers: ReviewerMetrics[]) {
    const good: { reviewer: ReviewerMetrics; strengths: string[] }[] = []
    const bad: { reviewer: ReviewerMetrics; reasons: string[] }[] = []
    const middle: ReviewerMetrics[] = []

    for (const r of reviewers) {
        const badResult = identifyBad(r)
        const goodResult = identifyGood(r)

        if (badResult.isBad) {
            bad.push({ reviewer: r, reasons: badResult.reasons })
        } else if (goodResult.isGood) {
            good.push({ reviewer: r, strengths: goodResult.strengths })
        } else {
            middle.push(r)
        }
    }

    return { good, middle, bad }
}
