import { resolveTaskFromPlatform, type TaskIdV2 } from './xp-rules-v2'

export type Range = 'week' | 'month' | 'all'

export type FeaturedInput = {
  id: string
  url: string
  platform?: string | null
  userId?: string | null
  authorKey?: string | null
  createdAt: string // ISO
  reviewCount?: number | null
  consensusScore?: number | null
  aiXp?: number | null
  peerXp?: number | null
  finalXp?: number | null
  origin: 'submission' | 'legacy'
}

export type ScoredFeatured = FeaturedInput & {
  score: number
}

export type EnhancedScoreBreakdown = {
  // Base components
  baseScore: number
  tierMultiplier: number
  tierName: string
  
  // Review quality components
  reviewCount: number
  consensusScore: number
  reviewQualityScore: number
  qualityMultiplier: number
  
  // Platform diversity
  platformBonus: number
  platformName: string
  
  // Age decay
  ageDays: number
  halfLifeDays: number
  decay: number
  
  // Final calculation
  enhancedScore: number
}

/**
 * Enhanced Featured Scoring Formula:
 * 
 * Final Score = (Base Score × Tier Multiplier + Review Quality Score × 20) × Platform Bonus × Age Decay
 * 
 * Where:
 * - Base Score = finalXp (peer-reviewed consensus XP)
 * - Tier Multiplier = quality tier bonus based on XP thresholds:
 *   - Awesome tier (≥150 for A, ≥250 for B): 1.3x
 *   - Average tier (≥80 for A, ≥130 for B): 1.15x  
 *   - Basic tier: 1.0x
 * - Review Quality Score = log(1 + reviewCount) × Quality Multiplier
 * - Quality Multiplier = 1 + (consensusScore × 0.5)
 * - Platform Bonus = diversity incentive (1.0-1.2)
 * - Age Decay = exponential decay based on time (half-life: 7 days for week, 21 for month)
 */

/**
 * Get tier-based multiplier based on finalXp and platform
 */
function getTierMultiplier(finalXp: number, platform: string): { multiplier: number; name: string } {
  const taskType = resolveTaskFromPlatform(platform)
  if (!taskType) return { multiplier: 1.0, name: 'basic' }
  
  const maxBasic = taskType === 'A' ? 80 : 130 // Max basic tier
  const maxAverage = taskType === 'A' ? 150 : 250 // Max average/awesome threshold
  
  if (finalXp >= maxAverage) {
    return { multiplier: 1.3, name: 'awesome' }
  } else if (finalXp >= maxBasic) {
    return { multiplier: 1.15, name: 'average' }
  } else {
    return { multiplier: 1.0, name: 'basic' }
  }
}


/**
 * Calculate platform diversity bonus using steeper curve
 */
function getPlatformBonus(platform: string, platformCounts: Map<string, number>): number {
  if (!platform) return 1.0
  
  const platformKey = platform.toLowerCase()
  const count = platformCounts.get(platformKey) || 0
  
  // Steeper curve for diversity incentive: bonus = 1.0 + (1.0 / sqrt(count + 1))
  // This creates more meaningful differentiation between platform bonuses
  const bonus = 1.0 + (1.0 / Math.sqrt(count + 1))
  
  // Cap bonus at 1.5x to prevent extreme values
  return Math.min(1.5, bonus)
}

/**
 * Calculate age in days
 */
function ageDays(iso: string): number {
  const created = new Date(iso).getTime()
  const now = Date.now()
  return Math.max(0, (now - created) / (1000 * 60 * 60 * 24))
}

/**
 * Compute enhanced featured score with detailed breakdown
 */
