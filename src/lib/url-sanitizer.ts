/**
 * URL Sanitization Utility
 * 
 * Provides functions to validate and sanitize URLs to prevent XSS and other security issues.
 * Only allows http:// and https:// protocols to prevent javascript:, data:, file:, etc.
 */

/**
 * Checks if a URL is safe for use in links and images
 * Blocks javascript:, data:, file:, and other dangerous protocols
 */
export function isSafeUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false
  
  try {
    const parsed = new URL(url.trim())
    // Only allow http and https protocols
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    // If URL parsing fails, it's not a valid URL
    return false
  }
}

/**
 * Sanitizes a URL for safe use in href attributes
 * Returns the URL if safe, otherwise returns a safe fallback
 */
export function sanitizeUrl(url: string | null | undefined, fallback = '#'): string {
  return isSafeUrl(url) ? url!.trim() : fallback
}

/**
 * Sanitizes a URL for safe use in img src attributes
 * Returns the URL if safe, otherwise returns null (no image rendered)
 */
export function sanitizeImageUrl(url: string | null | undefined): string | null {
  return isSafeUrl(url) ? url!.trim() : null
}

/**
 * Validates that a URL points to an expected domain
 * Useful for additional validation of external links
 */
export function isFromDomain(url: string, allowedDomains: string[]): boolean {
  if (!isSafeUrl(url)) return false
  
  try {
    const parsed = new URL(url.trim())
    const hostname = parsed.hostname.toLowerCase()
    
    return allowedDomains.some(domain => 
      hostname === domain.toLowerCase() || 
      hostname.endsWith(`.${domain.toLowerCase()}`)
    )
  } catch {
    return false
  }
}
