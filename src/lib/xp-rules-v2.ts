export type TaskIdV2 = 'A' | 'B'
export type TaskCategory = 'strategy' | 'guide' | 'technical'
export type QualityTier = 'basic' | 'average' | 'awesome'

export const ALLOWED_XP: Record<TaskIdV2, Record<TaskCategory, [number, number, number]>> = {
  A: {
    strategy: [50, 100, 150],
    guide: [30, 80, 130],
    technical: [40, 90, 140]
  },
  B: {
    strategy: [80, 150, 250],
    guide: [60, 130, 230],
    technical: [70, 140, 240]
  }
}

export function getAllowedXp(task: TaskIdV2, category: TaskCategory): number[] {
  return ALLOWED_XP[task][category]
}

export function getXpForTier(task: TaskIdV2, category: TaskCategory, tier: QualityTier): number {
  const values = ALLOWED_XP[task][category]
  const index = tier === 'basic' ? 0 : tier === 'average' ? 1 : 2
  return values[index]
}

export function resolveTaskFromPlatform(platform: string): TaskIdV2 | null {
  const p = (platform || '').toLowerCase()
  if (p === 'twitter' || p === 'x' || p === 'x.com') return 'A'
  if (p === 'medium' || p === 'reddit') return 'B'
  return null
}

export function isValidCategory(value: unknown): value is TaskCategory {
  return value === 'strategy' || value === 'guide' || value === 'technical'
}

export function isValidTier(value: unknown): value is QualityTier {
  return value === 'basic' || value === 'average' || value === 'awesome'
}
