import { ReviewerMetrics, FormulaWeights } from '@/lib/reliability/types'
import { FormulaPreset, FormulaResult, ComparisonStats, RankChange, FeatureImportanceMatrix, ClusterProfile, CorrelationMatrix, RecommendationData, FormulaEvaluation, ConsensusImpactData, StressTestResult } from './types'

// Formula presets based on the plan document
export const FORMULA_PRESETS: FormulaPreset[] = [
    {
        id: 'current',
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
    },
    {
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
    },
    {
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
    },
    {
        id: 'withAccuracy',
        name: 'Formula B: Timeliness + Accuracy + Experience',
        description: 'Focus on speed and accuracy: 40% timeliness + 30% accuracy + 30% experience',
        weights: {
            timeliness: 0.40,
            quality: 0,
            accuracy: 0.30,
            voteValidation: 0,
            experience: 0.30,
            missedPenalty: 0,
            penaltyScore: 0,
            reviewVariance: 0,
            latePercentage: 0,
        },
    },
    {
        id: 'withVoting',
        name: 'Formula C: Community Consensus',
        description: 'Prioritizes voting outcomes: 25% timeliness + 35% voting + 20% accuracy + 20% experience',
        weights: {
            timeliness: 0.25,
            quality: 0,
            accuracy: 0.20,
            voteValidation: 0.35,
            experience: 0.20,
            missedPenalty: 0,
            penaltyScore: 0,
            reviewVariance: 0,
            latePercentage: 0,
        },
    },
    {
        id: 'withExperience',
        name: 'Formula D: Experience & Reliability',
        description: 'Rewards veterans: 30% timeliness + 25% experience + 25% penaltyScore + 20% latePercentage',
        weights: {
            timeliness: 0.30,
            quality: 0,
            accuracy: 0,
            voteValidation: 0,
            experience: 0.25,
            missedPenalty: 0,
            penaltyScore: 0.25,
            reviewVariance: 0,
            latePercentage: 0.20,
        },
    },
    {
        id: 'balanced',
        name: 'Formula E: Balanced (Data-Driven)',
        description: 'Equal weight to available metrics (excludes quality/voting if no data)',
        weights: {
            timeliness: 0.20,
            quality: 0,
            accuracy: 0.15,
            voteValidation: 0,
            experience: 0.20,
            missedPenalty: 0.10,
            penaltyScore: 0.15,
            reviewVariance: 0,
            latePercentage: 0.20,
        },
    },
]

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

export function calculateScoreWithBreakdown(
    metrics: ReviewerMetrics,
    weights: FormulaWeights,
    defaultValues?: Partial<Record<keyof FormulaWeights, number>>
): FormulaResult {
    const values = { ...metrics }

    // Apply defaults for breakdown if data is missing
    if (metrics.avgQualityRating === 0 && defaultValues?.quality !== undefined) values.quality = defaultValues.quality
    if (metrics.accuracy === 0.5 && defaultValues?.accuracy !== undefined) values.accuracy = defaultValues.accuracy
    if (metrics.votesValidated === 0 && metrics.votesInvalidated === 0 && defaultValues?.voteValidation !== undefined) values.voteValidation = defaultValues.voteValidation

    const breakdown = [
        { component: 'Timeliness', rawValue: values.timeliness, weight: weights.timeliness, contribution: values.timeliness * weights.timeliness },
        { component: 'Quality', rawValue: values.quality, weight: weights.quality, contribution: values.quality * weights.quality },
        { component: 'Accuracy', rawValue: values.accuracy, weight: weights.accuracy, contribution: values.accuracy * weights.accuracy },
        { component: 'Vote Validation', rawValue: values.voteValidation, weight: weights.voteValidation, contribution: values.voteValidation * weights.voteValidation },
        { component: 'Experience', rawValue: values.experience, weight: weights.experience, contribution: values.experience * weights.experience },
        { component: 'Missed Penalty', rawValue: values.missedPenalty, weight: weights.missedPenalty, contribution: values.missedPenalty * weights.missedPenalty },
        { component: 'Penalty Score', rawValue: values.penaltyScore, weight: weights.penaltyScore, contribution: values.penaltyScore * weights.penaltyScore },
        { component: 'Review Variance', rawValue: values.reviewVariance, weight: weights.reviewVariance, contribution: values.reviewVariance * weights.reviewVariance },
        { component: 'Late %', rawValue: values.latePercentage, weight: weights.latePercentage, contribution: values.latePercentage * weights.latePercentage },
    ].filter(b => b.weight > 0)

    const score = breakdown.reduce((sum, b) => sum + b.contribution, 0)

    return {
        reviewerId: metrics.id,
        username: metrics.username,
        score: Math.max(0.0, Math.min(1.0, score)),
        breakdown,
    }
}

