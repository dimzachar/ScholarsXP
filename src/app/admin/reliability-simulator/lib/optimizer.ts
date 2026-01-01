import { FormulaWeights, ReviewerMetrics, OptimizationResult } from './types'
import { calculateScore, calculateStats, FORMULA_PRESETS, calculateCorrelation, identifyBad, identifyGood, kMeans1D, getCombinedBadReviewers, calculateFeatureMatrix, evaluateFormulaWeights } from './formulas'

export interface OptimizationConfig {
  maxIterations: number
  populationSize: number
  mutationRate: number
  eliteCount: number
  targetBadReviewerAccuracy: number
  seed?: number
  forceInclude?: (keyof FormulaWeights)[]
}

const DEFAULT_CONFIG: OptimizationConfig = {
  maxIterations: 100,
  populationSize: 50,
  mutationRate: 0.15,
  eliteCount: 5,
  targetBadReviewerAccuracy: 0.7,
  seed: 42,
}

// Seeded random number generator for reproducibility
function createSeededRandom(seed: number) {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

function normalizeAndCap(raw: any, reviewers: ReviewerMetrics[], badReviewers: ReviewerMetrics[], goodReviewers: ReviewerMetrics[], config?: OptimizationConfig): FormulaWeights {
  let weights = { ...raw } as FormulaWeights
  const keys = Object.keys(weights) as (keyof FormulaWeights)[]

  keys.forEach(key => {
    // 1. Data Availability Check
    const withData = reviewers.filter(r => {
      if (key === 'quality') return r.avgQualityRating > 0
      if (key === 'accuracy') return r.accuracy !== 0.5
      if (key === 'voteValidation') return r.votesValidated > 0 || r.votesInvalidated > 0
      return true
    }).length
    const threshold = key === 'voteValidation' ? 0.05 : 0.1
    if (withData / reviewers.length < threshold && !config?.forceInclude?.includes(key)) {
      weights[key] = 0
      return
    }

    // 2. Negative Signal Check - REMOVED for Unsupervised Mode
    // We no longer zero out weights just because they correlate with "Bad" reviewers
    // (since "Bad" definition might be flawed/circular).
    // The fitness function (Discrimination) will decide if the metric is useful.
    /*
    if (badReviewers.length > 0 && goodReviewers.length > 0) {
      const bAvg = badReviewers.reduce((sum, r) => sum + (r[key] as number), 0) / badReviewers.length
      const gAvg = goodReviewers.reduce((sum, r) => sum + (r[key] as number), 0) / goodReviewers.length
      if (bAvg > gAvg) {
        weights[key] = 0
      }
    }
    */
    weights[key] = Math.max(0, weights[key] || 0)
  })

  // Normalize and cap at 40%
  for (let i = 0; i < 10; i++) {
    const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1
    let overage = 0
    let flexibleCount = 0
    keys.forEach(key => {
      weights[key] = weights[key] / total
      if (weights[key] > 0.4) {
        overage += weights[key] - 0.4
        weights[key] = 0.4
      } else if (weights[key] > 0.01) {
        flexibleCount++
      }
    })
    if (overage <= 1e-6) break
    if (flexibleCount > 0) {
      keys.forEach(key => {
        if (weights[key] < 0.4 && weights[key] > 0) {
          weights[key] += overage / flexibleCount
        }
      })
    }
  }

  // Final normalization to ensure it's exactly 1.0
  const finalTotal = Object.values(weights).reduce((a, b) => a + b, 0) || 1
  keys.forEach(key => {
    weights[key] = weights[key] / finalTotal
  })

  return weights
}

function calculateFitness(
  weights: FormulaWeights,
  reviewers: ReviewerMetrics[],
  config?: OptimizationConfig
): number {
  const currentWeights = FORMULA_PRESETS.find(p => p.id === 'current')?.weights || FORMULA_PRESETS[0].weights
  let score = evaluateFormulaWeights(reviewers, weights, currentWeights)

  // Add a small bonus for using forced metrics to ensure they aren't just 1%
  if (config?.forceInclude) {
    config.forceInclude.forEach(key => {
      if (weights[key] > 0.1) score += 0.05 // 5% bonus for significant inclusion
      else if (weights[key] > 0.01) score += 0.01 // 1% bonus for minimal inclusion
    })
  }

  return Math.min(1, score)
}

export function optimizeWeights(reviewers: ReviewerMetrics[], config: Partial<OptimizationConfig> = {}): OptimizationResult {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const random = createSeededRandom(cfg.seed || 42)

  const badReviewers = reviewers.filter(identifyBad)
  const goodReviewers = reviewers.filter(identifyGood)

  // Fallback if no reviewers identified
  let finalBad = badReviewers
  let finalGood = goodReviewers

  // Use clustering to find "Bad" reviewers if none are manually identified
  if (finalBad.length === 0 && reviewers.length > 0) {
    // We need scores to cluster, but we don't have weights yet.
    // Use a balanced starting point (Formula E) to estimate initial clusters
    const initialWeights = FORMULA_PRESETS.find(p => p.id === 'balanced')?.weights || FORMULA_PRESETS[0].weights
    const scores = reviewers.map(r => calculateScore(r, initialWeights))

    const { centroids } = kMeans1D(scores, 2)
    const badCentroid = Math.min(...centroids)
    const goodCentroid = Math.max(...centroids)
    const threshold = (badCentroid + goodCentroid) / 2

    if (goodCentroid - badCentroid > 0.1) {
      finalBad = reviewers.filter((r, i) => scores[i] < threshold)
    }
  }

  if (finalGood.length === 0 && reviewers.length > 0) {
    // If we found bad reviewers via clustering, the rest are "Good" (or at least not bad)
    if (finalBad.length > 0) {
      finalGood = reviewers.filter(r => !finalBad.includes(r))
    } else {
      // If no bad reviewers found, everyone is good
      finalGood = reviewers
    }
  }

  let population = Array.from({ length: cfg.populationSize }, () => {
    const raw: any = {}
    const keys: (keyof FormulaWeights)[] = ['timeliness', 'quality', 'accuracy', 'voteValidation', 'experience', 'missedPenalty', 'penaltyScore', 'reviewVariance', 'latePercentage']
    keys.forEach(k => raw[k] = random())
    const weights = normalizeAndCap(raw, reviewers, finalBad, finalGood, cfg)
    return { weights, fitness: calculateFitness(weights, reviewers, cfg) }
  })

  const history: number[] = []
  for (let iter = 0; iter < cfg.maxIterations; iter++) {
    population.sort((a, b) => b.fitness - a.fitness)
    history.push(population[0].fitness)
    if (iter > 20 && history[iter] - history[iter - 10] < 0.001) break

    const nextGen = population.slice(0, cfg.eliteCount)
    while (nextGen.length < cfg.populationSize) {
      const p1 = population[Math.floor(random() * 10)].weights
      const p2 = population[Math.floor(random() * 20)].weights
      const childRaw: any = {}
      Object.keys(p1).forEach(k => {
        const blend = random()
        childRaw[k] = (p1 as any)[k] * blend + (p2 as any)[k] * (1 - blend)
        if (random() < 0.1) childRaw[k] += (random() - 0.5) * 0.2
      })
      const child = normalizeAndCap(childRaw, reviewers, finalBad, finalGood, cfg)
      nextGen.push({ weights: child, fitness: calculateFitness(child, reviewers, cfg) })
    }
    population = nextGen
  }

  population.sort((a, b) => b.fitness - a.fitness)
  const best = population[0]
  const finalScores = reviewers.map(r => calculateScore(r, best.weights))
  const stats = calculateStats(finalScores)
  const sorted = [...finalScores].sort((a, b) => a - b)
  const threshold = sorted[Math.max(0, Math.min(sorted.length - 1, finalBad.length - 1))] || 0.5
  const badInBottom = reviewers.filter(r => identifyBad(r) && calculateScore(r, best.weights) <= threshold).length

  return {
    weights: best.weights,
    score: best.fitness,
    iterations: history.length,
    convergenceHistory: history,
    metrics: {
      discrimination: Math.min(1, stats.stdDev / 0.2),
      badReviewerAccuracy: finalBad.length > 0 ? badInBottom / finalBad.length : 1,
      fairness: (() => {
        const newReviewers = reviewers.filter(r => r.totalReviews < 5)
        const newReviewerScores = newReviewers.map(r => calculateScore(r, best.weights))
        const newReviewerAvg = newReviewerScores.length > 0 ? newReviewerScores.reduce((a, b) => a + b, 0) / newReviewerScores.length : 0.5
        return Math.max(0, 1 - Math.abs(newReviewerAvg - 0.5) / 0.25)
      })(),
      spread: (stats.max - stats.min) / 0.5
    }
  }
}
