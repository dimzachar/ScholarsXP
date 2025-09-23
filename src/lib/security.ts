export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export interface SecurityCheck {
  passed: boolean
  reason?: string
  confidence: number
}

export function detectPlatform(url: string): 'Twitter' | 'Medium' | 'Reddit' | 'Notion' | 'LinkedIn' | null {
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

export function validateURL(url: string): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  }

  if (!url) {
    result.isValid = false
    result.errors.push('URL is required')
    return result
  }

  try {
    const urlObj = new URL(url)
    
    // Check if it's a supported platform
    const platform = detectPlatform(url)
    if (!platform) {
      result.isValid = false
      result.errors.push('Only Twitter/X, Medium, Reddit, Notion, and LinkedIn links are supported')
    }

    // Check for HTTPS
    if (urlObj.protocol !== 'https:') {
      result.warnings.push('URL should use HTTPS for security')
    }

  } catch (error) {
    result.isValid = false
    result.errors.push('Invalid URL format')
  }

  return result
}

export function validateScholarXPHashtag(content: string): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  }

  if (!content) {
    result.isValid = false
    result.errors.push('Content is required')
    return result
  }

  // Check for #ScholarXP hashtag (case insensitive)
  const hasHashtag = /#scholarxp/i.test(content)
  if (!hasHashtag) {
    result.isValid = false
    result.errors.push('Content must include the #ScholarXP hashtag')
  }

  // Check content length
  if (content.length < 50) {
    result.isValid = false
    result.errors.push('Content is too short (minimum 50 characters)')
  }

  if (content.length > 50000) {
    result.isValid = false
    result.errors.push('Content is too long (maximum 50,000 characters)')
  }

  return result
}

export function checkSpamContent(content: string): SecurityCheck {
  const spamIndicators = [
    /buy now/gi,
    /click here/gi,
    /limited time/gi,
    /act fast/gi,
    /guaranteed/gi,
    /free money/gi,
    /make money fast/gi,
    /work from home/gi,
    /crypto/gi,
    /investment opportunity/gi
  ]

  let spamScore = 0
  const foundIndicators: string[] = []

  spamIndicators.forEach(pattern => {
    const matches = content.match(pattern)
    if (matches) {
      spamScore += matches.length
      foundIndicators.push(pattern.source)
    }
  })

  // Check for excessive capitalization
  const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length
  if (capsRatio > 0.3) {
    spamScore += 2
    foundIndicators.push('excessive capitalization')
  }

  // Check for excessive punctuation
  const punctRatio = (content.match(/[!?]{2,}/g) || []).length
  if (punctRatio > 3) {
    spamScore += 1
    foundIndicators.push('excessive punctuation')
  }

  return {
    passed: spamScore < 3,
    reason: spamScore >= 3 ? `Spam indicators found: ${foundIndicators.join(', ')}` : undefined,
    confidence: Math.min(spamScore / 5, 1)
  }
}

export function checkAIGeneratedContent(content: string): SecurityCheck {
  const aiIndicators = [
    /as an ai/gi,
    /i'm an ai/gi,
    /as a language model/gi,
    /i don't have personal/gi,
    /i cannot provide/gi,
    /it's important to note/gi,
    /in conclusion/gi,
    /furthermore/gi,
    /moreover/gi,
    /however, it's worth noting/gi,
    /it's worth mentioning/gi
  ]

  let aiScore = 0
  const foundIndicators: string[] = []

  aiIndicators.forEach(pattern => {
    const matches = content.match(pattern)
    if (matches) {
      aiScore += matches.length * 2
      foundIndicators.push(pattern.source)
    }
  })

  // Check for overly formal language patterns
  const formalPatterns = [
    /therefore/gi,
    /consequently/gi,
    /subsequently/gi,
    /nevertheless/gi
  ]

  let formalScore = 0
  formalPatterns.forEach(pattern => {
    if (pattern.test(content)) {
      formalScore += 1
    }
  })

  if (formalScore > 3) {
    aiScore += 1
    foundIndicators.push('overly formal language')
  }

  return {
    passed: aiScore < 4,
    reason: aiScore >= 4 ? `AI-generated content indicators: ${foundIndicators.join(', ')}` : undefined,
    confidence: Math.min(aiScore / 6, 1)
  }
}

export function checkDuplicateContent(content: string, existingContent: string[]): SecurityCheck {
  const similarity = existingContent.some(existing => {
    const similarity = calculateSimilarity(content, existing)
    return similarity > 0.8
  })

  return {
    passed: !similarity,
    reason: similarity ? 'Content appears to be duplicate or very similar to existing submission' : undefined,
    confidence: similarity ? 0.9 : 0.1
  }
}

function calculateSimilarity(str1: string, str2: string): number {
  const words1 = str1.toLowerCase().split(/\s+/)
  const words2 = str2.toLowerCase().split(/\s+/)
  
  const intersection = words1.filter(word => words2.includes(word))
  const union = [...new Set([...words1, ...words2])]
  
  return intersection.length / union.length
}

// PostgreSQL-based rate limiting implementation
import { prisma } from '@/lib/prisma'

// Conservative fallback for rate limit backend failures
type RLErrorState = { failures: number; firstAt: number; blockUntil?: number }
const rlErrorState = new Map<string, RLErrorState>()

export async function checkRateLimit(
  identifier: string,
  maxRequests: number,
  windowMs: number,
  endpointType: string
): Promise<boolean> {
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs)
  const expiresAt = new Date(windowStart.getTime() + windowMs)
  const stateKey = `${identifier}:${endpointType}`

  // If we recently saw repeated backend failures, apply short deny
  const state = rlErrorState.get(stateKey)
  if (state?.blockUntil && state.blockUntil > Date.now()) {
    return false
  }

  try {
    // Atomic upsert operation - no race conditions
    const result = await prisma.rateLimit.upsert({
      where: {
        identifier_endpointType_windowStart: {
          identifier,
          endpointType,
          windowStart
        }
      },
      update: {
        requestCount: { increment: 1 }
      },
      create: {
        identifier,
        endpointType,
        windowStart,
        expiresAt,
        requestCount: 1
      }
    })

    // Success: reset error state on healthy backend
    if (state) rlErrorState.delete(stateKey)
    return result.requestCount <= maxRequests
  } catch (error) {
    // Enhanced error handling with proper logging
    console.error('Rate limit check failed:', {
      identifier,
      endpointType,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    })

    // Conservative fallback: allow first transient errors, then short deny if repeated
    const now = Date.now()
    const cur = rlErrorState.get(stateKey)
    if (!cur || now - cur.firstAt > 60_000) {
      rlErrorState.set(stateKey, { failures: 1, firstAt: now })
      return true
    }
    const failures = cur.failures + 1
    if (failures >= 3) {
      rlErrorState.set(stateKey, { failures, firstAt: cur.firstAt, blockUntil: now + 30_000 })
      return false
    }
    rlErrorState.set(stateKey, { failures, firstAt: cur.firstAt })
    return true
  }
}

export function validateXPScore(score: number): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  }

  if (typeof score !== 'number' || isNaN(score)) {
    result.isValid = false
    result.errors.push('XP score must be a valid number')
    return result
  }

  if (score < 0) {
    result.isValid = false
    result.errors.push('XP score cannot be negative')
  }

  if (score > 100) {
    result.isValid = false
    result.errors.push('XP score cannot exceed 100')
  }

  if (score % 1 !== 0) {
    result.warnings.push('XP score should be a whole number')
  }

  return result
}

