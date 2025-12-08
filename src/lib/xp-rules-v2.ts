export type TaskIdV2 = 'A' | 'B'
export type TaskCategory = 'strategy' | 'guide' | 'technical'
export type QualityTier = 'basic' | 'average' | 'awesome'

/**
 * Task display metadata for UI components
 */
export interface TaskDisplayInfo {
  id: TaskIdV2
  name: string
  description: string
  platforms: string[]
}

export const TASK_DISPLAY_INFO: Record<TaskIdV2, TaskDisplayInfo> = {
  A: {
    id: 'A',
    name: 'Thread or Long Article',
    description: 'Twitter/X thread (5+ tweets) OR Twitter Article',
    platforms: ['Twitter', 'X']
  },
  B: {
    id: 'B',
    name: 'Platform Article',
    description: 'Article on Medium, Reddit, or Notion (2000+ characters)',
    platforms: ['Medium', 'Reddit', 'Notion']
  }
}

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

export const REJECTED_XP = 0

export function getRejectedXp(): number {
  return REJECTED_XP
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
  if (p === 'medium' || p === 'reddit' || p === 'notion' || p === 'notion.so') return 'B'
  return null
}

export function isValidCategory(value: unknown): value is TaskCategory {
  return value === 'strategy' || value === 'guide' || value === 'technical'
}

export function isValidTier(value: unknown): value is QualityTier {
  return value === 'basic' || value === 'average' || value === 'awesome'
}

/**
 * Get task display info by ID (for UI components)
 * Supports both active task types (A, B) and legacy types (C-F) for backwards compatibility
 */
export function getTaskDisplayInfo(taskId: string): TaskDisplayInfo {
  if (taskId === 'A' || taskId === 'B') {
    return TASK_DISPLAY_INFO[taskId]
  }
  // Legacy task types (C-F) - return placeholder info for backwards compatibility
  const legacyNames: Record<string, string> = {
    'C': 'Tutorial/Guide',
    'D': 'Protocol Explanation',
    'E': 'Correction Bounty',
    'F': 'Strategies'
  }
  return {
    id: taskId as TaskIdV2,
    name: legacyNames[taskId] || `Task ${taskId}`,
    description: `Legacy task type ${taskId} (no longer active)`,
    platforms: []
  }
}
