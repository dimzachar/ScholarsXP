import { ENABLE_ACHIEVEMENTS } from '@/config/feature-flags'

export type XpBucket =
  | 'submissions'
  | 'reviews'
  | 'streaks'
  | 'achievements'
  | 'penalties'
  | 'adminAdjustments'
  | 'other'

export interface UniformXpBreakdown {
  submissions: number
  reviews: number
  streaks: number
  achievements: number
  penalties: number
  adminAdjustments: number
  other: number
  total: number
}

const SUBMISSION_TYPES = new Set([
  'SUBMISSION_REWARD',
  'SUBMISSION',
  'LEGACY_SUBMISSION',
  'SUBMISSION_IMPORT'
])

const REVIEW_TYPES = new Set([
  'REVIEW_REWARD',
  'PEER_REVIEW',
  'REVIEW'
])

const STREAK_TYPES = new Set([
  'STREAK_BONUS'
])

const ACHIEVEMENT_TYPES = new Set([
  'ACHIEVEMENT_BONUS',
  'ACHIEVEMENT_REWARD',
  'ACHIEVEMENT',
  'MONTHLY_WINNER_BONUS'
])

const ADMIN_ADJUSTMENT_TYPES = new Set([
  'ADMIN_ADJUSTMENT',
  'MONTHLY_WINNER_BONUS_REVERSAL',
  'LEGACY_ADJUSTMENT'
])

const PENALTY_TYPES = new Set([
  'PENALTY'
])

export function createEmptyBreakdown(): UniformXpBreakdown {
  return {
    submissions: 0,
    reviews: 0,
    streaks: 0,
    achievements: 0,
    penalties: 0,
    adminAdjustments: 0,
    other: 0,
    total: 0
  }
}

export function mapTransactionTypeToBucket(type: string | null | undefined): XpBucket {
  if (!type) return 'other'

  if (SUBMISSION_TYPES.has(type)) return 'submissions'
  if (REVIEW_TYPES.has(type)) return 'reviews'
  if (STREAK_TYPES.has(type)) return 'streaks'
  if (ACHIEVEMENT_TYPES.has(type)) return 'achievements'
  if (PENALTY_TYPES.has(type)) return 'penalties'
  if (ADMIN_ADJUSTMENT_TYPES.has(type)) return 'adminAdjustments'

  return 'other'
}

export function applyTransactionToBreakdown(
  breakdown: UniformXpBreakdown,
  transaction: { amount: number; type: string | null | undefined }
): void {
  const bucket = mapTransactionTypeToBucket(transaction.type)

  if (!ENABLE_ACHIEVEMENTS && (bucket === 'achievements' || bucket === 'adminAdjustments')) {
    return
  }

  breakdown[bucket] += transaction.amount
  breakdown.total += transaction.amount
}

export function mergeBreakdowns(target: UniformXpBreakdown, source: UniformXpBreakdown): UniformXpBreakdown {
  target.submissions += source.submissions
  target.reviews += source.reviews
  target.streaks += source.streaks
  target.achievements += source.achievements
  target.penalties += source.penalties
  target.adminAdjustments += source.adminAdjustments
  target.other += source.other
  target.total += source.total
  return target
}