export function calculateStats(scores: number[]): ComparisonStats {
    if (scores.length === 0) {
        return { mean: 0, stdDev: 0, min: 0, max: 0, median: 0, distribution: [] }
    }

    const sorted = [...scores].sort((a, b) => a - b)
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length
    const stdDev = Math.sqrt(variance)
    const min = sorted[0]
    const max = sorted[sorted.length - 1]
    const median = sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)]

    // Create distribution buckets (0.0-0.1, 0.1-0.2, ..., 0.9-1.0)
    const distribution = Array.from({ length: 10 }, (_, i) => ({
        bucket: (i + 1) / 10,
        count: 0,
    }))

    scores.forEach(score => {
        const bucketIndex = Math.min(Math.floor(score * 10), 9)
        distribution[bucketIndex].count++
    })

    return { mean, stdDev, min, max, median, distribution }
}

export function calculateRankChanges(
    reviewers: ReviewerMetrics[],
    currentWeights: FormulaWeights,
    newWeights: FormulaWeights,
    newDefaultValues?: Partial<Record<keyof FormulaWeights, number>>
): RankChange[] {
    const currentScores = reviewers.map(r => ({
        id: r.id,
        username: r.username,
        score: calculateScore(r, currentWeights, FORMULA_PRESETS.find(p => p.id === 'current')?.defaultValues),
    }))

    const newScores = reviewers.map(r => ({
        id: r.id,
        username: r.username,
        score: calculateScore(r, newWeights, newDefaultValues),
    }))

    const currentRanked = [...currentScores].sort((a, b) => b.score - a.score)
    const newRanked = [...newScores].sort((a, b) => b.score - a.score)

    const currentRankMap = new Map(currentRanked.map((r, i) => [r.id, i + 1]))
    const newRankMap = new Map(newRanked.map((r, i) => [r.id, i + 1]))

    return reviewers.map(r => {
        const currentScore = currentScores.find(s => s.id === r.id)!.score
        const newScore = newScores.find(s => s.id === r.id)!.score
        const currentRank = currentRankMap.get(r.id)!
        const newRank = newRankMap.get(r.id)!

        return {
            reviewerId: r.id,
            username: r.username,
            currentScore,
            newScore,
            scoreDelta: newScore - currentScore,
            currentRank,
            newRank,
            rankDelta: currentRank - newRank,
        }
    }).sort((a, b) => Math.abs(b.rankDelta) - Math.abs(a.rankDelta))
}

export function normalizeWeights(weights: FormulaWeights): FormulaWeights {
    const total = Object.values(weights).reduce((a, b) => a + b, 0)
    if (total === 0) return weights

    return {
        timeliness: weights.timeliness / total,
        quality: weights.quality / total,
        accuracy: weights.accuracy / total,
        voteValidation: weights.voteValidation / total,
        experience: weights.experience / total,
        missedPenalty: weights.missedPenalty / total,
        penaltyScore: weights.penaltyScore / total,
        reviewVariance: weights.reviewVariance / total,
        latePercentage: weights.latePercentage / total,
    }
}

export function getWeightsTotal(weights: FormulaWeights): number {
    return Object.values(weights).reduce((a, b) => a + b, 0)
}

export function kMeans1D(data: number[], k: number = 2, maxIterations: number = 10): { centroids: number[], clusters: number[][] } {
    if (data.length === 0) return { centroids: [], clusters: [] }
    if (data.length < k) return { centroids: data, clusters: data.map(d => [d]) }

    let centroids = [Math.min(...data), Math.max(...data)]
    if (k > 2) {
        const step = (centroids[1] - centroids[0]) / (k - 1)
        centroids = Array.from({ length: k }, (_, i) => centroids[0] + i * step)
    }

    let clusters: number[][] = Array.from({ length: k }, () => [])

    for (let iter = 0; iter < maxIterations; iter++) {
        clusters = Array.from({ length: k }, () => [])
        data.forEach(point => {
            let minDist = Infinity
            let clusterIndex = 0
            centroids.forEach((c, i) => {
                const dist = Math.abs(point - c)
                if (dist < minDist) {
                    minDist = dist
                    clusterIndex = i
                }
            })
            clusters[clusterIndex].push(point)
        })

        const newCentroids = clusters.map(cluster => {
            if (cluster.length === 0) return 0
            return cluster.reduce((a, b) => a + b, 0) / cluster.length
        })

        if (newCentroids.every((c, i) => Math.abs(c - centroids[i]) < 0.001)) {
            break
        }
        centroids = newCentroids
    }

    return { centroids, clusters }
}

