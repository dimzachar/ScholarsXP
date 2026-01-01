import { AuditReviewer, DetectedPattern, RootCause } from './types'

export function calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    return Math.sqrt(variance)
}

export function detectPatterns(
    badButAccurate: AuditReviewer[],
    goodButInaccurate: AuditReviewer[]
): DetectedPattern[] {
    const patterns: DetectedPattern[] = []

    // Pattern 1: Slow but Thoughtful
    const slowButThoughtful = badButAccurate.filter(r =>
        r.timeliness < 0.7 && r.accuracy > 0.75
    )
    if (slowButThoughtful.length >= 3) {
        patterns.push({
            id: 'slow-thoughtful',
            name: 'Slow but Thoughtful',
            description: `${slowButThoughtful.length} reviewers are consistently late but highly accurate.`,
            confidence: slowButThoughtful.length / Math.max(1, badButAccurate.length),
            affectedReviewers: slowButThoughtful.map(r => r.id),
            suggestedAction: 'Consider reducing timeliness weight.'
        })
    }

    // Pattern 2: Polarized Scores
    const polarizedFast = goodButInaccurate.filter(r => {
        const scores = r.reviewHistory.map(h => h.reviewerXpScore)
        const hasExtremes = scores.some(s => s <= 10 || s >= 90)
        return hasExtremes
    })
    if (polarizedFast.length >= 3) {
        patterns.push({
            id: 'polarized-fast',
            name: 'Polarized Fast Reviewers',
            description: `${polarizedFast.length} fast reviewers give extreme scores (0-10 or 90-100).`,
            confidence: polarizedFast.length / Math.max(1, goodButInaccurate.length),
            affectedReviewers: polarizedFast.map(r => r.id),
            suggestedAction: 'Add score polarization penalty to formula.'
        })
    }

    // Pattern 3: Calculation Bug Check
    const invertedAccuracy = badButAccurate.filter(r => {
        const avgDev = r.reviewHistory.length > 0
            ? r.reviewHistory.reduce((sum, h) => sum + h.deviation, 0) / r.reviewHistory.length
            : 0
        return avgDev > 20 && r.accuracy > 0.7 // High deviation but high "accuracy" = bug
    })
    if (invertedAccuracy.length >= 2) {
        patterns.push({
            id: 'calculation-bug',
            name: 'Possible Calculation Bug',
            description: `${invertedAccuracy.length} reviewers have high deviation but high accuracy score.`,
            confidence: 0.9,
            affectedReviewers: invertedAccuracy.map(r => r.id),
            suggestedAction: 'Audit the accuracy calculation in route.ts'
        })
    }

    // Pattern 4: Sample Size Warning
    if (badButAccurate.length < 3 || goodButInaccurate.length < 3) {
        patterns.push({
            id: 'sample-size',
            name: 'Small Sample Size',
            description: 'Not enough reviewers to draw reliable conclusions.',
            confidence: 0.3,
            affectedReviewers: [],
            suggestedAction: 'Collect more data before making formula changes.'
        })
    }

    return patterns
}

export function inferRootCause(
    patterns: DetectedPattern[],
    badButAccurate: AuditReviewer[],
    goodButInaccurate: AuditReviewer[]
): RootCause {
    // Priority order for root cause inference
    if (patterns.find(p => p.id === 'calculation-bug' && p.confidence > 0.7)) {
        return 'CALCULATION_BUG'
    }
    if (patterns.find(p => p.id === 'slow-thoughtful' && p.confidence > 0.5)) {
        return 'SLOW_BUT_THOUGHTFUL'
    }
    if (patterns.find(p => p.id === 'polarized-fast' && p.confidence > 0.5)) {
        return 'POLARIZED_FAST_REVIEWERS'
    }
    if (patterns.find(p => p.id === 'sample-size')) {
        return 'SAMPLE_SIZE_ARTIFACT'
    }

    // Check for consensus bias (fast reviewers cluster together)
    const fastReviewerScores = goodButInaccurate.flatMap(r =>
        r.reviewHistory.map(h => h.reviewerXpScore)
    )
    const slowReviewerScores = badButAccurate.flatMap(r =>
        r.reviewHistory.map(h => h.reviewerXpScore)
    )

    if (fastReviewerScores.length > 0 && slowReviewerScores.length > 0) {
        const fastStdDev = calculateStdDev(fastReviewerScores)
        const slowStdDev = calculateStdDev(slowReviewerScores)

        if (fastStdDev < slowStdDev * 0.5) {
            return 'CONSENSUS_BIAS' // Fast reviewers are too clustered
        }
    }

    return 'UNKNOWN'
}
