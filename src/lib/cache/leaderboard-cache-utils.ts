import { multiLayerCache } from '@/lib/cache/enhanced-cache'

export async function invalidateAllLeaderboardCache() {
  try {
    await multiLayerCache.clear()
  } catch (e) {
    console.warn('Failed to clear leaderboard cache:', e)
  }
}