export function calculateConfidence(
    reviewers: ReviewerMetrics[],
    weights: FormulaWeights,
    iterations: number = 100
): { value: number, margin: number } {
    if (reviewers.length < 5) return { value: 0, margin: 0 }
    const bootstrapScores: number[] = []
    for (let i = 0; i < iterations; i++) {
        const sample = Array.from({ length: reviewers.length }, () => {
            const idx = Math.floor(Math.random() * reviewers.length)
            return reviewers[idx]
        })
        const scores = sample.map(r => calculateScore(r, weights))
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length
        const stdDev = Math.sqrt(scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length)
        bootstrapScores.push(stdDev)
    }
    const meanStd = bootstrapScores.reduce((a, b) => a + b, 0) / iterations
    const variance = bootstrapScores.reduce((sum, s) => sum + Math.pow(s - meanStd, 2), 0) / iterations
    const margin = 1.96 * Math.sqrt(variance)
    return { value: meanStd, margin }
}

export function normalizeWeightsForData(weights: FormulaWeights, reviewers: ReviewerMetrics[]): FormulaWeights {
    const hasQuality = reviewers.some(r => r.avgQualityRating > 0)
    const hasAccuracy = reviewers.some(r => r.accuracy !== 0.5)
    const hasVotes = reviewers.some(r => r.votesValidated > 0 || r.votesInvalidated > 0)

    const newWeights = { ...weights }

    // If a metric is missing data, redistribute its weight to other active metrics
    // instead of just letting normalizeWeights handle it (which might be biased)
    const missingMetrics: (keyof FormulaWeights)[] = []
    if (!hasQuality && weights.quality > 0) missingMetrics.push('quality')
    if (!hasAccuracy && weights.accuracy > 0) missingMetrics.push('accuracy')
    if (!hasVotes && weights.voteValidation > 0) missingMetrics.push('voteValidation')

    if (missingMetrics.length > 0) {
        let weightToRedistribute = 0
        missingMetrics.forEach(m => {
            weightToRedistribute += newWeights[m]
            newWeights[m] = 0
        })

        const activeMetrics = (Object.keys(newWeights) as (keyof FormulaWeights)[]).filter(k =>
            !missingMetrics.includes(k) && (newWeights[k] > 0 || ['timeliness', 'experience', 'penaltyScore'].includes(k))
        )

        if (activeMetrics.length > 0) {
            const share = weightToRedistribute / activeMetrics.length
            activeMetrics.forEach(m => {
                newWeights[m] += share
            })
        }
    }

    return normalizeWeights(newWeights)
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

export function getCombinedBadReviewers(reviewers: ReviewerMetrics[], weights: FormulaWeights): { reviewers: ReviewerMetrics[], reasons: Map<string, string> } {
    const badReviewers: ReviewerMetrics[] = []
    const reasons = new Map<string, string>()

    // 1. Static Signals
    reviewers.forEach(r => {
        const reason = getBadReviewerReason(r)
        if (reason) {
            badReviewers.push(r)
            reasons.set(r.id, reason)
        }
    })

    // 2. Natural Cluster Signal
    const metricKeys: (keyof FormulaWeights)[] = ['accuracy', 'timeliness', 'experience', 'penaltyScore', 'latePercentage', 'reviewVariance', 'voteValidation', 'quality']
    const globalScores = reviewers.map(r => {
        let sum = 0; let count = 0
        metricKeys.forEach(k => {
            if (k === 'quality' && r.avgQualityRating === 0) return
            if (k === 'accuracy' && r.accuracy === 0.5) return
            sum += (r[k] as number); count++
        })
        return count > 0 ? sum / count : 0.5
    })
    const { centroids } = kMeans1D(globalScores, Math.min(3, reviewers.length))
    const lowCentroid = Math.min(...centroids)

    reviewers.forEach((r, idx) => {
        if (globalScores[idx] <= lowCentroid + 0.05) {
            if (!badReviewers.find(br => br.id === r.id)) {
                badReviewers.push(r)
                reasons.set(r.id, "Natural Low Signal")
            }
        }
    })

    return { reviewers: badReviewers, reasons }
}

export function evaluateFormula(
    formulaId: string,
    reviewers: ReviewerMetrics[],
    weights: FormulaWeights,
    currentWeights: FormulaWeights
): FormulaEvaluation {
    const preset = FORMULA_PRESETS.find(p => p.id === formulaId)
    const formulaName = formulaId === 'custom' ? 'Custom Formula' : preset?.name || formulaId

    const scores = reviewers.map(r => calculateScore(r, weights, preset?.defaultValues))
    const currentScores = reviewers.map(r => calculateScore(r, currentWeights, FORMULA_PRESETS.find(p => p.id === 'current')?.defaultValues))
    const stats = calculateStats(scores)

    const discrimination = Math.min(1, stats.stdDev / 0.2)
    const { margin: discriminationMargin } = calculateConfidence(reviewers, weights)

    const { reviewers: badReviewers } = getCombinedBadReviewers(reviewers, weights)
    const sortedScores = [...scores].sort((a, b) => a - b)
    const badThreshold = sortedScores[Math.max(0, Math.min(sortedScores.length - 1, badReviewers.length - 1))] || stats.mean

    const badInBottom = badReviewers.filter(r => calculateScore(r, weights) <= badThreshold).length
    const knownBadAccuracy = badReviewers.length > 0 ? badInBottom / badReviewers.length : 1.0

    const newReviewers = reviewers.filter(r => r.totalReviews < 5)
    const newReviewerAvg = newReviewers.length > 0 ? newReviewers.reduce((a, b) => a + calculateScore(b, weights), 0) / newReviewers.length : 0.5
    const fairness = Math.max(0, 1 - Math.abs(newReviewerAvg - 0.5) / 0.25)

    const isCurrent = formulaId === 'current'
    let stability = 1.0
    if (!isCurrent) {
        stability = Math.max(0, calculateCorrelation(scores, currentScores))
    }

    let redundancyPenalty = 0
    const activeKeys = (Object.keys(weights) as (keyof FormulaWeights)[]).filter(k => weights[k] > 0.1)
    for (let i = 0; i < activeKeys.length; i++) {
        for (let j = i + 1; j < activeKeys.length; j++) {
            const k1 = activeKeys[i]; const k2 = activeKeys[j]
            const corr = Math.abs(calculateCorrelation(reviewers.map(r => r[k1] as number), reviewers.map(r => r[k2] as number)))
            if (corr > 0.7) redundancyPenalty += (corr - 0.7) * 0.5
        }
    }

    const matrix = calculateFeatureMatrix(reviewers, weights)
    const avgImportance = matrix.metrics.reduce((sum, m) => sum + m.importance, 0) / matrix.metrics.length
    const importanceBonus = (avgImportance / 100) * 0.2

    const activeMetricsCount = Object.values(weights).filter(w => w > 0.05).length
    const robustnessBonus = activeMetricsCount >= 3 ? 0.1 : (activeMetricsCount === 1 ? -0.2 : 0)

    // Inverse Signal Penalty
    // If a metric has an inverse signal (Bad > Good) and it has high weight, penalize the formula
    let inverseSignalPenalty = 0
    const badReviewersGroup = reviewers.filter(r => identifyBad(r).isBad)
    const goodReviewersGroup = reviewers.filter(r => identifyGood(r).isGood)

    if (badReviewersGroup.length > 0 && goodReviewersGroup.length > 0) {
        (Object.keys(weights) as (keyof FormulaWeights)[]).forEach(k => {
            if (weights[k] > 0.1) {
                const bAvg = badReviewersGroup.reduce((acc, r) => acc + (r[k] as number), 0) / badReviewersGroup.length
                const gAvg = goodReviewersGroup.reduce((acc, r) => acc + (r[k] as number), 0) / goodReviewersGroup.length
                if (bAvg > gAvg + 0.1) {
                    inverseSignalPenalty += weights[k] * 0.5 // Heavy penalty for weighting inverse signals
                }
            }
        })
    }

    const overallScore = Math.min(1, Math.max(0,
        discrimination * 0.25 + knownBadAccuracy * 0.25 + importanceBonus + robustnessBonus + fairness * 0.15 + stability * 0.05 - redundancyPenalty - inverseSignalPenalty
    ))

    const reasons: string[] = []; const tradeoffs: string[] = []
    if (discrimination > 0.7) reasons.push(`Good separation between reviewers (std: ${stats.stdDev.toFixed(2)})`)
    if (knownBadAccuracy > 0.6) reasons.push(`Correctly identifies ${Math.round(knownBadAccuracy * 100)}% of problematic reviewers`)
    if (fairness > 0.7) reasons.push('Treats new reviewers fairly')
    if (activeMetricsCount >= 3) reasons.push(`Uses ${activeMetricsCount} data components for comprehensive scoring`)
    if (!isCurrent && stability > 0.7) reasons.push('Maintains reasonable consistency with current rankings')

    if (discrimination < 0.5) tradeoffs.push('Low score differentiation')
    if (knownBadAccuracy < 0.5) tradeoffs.push('May not identify problematic reviewers well')
    if (inverseSignalPenalty > 0) tradeoffs.push('⚠️ Formula weights metrics where "Bad" reviewers score higher than "Good" ones')
    if (isCurrent) tradeoffs.push('⚠️ Legacy formula relies on quality data (70%) which is missing!')

    let recommendation: 'RECOMMENDED' | 'ACCEPTABLE' | 'NOT_RECOMMENDED'
    if (overallScore >= 0.65) recommendation = 'RECOMMENDED'
    else if (overallScore >= 0.45) recommendation = 'ACCEPTABLE'
    else recommendation = 'NOT_RECOMMENDED'

    return { formulaId, formulaName, weights, discrimination, discriminationMargin, knownBadAccuracy, fairness, stability, overallScore, recommendation, reasons, tradeoffs }
}

/**
 * Simplified evaluation for the optimizer
 */
export function evaluateFormulaWeights(
    reviewers: ReviewerMetrics[],
    weights: FormulaWeights,
    currentWeights: FormulaWeights
): number {
    const evaluation = evaluateFormula('custom', reviewers, weights, currentWeights)
    return evaluation.overallScore
}

export function calculateCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length === 0) return 0
    const n = x.length
    const sumX = x.reduce((a, b) => a + b, 0); const sumY = y.reduce((a, b) => a + b, 0)
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0)
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0); const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0)
    const numerator = n * sumXY - sumX * sumY
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))
    return denominator === 0 ? 0 : numerator / denominator
}

