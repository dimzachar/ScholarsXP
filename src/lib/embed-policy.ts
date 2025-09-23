import { detectPlatform } from '@/lib/utils'

// Domains that are known to refuse embedding or cause issues
const blockedDomains = new Set<string>([
  // Block ALL Notion hosts (workspace and public share)
  'notion.com',
  'www.notion.com',
  'notion.so',
  'www.notion.so',
  'notion.site',
  'www.notion.site',
])

// Platforms we explicitly support featuring (rendered as embed or rich card)
const allowedPlatforms = new Set<string>([
  'Twitter',
  'Reddit',
  'Medium',
])

function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Decide whether a URL should be eligible for the Featured feed.
 * - Blocks known non-embeddable domains (e.g., notion.com workspace links)
 * - Allows common social/news platforms we handle (Twitter/X, Reddit, Medium)
 * - Allows YouTube by hostname check
 */
export function canFeatureUrl(url: string): boolean {
  const host = getHostname(url)
  if (!host) return false

  // Always allow YouTube
  if (host.includes('youtube.com') || host.includes('youtu.be')) return true

  // Block explicit domains that break embedding/rich previews
  if (blockedDomains.has(host)) return false

  const platform = detectPlatform(url)

  // Block Notion entirely (per policy request)
  if (platform === 'Notion') return false

  // Allow listed platforms; others default to false for Featured
  if (platform && allowedPlatforms.has(platform)) return true

  return false
}