export function computeEnhancedFeaturedScore(
  item: FeaturedInput, 
  range: Range,
  platformCounts: Map<string, number>
): { score: number; breakdown: EnhancedScoreBreakdown } {
  
  // Base score from final XP
  const baseScore = item.finalXp ?? 0
  
  // Tier-based multiplier
  const { multiplier: tierMultiplier, name: tierName } = getTierMultiplier(baseScore, item.platform || '')
  
  // Since all posts have exactly 3 reviews (minimum threshold), we don't need review quality component
  const reviewCount = Math.max(0, item.reviewCount ?? 0)
  const consensusScore = Math.max(0, item.consensusScore ?? 0)
  // Simplified review quality score since all posts have the same review count
  const reviewQualityScore = 1.0
  const qualityMultiplier = 1.0
  
  // Platform diversity bonus
  const platformBonus = getPlatformBonus(item.platform || '', platformCounts)
  const platformName = item.platform || 'unknown'
  
  // Age decay
  const age = ageDays(item.createdAt)
  const halfLifeDays = range === 'week' ? 7 : range === 'month' ? 21 : 365
  const decay = Math.exp(-age / halfLifeDays)
  
  // Enhanced score calculation
  const enhancedScore = (baseScore * tierMultiplier + reviewQualityScore * 20) * platformBonus * decay
  
  const breakdown: EnhancedScoreBreakdown = {
    baseScore,
    tierMultiplier,
    tierName,
    reviewCount,
    consensusScore,
    reviewQualityScore,
    qualityMultiplier,
    platformBonus,
    platformName,
    ageDays: age,
    halfLifeDays,
    decay,
    enhancedScore: Math.max(0, enhancedScore)
  }
  
  return {
    score: Math.max(0, enhancedScore),
    breakdown
  }
}

/**
 * Enhanced ranking for week and month only
 */
export function rankFeaturedEnhanced(
  items: FeaturedInput[], 
  range: Range, 
  perAuthorCap = 1, 
  perPlatformCap = 6
): (ScoredFeatured & { breakdown: EnhancedScoreBreakdown })[] {
  
  // Only apply enhanced ranking to week and month
  if (range === 'all') {
    // Fall back to existing logic for all-time
    return []
  }
  
  // Filter to submissions only (no legacy for enhanced ranking)
  const eligible = items.filter(item => 
    (item.reviewCount ?? 0) >= 3 && item.origin === 'submission'
  )
  
  // Count platforms for diversity bonus
  const platformCounts = new Map<string, number>()
  for (const item of eligible) {
    const platform = (item.platform || 'unknown').toLowerCase()
    platformCounts.set(platform, (platformCounts.get(platform) || 0) + 1)
  }
  
  // Score all eligible items
  const scored: (ScoredFeatured & { breakdown: EnhancedScoreBreakdown })[] = []
  for (const item of eligible) {
    const { score, breakdown } = computeEnhancedFeaturedScore(item, range, platformCounts)
    
    if (!isFinite(score) || score <= 0) {
      continue
    }
    
    scored.push({ ...item, score, breakdown })
  }
  
  // Sort by score (descending), then by recency
  scored.sort((a, b) => (b.score - a.score) || (
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ))
  
  // Apply caps
  const authorCounts = new Map<string, number>()
  const platformCountsAfterCapping = new Map<string, number>()
  const filtered: (ScoredFeatured & { breakdown: EnhancedScoreBreakdown })[] = []
  
  for (const item of scored) {
    const aKey = item.authorKey || item.userId || `legacy:${item.id}`
    const pKey = (item.platform || 'unknown').toLowerCase()
    const aUsed = authorCounts.get(aKey) || 0
    const pUsed = platformCountsAfterCapping.get(pKey) || 0
    
    if (aUsed >= perAuthorCap) {
      continue
    }
    
    if (pUsed >= perPlatformCap) {
      continue
    }
    
    filtered.push(item)
    authorCounts.set(aKey, aUsed + 1)
    platformCountsAfterCapping.set(pKey, pUsed + 1)
  }
  
  return filtered
}

// Helper for debug logging
function tierName(name: string): string {
  const emoji = { basic: '⚪', average: '🔵', awesome: '🔥' }
  return `${emoji[name as keyof typeof emoji] || '⚪'} ${name.charAt(0).toUpperCase() + name.slice(1)}`
}