export function generateRecommendation(reviewers: ReviewerMetrics[], selectedFormulas: string[], customWeights: FormulaWeights | null): RecommendationData {
    const currentWeights = FORMULA_PRESETS.find(p => p.id === 'current')!.weights
    const evaluations = selectedFormulas.map(formulaId => {
        let weights = FORMULA_PRESETS.find(p => p.id === formulaId)?.weights || currentWeights
        weights = normalizeWeightsForData(weights, reviewers)
        return evaluateFormula(formulaId, reviewers, weights, currentWeights)
    })
    if (customWeights) evaluations.push(evaluateFormula('custom', reviewers, customWeights, currentWeights))
    const sortedEvaluations = [...evaluations].sort((a, b) => b.overallScore - a.overallScore)
    return { bestFormula: sortedEvaluations[0] || null, evaluations: sortedEvaluations, insights: generateDataInsights(reviewers, currentWeights, sortedEvaluations[0]?.weights || currentWeights) }
}

function generateDataInsights(reviewers: ReviewerMetrics[], currentWeights: FormulaWeights, selectedWeights: FormulaWeights): RecommendationData['insights'] {
    const withQualityRatings = reviewers.filter(r => r.avgQualityRating > 0).length
    const withAccuracyData = reviewers.filter(r => r.accuracy !== 0.5).length
    const withVotes = reviewers.filter(r => r.votesValidated > 0 || r.votesInvalidated > 0).length
    const totalReviewers = reviewers.length

    let accuracyImpact = ""; let votingImpact = ""; let newReviewerFairness = ""; let bestDistribution = ""
    if (withAccuracyData < 5) accuracyImpact = `Only ${withAccuracyData}/${totalReviewers} have accuracy data.`
    else {
        const badReviewersGroup = reviewers.filter(r => identifyBad(r).isBad); const goodReviewersGroup = reviewers.filter(r => identifyGood(r).isGood)
        const badAvg = badReviewersGroup.length > 0 ? badReviewersGroup.reduce((acc, r) => acc + r.accuracy, 0) / badReviewersGroup.length : 0
        const goodAvg = goodReviewersGroup.length > 0 ? goodReviewersGroup.reduce((acc, r) => acc + r.accuracy, 0) / goodReviewersGroup.length : 0
        if (badAvg > goodAvg + 0.05) accuracyImpact = `⚠️ Inverse Correlation: Bad reviewers have HIGHER accuracy (${(badAvg * 100).toFixed(0)}%) than Good ones.`
        else accuracyImpact = "Accuracy is a stable signal."
    }

    if (withVotes === 0) votingImpact = "No voting data yet."
    else votingImpact = `${withVotes} reviewers have votes.`

    const newReviewers = reviewers.filter(r => r.totalReviews < 5)
    if (newReviewers.length === 0) newReviewerFairness = "No new reviewers."
    else newReviewerFairness = `${newReviewers.length} new reviewers score fairly.`

    if (withQualityRatings / totalReviewers < 0.1) bestDistribution = "⚠️ Critical: Quality data missing!"
    else bestDistribution = "Data coverage is good."

    const { reviewers: combinedBad, reasons: badReasons } = getCombinedBadReviewers(reviewers, selectedWeights)
    const badReviewersList = combinedBad.map(r => ({ username: r.username, reason: badReasons.get(r.id) || 'Multiple Factors' }))

    return { accuracyImpact, votingImpact, newReviewerFairness, bestDistribution, badReviewers: badReviewersList, consistencyAnalysis: "Analysis complete.", experienceImpact: "Neutral.", penaltyEffectiveness: "Effective." }
}

