import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalize URL for consistent duplicate detection
 * Handles common URL variations that should be treated as identical:
 * - Removes www., old., m. prefixes
 * - Normalizes twitter.com to x.com
 * - Removes trailing slashes
 * - Removes tracking parameters (utm_*, fbclid, etc.)
 * - Sorts query parameters alphabetically
 */
export function normalizeUrl(url: string): string {
  if (!url) return url

  try {
    const urlObj = new URL(url)

    // Normalize hostname
    let hostname = urlObj.hostname.toLowerCase()

    // Normalize Twitter/X domains to consistent format
    if (hostname === 'twitter.com') {
      hostname = 'x.com'
    }

    // Remove www prefix
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4)
    }

    // Remove old. prefix (for old.reddit.com)
    if (hostname.startsWith('old.')) {
      hostname = hostname.substring(4)
    }

    // Remove m. prefix (for mobile sites like m.reddit.com)
    if (hostname.startsWith('m.')) {
      hostname = hostname.substring(2)
    }

    // Reconstruct URL with normalized hostname
    urlObj.hostname = hostname

    // Remove trailing slash from pathname (except for root path)
    if (urlObj.pathname.length > 1 && urlObj.pathname.endsWith('/')) {
      urlObj.pathname = urlObj.pathname.slice(0, -1)
    } else if (urlObj.pathname === '/') {
      urlObj.pathname = ''
    }

    // Conservative approach: Only remove clearly tracking-related parameters
    // Keep most parameters as they might be functional
    const searchParams = new URLSearchParams(urlObj.search)
    const clearTrackingParams = [
      // UTM tracking (universally tracking-only)
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      // Social media click tracking
      'fbclid', 'gclid',
      // Google Analytics
      '_ga', '_gl'
    ]

    clearTrackingParams.forEach(param => {
      searchParams.delete(param)
    })

    // Sort remaining query parameters for consistency
    searchParams.sort()
    urlObj.search = searchParams.toString()

    return urlObj.toString()
  } catch {
    // If URL parsing fails, return original URL
    return url
  }
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false

  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

export function detectPlatform(url: string): string | null {
  if (!url) return null

  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase()

    if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
      return 'Twitter'
    }

    if (hostname.includes('medium.com')) {
      return 'Medium'
    }

    if (hostname.includes('reddit.com')) {
      return 'Reddit'
    }

    if (hostname.includes('notion.so') || hostname.includes('notion.site')) {
      return 'Notion'
    }

    if (hostname.includes('linkedin.com')) {
      return 'LinkedIn'
    }

    return null
  } catch {
    return null
  }
}

export function getWeekNumber(date: Date = new Date()): number {
  const d = new Date(date.getTime())
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}

export function getWeekBoundaries(weekNumber: number, year: number): { startDate: Date; endDate: Date } {
  // Calculate the start of the year
  const yearStart = new Date(year, 0, 1)

  // Find the first Monday of the year
  const firstMonday = new Date(yearStart)
  const dayOfWeek = yearStart.getDay()
  const daysToMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
  firstMonday.setDate(yearStart.getDate() + daysToMonday)

  // Calculate the start of the specified week
  const startDate = new Date(firstMonday)
  startDate.setDate(firstMonday.getDate() + (weekNumber - 1) * 7)
  startDate.setHours(0, 0, 0, 0)

  // Calculate the end of the week (Sunday)
  const endDate = new Date(startDate)
  endDate.setDate(startDate.getDate() + 6)
  endDate.setHours(23, 59, 59, 999)

  return { startDate, endDate }
}

