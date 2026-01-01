import { ReviewerMetrics, FormulaWeights } from '@/lib/reliability/types'

export type { ReviewerMetrics, FormulaWeights }

export interface FormulaBreakdown {
  component: string
  rawValue: number
  weight: number
  contribution: number
}

export interface FormulaResult {
  reviewerId: string
  username: string
  score: number
  breakdown: FormulaBreakdown[]
}

export interface ComparisonStats {
  mean: number
  stdDev: number
  min: number
  max: number
  median: number
  distribution: { bucket: number; count: number }[]
}

export interface FormulaPreset {
  id: string
  name: string
  description: string
  weights: FormulaWeights
  defaultValues?: Partial<Record<keyof FormulaWeights, number>>
}

export interface RankChange {
  reviewerId: string
  username: string
  currentScore: number
  newScore: number
  scoreDelta: number
  currentRank: number
  newRank: number
  rankDelta: number
}

export interface EdgeCaseGroup {
  name: string
  description: string
  reviewers: ReviewerMetrics[]
  currentAvg: number
  newAvg: number
  insight: string
  severity: 'info' | 'warning' | 'success'
}

export interface FormulaEvaluation {
  formulaId: string
  formulaName: string
  weights: FormulaWeights
  // Scoring criteria (0-1)
  discrimination: number      // Higher std dev = better separation
  discriminationMargin: number // 95% confidence interval
  knownBadAccuracy: number    // % of "bad" reviewers in bottom 25%
  fairness: number            // New reviewer avg vs baseline
  stability: number           // Correlation with current formula
  overallScore: number        // Weighted combination
  recommendation: 'RECOMMENDED' | 'ACCEPTABLE' | 'NOT_RECOMMENDED'
  reasons: string[]
  tradeoffs: string[]
}

export interface RecommendationData {
  bestFormula: FormulaEvaluation | null
  evaluations: FormulaEvaluation[]
  insights: {
    accuracyImpact: string
    votingImpact: string
    newReviewerFairness: string
    bestDistribution: string
    badReviewers: { username: string; reason: string }[]
    consistencyAnalysis: string
    experienceImpact: string
    penaltyEffectiveness: string
  }
}

export interface OptimizationResult {
  weights: FormulaWeights
  score: number
  iterations: number
  convergenceHistory: number[]
  metrics: {
    discrimination: number
    badReviewerAccuracy: number
    fairness: number
    spread: number
  }
}

export interface ClusterProfile {
  name: string
  size: number
  avgScore: number
  metrics: Record<string, number>
  zScores: Record<string, number>
}

export interface FeatureImportanceMatrix {
  clusters: ClusterProfile[]
  metrics: {
    name: string
    importance: number
    label: string
  }[]
}

export interface CorrelationMatrix {
  metrics: string[]
  matrix: number[][]
}

export interface StressTestResult {
  name: string
  scenario: string
  score: number // 0-1, higher is better (resilience/accuracy)
  impact: string // Human readable impact
}

export interface ConsensusImpactData {
  formulaId: string
  formulaName: string
  avgConsensusVariance: number
  varianceCI: number
  outlierResilience: number // 0-1, higher is better
  resilienceCI: number
  top3Agreement: number     // 0-1, higher is better
  agreementCI: number
  avgOutlierShift: number   // XP points
  shiftCI: number
  avgOutlierDeviation: number
  stressTests: StressTestResult[]
}
export interface InverseSignalAuditData {
  // Detection
  isInverseSignalDetected: boolean
  badReviewerAvgAccuracy: number
  goodReviewerAvgAccuracy: number
  signalDelta: number // bad - good (positive = inverse)

  // Reviewer Groups
  allBad: AuditReviewer[]
  allGood: AuditReviewer[]
  middleTier: AuditReviewer[]

  // Pattern Analysis
  patterns: DetectedPattern[]
  suggestedRootCause: RootCause | null

  // Audit Status
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'PASSED' | 'FAILED' | 'ACKNOWLEDGED'
  acknowledgedAt?: Date
  acknowledgedBy?: string
}

export interface AuditReviewer {
  id: string
  username: string
  email: string

  // Metrics
  timeliness: number
  accuracy: number
  penaltyScore: number
  reviewVariance: number
  missedReviews: number
  totalReviews: number
  missedPenalty: number   // Added for threshold display
  experience: number      // Added for threshold display
  reason?: string

  // Review History (last 10)
  reviewHistory: ReviewHistoryItem[]

  // Computed
  avgDeviation: number
  deviationTrend: 'IMPROVING' | 'STABLE' | 'WORSENING'
  latenessTrend: 'IMPROVING' | 'STABLE' | 'WORSENING'
}

export interface ReviewHistoryItem {
  submissionId: string
  submissionTitle: string
  reviewerXpScore: number
  finalConsensus: number
  deviation: number
  wasLate: boolean
  daysLate: number
  reviewDate: Date
}

export interface DetectedPattern {
  id: string
  name: string
  description: string
  confidence: number // 0-1
  affectedReviewers: string[] // reviewer IDs
  suggestedAction: string
}

export type RootCause =
  | 'SLOW_BUT_THOUGHTFUL'
  | 'CONSENSUS_BIAS'
  | 'CALCULATION_BUG'
  | 'SAMPLE_SIZE_ARTIFACT'
  | 'POLARIZED_FAST_REVIEWERS'
  | 'UNKNOWN'

export const ROOT_CAUSE_DESCRIPTIONS: Record<RootCause, {
  title: string
  description: string
  action: string
  severity: 'low' | 'medium' | 'high' | 'critical'
}> = {
  SLOW_BUT_THOUGHTFUL: {
    title: 'Slow but Thoughtful Reviewers',
    description: 'Late reviewers take more time and produce more accurate judgments.',
    action: 'Reduce timeliness weight from current value to 10-15%',
    severity: 'medium'
  },
  CONSENSUS_BIAS: {
    title: 'Fast Reviewer Consensus Bias',
    description: 'Fast reviewers dominate the consensus, making slow reviewers appear "inaccurate".',
    action: 'This is a platform design issue. Consider time-weighted consensus.',
    severity: 'high'
  },
  CALCULATION_BUG: {
    title: 'Accuracy Calculation Bug',
    description: 'The avgDeviation formula may be inverted (high deviation = high accuracy).',
    action: 'Audit the calculateAccuracy() function in the API route.',
    severity: 'critical'
  },
  SAMPLE_SIZE_ARTIFACT: {
    title: 'Statistical Artifact',
    description: 'Sample size too small to draw conclusions. Difference may be random noise.',
    action: 'Proceed with caution. Monitor closely in Shadow Mode.',
    severity: 'low'
  },
  POLARIZED_FAST_REVIEWERS: {
    title: 'Polarized Fast Reviewers',
    description: 'Fast reviewers give extreme scores (0 or 100), increasing their average deviation.',
    action: 'Add a "score polarization" penalty to the formula.',
    severity: 'medium'
  },
  UNKNOWN: {
    title: 'Unknown Root Cause',
    description: 'No clear pattern detected. Manual investigation recommended.',
    action: 'Review the listed reviewers manually and document findings.',
    severity: 'high'
  }
}