export function calculateFeatureMatrix(reviewers: ReviewerMetrics[], weights: FormulaWeights): FeatureImportanceMatrix {
    if (reviewers.length === 0) return { clusters: [], metrics: [] }
    const metricKeys: (keyof FormulaWeights)[] = ['accuracy', 'timeliness', 'experience', 'penaltyScore', 'latePercentage', 'reviewVariance', 'voteValidation', 'quality']
    const globalScores = reviewers.map(r => {
        let sum = 0; let count = 0
        metricKeys.forEach(k => {
            if (k === 'quality' && r.avgQualityRating === 0) return
            if (k === 'accuracy' && r.accuracy === 0.5) return
            sum += (r[k] as number); count++
        })
        return count > 0 ? sum / count : 0.5
    })
    const k = Math.min(3, reviewers.length); const { centroids } = kMeans1D(globalScores, k)
    const reviewerClusterIndices = globalScores.map(score => {
        let minDist = Infinity; let clusterIndex = 0
        centroids.forEach((c, i) => {
            const dist = Math.abs(score - c); if (dist < minDist) { minDist = dist; clusterIndex = i }
        })
        return clusterIndex
    })
    const sortedIndices = centroids.map((c, i) => ({ c, i })).sort((a, b) => b.c - a.c).map(x => x.i)
    const clusterNames = ["Natural High Performers", "Natural Middle Tier", "Natural Low Signal"]
    const globalAverages: Record<string, number> = {}; const globalStdDevs: Record<string, number> = {}
    metricKeys.forEach(key => {
        const values = reviewers.map(r => r[key] as number)
        const mean = values.reduce((a, b) => a + b, 0) / values.length
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
        globalAverages[key] = mean; globalStdDevs[key] = Math.sqrt(variance) || 0.001
    })
    const clusterProfiles: ClusterProfile[] = sortedIndices.map((originalIdx, i) => {
        const clusterReviewers = reviewers.filter((_, idx) => reviewerClusterIndices[idx] === originalIdx)
        const profile: ClusterProfile = { name: clusterNames[i] || `Cluster ${i + 1}`, size: clusterReviewers.length, avgScore: clusterReviewers.length > 0 ? clusterReviewers.reduce((a, b) => a + calculateScore(b, weights), 0) / clusterReviewers.length : 0, metrics: {}, zScores: {} }
        metricKeys.forEach(key => {
            const values = clusterReviewers.map(r => r[key] as number)
            const avg = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : globalAverages[key]
            profile.metrics[key] = avg; profile.zScores[key] = (avg - globalAverages[key]) / globalStdDevs[key]
        })
        return profile
    })
    const metricsImportance = metricKeys.map(key => {
        const clusterAverages = clusterProfiles.map(p => p.metrics[key])
        const mean = clusterAverages.reduce((a, b) => a + b, 0) / clusterAverages.length
        const variance = clusterAverages.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / clusterAverages.length
        return { name: key, label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'), importance: variance }
    })
    const maxVar = Math.max(...metricsImportance.map(m => m.importance), 0.0001)
    metricsImportance.forEach(m => { m.importance = (m.importance / maxVar) * 100 })
    return { clusters: clusterProfiles, metrics: metricsImportance.sort((a, b) => b.importance - a.importance) }
}

export function calculateCorrelationMatrix(reviewers: ReviewerMetrics[]): CorrelationMatrix {
    const metricKeys: (keyof FormulaWeights)[] = ['accuracy', 'timeliness', 'experience', 'penaltyScore', 'latePercentage', 'reviewVariance', 'voteValidation', 'quality']
    const activeMetrics = metricKeys.filter(key => reviewers.some(r => {
        if (key === 'quality') return r.avgQualityRating > 0
        if (key === 'accuracy') return r.accuracy !== 0.5
        return (r[key] as number) !== 0
    }))
    const matrix: number[][] = []
    activeMetrics.forEach((m1, i) => {
        matrix[i] = []
        activeMetrics.forEach((m2, j) => {
            if (i === j) matrix[i][j] = 1
            else matrix[i][j] = calculateCorrelation(reviewers.map(r => r[m1] as number), reviewers.map(r => r[m2] as number))
        })
    })
    return { metrics: activeMetrics.map(m => m.charAt(0).toUpperCase() + m.slice(1).replace(/([A-Z])/g, ' $1')), matrix }
}

export function calculateConsensusImpact(
    reviewers: ReviewerMetrics[],
    formulaWeights: { id: string, name: string, weights: FormulaWeights }[]
): ConsensusImpactData[] {
    if (reviewers.length < 5) return []

    const SUBMISSION_COUNT = 200
    const results: ConsensusImpactData[] = []

    // 1. Add Unweighted Baseline
    const allFormulas = [
        { id: 'unweighted', name: 'Unweighted Average (Baseline)', weights: {} as FormulaWeights },
        ...formulaWeights
    ]

    const reviewerScoresByFormula = new Map<string, Map<string, number>>()
    allFormulas.forEach(fw => {
        const scores = new Map<string, number>()
        if (fw.id === 'unweighted') {
            reviewers.forEach(r => scores.set(r.id, 1.0))
        } else {
            reviewers.forEach(r => scores.set(r.id, calculateScore(r, fw.weights)))
        }
        reviewerScoresByFormula.set(fw.id, scores)
    })

    allFormulas.forEach(fw => {
        const varianceSamples: number[] = []
        const resilienceSamples: number[] = []
        const agreementSamples: number[] = []
        const shiftSamples: number[] = []

        const formulaScores = reviewerScoresByFormula.get(fw.id)!

        for (let i = 0; i < SUBMISSION_COUNT; i++) {
            const count = 3 + Math.floor(Math.random() * 3)
            const selectedReviewers: ReviewerMetrics[] = []
            const usedIndices = new Set<number>()

            const includeBad = Math.random() < 0.2
            const badReviewers = reviewers.filter(r => identifyBad(r).isBad)

            if (includeBad && badReviewers.length > 0) {
                const badIdx = Math.floor(Math.random() * badReviewers.length)
                selectedReviewers.push(badReviewers[badIdx])
                const originalIdx = reviewers.findIndex(r => r.id === badReviewers[badIdx].id)
                usedIndices.add(originalIdx)
            }

            while (selectedReviewers.length < count) {
                const idx = Math.floor(Math.random() * reviewers.length)
                if (!usedIndices.has(idx)) {
                    usedIndices.add(idx)
                    selectedReviewers.push(reviewers[idx])
                }
            }

            const trueXp = 20 + Math.random() * 60

            const votes = selectedReviewers.map(r => {
                const isBad = identifyBad(r).isBad
                const noiseMultiplier = isBad ? 2.5 : 1.0
                const accuracyNoise = (1 - r.accuracy) * 40 * (Math.random() - 0.5) * noiseMultiplier
                const varianceNoise = (1 - r.reviewVariance) * 20 * (Math.random() - 0.5) * noiseMultiplier
                return Math.max(0, Math.min(100, trueXp + accuracyNoise + varianceNoise))
            })

            const getWeightedMean = (vts: number[], weights: number[]) => {
                const sum = vts.reduce((acc, v, idx) => acc + v * weights[idx], 0)
                const weightSum = weights.reduce((acc, w) => acc + w, 0)
                return weightSum > 0 ? sum / weightSum : vts.reduce((a, b) => a + b, 0) / vts.length
            }

            const currentWeights = selectedReviewers.map(r => formulaScores.get(r.id) || 0.5)
            const consensus = getWeightedMean(votes, currentWeights)

            const variance = Math.sqrt(votes.reduce((acc, v) => acc + Math.pow(v - consensus, 2), 0) / votes.length)
            varianceSamples.push(variance)

            const outlierVote = Math.min(100, votes[0] + 50)
            const outlierVotes = [outlierVote, ...votes.slice(1)]
            const outlierConsensus = getWeightedMean(outlierVotes, currentWeights)
            const shift = Math.abs(outlierConsensus - consensus)
            shiftSamples.push(shift)
            resilienceSamples.push(Math.max(0, 1 - shift / 25))

            const sortedByWeight = [...selectedReviewers].map((r, idx) => ({ r, vote: votes[idx], weight: formulaScores.get(r.id) || 0.5 }))
                .sort((a, b) => b.weight - a.weight)
            const top3Votes = sortedByWeight.slice(0, 3).map(t => t.vote)
            const top3Max = Math.max(...top3Votes)
            const top3Min = Math.min(...top3Votes)
            agreementSamples.push(top3Max - top3Min <= 15 ? 1 : 0)
        }

        const getStats = (samples: number[]) => {
            const mean = samples.reduce((a, b) => a + b, 0) / samples.length
            const variance = samples.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / samples.length
            const stdErr = Math.sqrt(variance / samples.length)
            return { mean, ci: 1.96 * stdErr }
        }

        const varStats = getStats(varianceSamples)
        const resStats = getStats(resilienceSamples)
        const agrStats = getStats(agreementSamples)
        const shiftStats = getStats(shiftSamples)

        // Stress Tests
        const stressTests: StressTestResult[] = []
        const getMockScore = (m: Partial<ReviewerMetrics>) => {
            const mock: ReviewerMetrics = {
                id: 'mock', username: 'mock', email: 'mock',
                totalReviews: 10, lateReviews: 0, missedReviews: 0, streakWeeks: 0,
                votesValidated: 0, votesInvalidated: 0,
                timeliness: 1, quality: 0.5, accuracy: 0.5, voteValidation: 0.5,
                experience: 0.5, missedPenalty: 1, penaltyScore: 1,
                reviewVariance: 0.8, latePercentage: 1, avgDeviation: 0, avgQualityRating: 0,
                extremeMissCount: 0, extremeMissRate: 0,
                ...m
            }
            return fw.id === 'unweighted' ? 1.0 : calculateScore(mock, fw.weights)
        }

        // Scenario 1: Griefer Attack
        const grieferWeight = getMockScore({ timeliness: 0.1, missedReviews: 8, penaltyScore: 0.1, accuracy: 0.1, experience: 0.1 })
        const goodWeight = getMockScore({ timeliness: 1.0, accuracy: 0.95, penaltyScore: 1.0, experience: 0.9 })
        const grieferConsensus = (0 * grieferWeight + 80 * 3 * goodWeight) / (grieferWeight + 3 * goodWeight)
        const grieferResilience = Math.max(0, 1 - Math.abs(grieferConsensus - 80) / 40)
        stressTests.push({
            name: "Griefer Attack",
            scenario: "1 Griefer (0 XP) vs 3 Good Reviewers (80 XP).",
            score: grieferResilience,
            impact: `Consensus: ${grieferConsensus.toFixed(1)} XP (${(grieferResilience * 100).toFixed(0)}% resilience)`
        })

        // Scenario 2: Popular but Wrong
        const expertWeight = getMockScore({ experience: 1.0, timeliness: 1.0, accuracy: 0.3, penaltyScore: 1.0 })
        const normalWeight = getMockScore({ experience: 0.4, timeliness: 0.8, accuracy: 0.9, penaltyScore: 1.0 })
        const expertConsensus = (20 * expertWeight + 80 * 3 * normalWeight) / (expertWeight + 3 * normalWeight)
        const expertResilience = Math.max(0, 1 - Math.abs(expertConsensus - 80) / 40)
        stressTests.push({
            name: "Popular but Wrong",
            scenario: "1 'Expert' (high exp/time) gives 20 XP vs 3 Normal (80 XP).",
            score: expertResilience,
            impact: `Consensus: ${expertConsensus.toFixed(1)} XP (${(expertResilience * 100).toFixed(0)}% resilience)`
        })

        // Scenario 3: New Reviewer Randomness
        const newWeights = Array.from({ length: 5 }, () => getMockScore({ experience: 0.0, totalReviews: 0, accuracy: 0.5, timeliness: 0.5 }))
        const avgNewWeight = newWeights.reduce((a, b) => a + b, 0) / 5
        const newReviewerStability = Math.max(0, 1 - avgNewWeight)
        stressTests.push({
            name: "New Reviewer Randomness",
            scenario: "5 New Reviewers (low exp) with high-variance votes.",
            score: newReviewerStability,
            impact: `Avg Weight: ${(avgNewWeight * 100).toFixed(0)}% (${newReviewerStability > 0.7 ? 'Stable' : 'Vulnerable'})`
        })

        results.push({
            formulaId: fw.id,
            formulaName: fw.name,
            avgConsensusVariance: varStats.mean,
            varianceCI: varStats.ci,
            outlierResilience: resStats.mean,
            resilienceCI: resStats.ci,
            top3Agreement: agrStats.mean,
            agreementCI: agrStats.ci,
            avgOutlierShift: shiftStats.mean,
            shiftCI: shiftStats.ci,
            avgOutlierDeviation: 50,
            stressTests
        })
    })

    return results
}
