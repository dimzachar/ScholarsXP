/**
 * Enhanced Duplicate Detection Service
 * 
 * Comprehensive duplicate detection that checks against:
 * 1. Legacy submissions (imported from Google Forms)
 * 2. Current submissions (from the app)
 * 3. Content fingerprints for similarity detection
 */

import { prisma } from '@/lib/prisma'
import { ContentData } from '@/types/task-types'
import { normalizeUrl } from '@/lib/utils'
import crypto from 'crypto'

// Local content fingerprint interface and function to avoid import issues
interface ContentFingerprint {
  hash: string
  normalizedContent: string
  keyPhrases: string[]
  contentLength: number
  wordCount: number
}

function normalizeContent(content: string): string {
  return content
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractKeyPhrases(content: string): string[] {
  const words = content.toLowerCase().split(/\s+/)
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'])

  const meaningfulWords = words.filter(word =>
    word.length > 3 && !stopWords.has(word)
  )

  const wordFreq = meaningfulWords.reduce((freq, word) => {
    freq[word] = (freq[word] || 0) + 1
    return freq
  }, {} as Record<string, number>)

  return Object.entries(wordFreq)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([word]) => word)
}

function generateContentFingerprint(content: string): ContentFingerprint {
  const normalizedContent = normalizeContent(content)
  const hash = crypto.createHash('sha256').update(normalizedContent).digest('hex')
  const keyPhrases = extractKeyPhrases(content)

  return {
    hash,
    normalizedContent,
    keyPhrases,
    contentLength: content.length,
    wordCount: content.split(/\s+/).length
  }
}

export interface EnhancedDuplicateCheckResult {
  isDuplicate: boolean
  duplicateType: 'URL_DUPLICATE' | 'CONTENT_DUPLICATE' | 'LEGACY_DUPLICATE' | 'NONE'
  duplicateSource: 'CURRENT_SUBMISSION' | 'LEGACY_SUBMISSION' | 'NONE'
  existingSubmission?: {
    id: string
    url: string
    platform: string
    userId?: string
    discordHandle?: string
    submittedAt: Date
    isLegacy: boolean
  }
  similarityScore: number
  message: string
}

export class EnhancedDuplicateDetectionService {

  /**
   * Unified duplicate check with configurable modes
   * @param url - The URL to check for duplicates
   * @param contentData - Content data (can be null for URL_ONLY mode)
   * @param currentUserId - Current user ID to exclude from duplicate checks
   * @param mode - Check mode:
   *   - 'URL_ONLY': Fast API mode - only check URL duplicates
   *   - 'CONTENT_ONLY': Background mode - only check content duplicates (URL already checked)
   *   - 'FULL': Complete check - both URL and content duplicates
   */
  async checkForDuplicate(
    url: string,
    contentData: ContentData | null,
    currentUserId: string,
    mode: 'URL_ONLY' | 'CONTENT_ONLY' | 'FULL' = 'FULL'
  ): Promise<EnhancedDuplicateCheckResult> {
    // Normalize URL for consistent duplicate detection
    const normalizedUrl = normalizeUrl(url)

    console.log(`🚀 [DUPLICATE-CHECK] Starting ${mode} duplicate check`)
    console.log(`📋 [DUPLICATE-CHECK] Input parameters:`, {
      originalUrl: url,
      normalizedUrl,
      mode,
      platform: contentData?.platform || 'unknown',
      contentLength: contentData?.content?.length || 0,
      hasContent: !!contentData?.content,
      currentUserId
    })

    try {
      // 1. Check for exact URL duplicates (skip in CONTENT_ONLY mode)
      if (mode !== 'CONTENT_ONLY') {
        console.log(`\n1️⃣ [DUPLICATE-CHECK] Checking URL duplicates in current submissions...`)
        const urlDuplicateCheck = await this.checkUrlDuplicateInSubmissions(normalizedUrl, currentUserId)
        if (urlDuplicateCheck.isDuplicate) {
          console.log(`❌ [DUPLICATE-CHECK] Found URL duplicate in current submissions`)
          return urlDuplicateCheck
        }

        // 2. Check for exact URL duplicates in legacy submissions
        console.log(`\n2️⃣ [DUPLICATE-CHECK] Checking URL duplicates in legacy submissions...`)
        const legacyUrlCheck = await this.checkUrlDuplicateInLegacy(url, normalizedUrl)
        if (legacyUrlCheck.isDuplicate) {
          console.log(`❌ [DUPLICATE-CHECK] Found URL duplicate in legacy submissions`)
          return legacyUrlCheck
        }
      } else {
        console.log(`\n1️⃣ [DUPLICATE-CHECK] Skipping URL duplicate checks (CONTENT_ONLY mode)`)
      }

      // 3. Check for content duplicates using fingerprints (skip in URL_ONLY mode)
      if (mode !== 'URL_ONLY' && contentData) {
        console.log(`\n3️⃣ [DUPLICATE-CHECK] Checking content duplicates using fingerprints...`)
        const contentDuplicateCheck = await this.checkContentDuplicate(contentData, currentUserId)
        if (contentDuplicateCheck.isDuplicate) {
          console.log(`❌ [DUPLICATE-CHECK] Found content duplicate`)
          return contentDuplicateCheck
        }
      } else if (mode === 'URL_ONLY') {
        console.log(`\n3️⃣ [DUPLICATE-CHECK] Skipping content duplicate check (URL_ONLY mode)`)
      }

      console.log(`✅ [DUPLICATE-CHECK] No duplicates found - submission is unique`)
      return {
        isDuplicate: false,
        duplicateType: 'NONE',
        duplicateSource: 'NONE',
        similarityScore: 0,
        message: 'No duplicates found'
      }

    } catch (error) {
      console.error('❌ [DUPLICATE-CHECK] Error in enhanced duplicate detection:', error)
      if (error instanceof Error) {
        console.error('❌ [DUPLICATE-CHECK] Stack trace:', error.stack)
      }
      return {
        isDuplicate: false,
        duplicateType: 'NONE',
        duplicateSource: 'NONE',
        similarityScore: 0,
        message: 'Error checking for duplicates'
      }
    }
  }

  /**
   * Check for URL duplicates in current submissions
   */
  private async checkUrlDuplicateInSubmissions(
    url: string,
    currentUserId: string
  ): Promise<EnhancedDuplicateCheckResult> {
    console.log(`🔍 [DUPLICATE-CHECK] Checking current submissions for URL: ${url}`)
    console.log(`👤 [DUPLICATE-CHECK] Including all users (including current user: ${currentUserId})`)

    // Generate URL variations for comprehensive matching
    const normalizedUrl = normalizeUrl(url)
    const urlVariations = this.generateUrlVariations(url, normalizedUrl)
    console.log(`🔄 [DUPLICATE-CHECK] Generated ${urlVariations.length} URL variations to check:`)
    urlVariations.forEach((variation, index) => {
      console.log(`  ${index + 1}. ${variation}`)
    })

    const existingSubmission = await prisma.submission.findFirst({
      where: {
        OR: urlVariations.map((urlVariation: string) => ({ url: urlVariation })),
        status: { not: 'REJECTED' } // Don't count rejected submissions
      },
      include: {
        user: {
          select: {
            discordHandle: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    console.log(`📊 [DUPLICATE-CHECK] Current submission query result:`, existingSubmission ? 'FOUND' : 'NOT FOUND')

    if (existingSubmission) {
      console.log(`📝 [DUPLICATE-CHECK] Current submission details:`, {
        id: existingSubmission.id,
        url: existingSubmission.url,
        platform: existingSubmission.platform,
        userId: existingSubmission.userId,
        status: existingSubmission.status,
        createdAt: existingSubmission.createdAt
      })

      // Check if it's the same user or different user
      const isSameUser = existingSubmission.userId === currentUserId
      const message = isSameUser
        ? `You have already submitted this URL`
        : `This URL was already submitted by another user`

      return {
        isDuplicate: true,
        duplicateType: 'URL_DUPLICATE',
        duplicateSource: 'CURRENT_SUBMISSION',
        existingSubmission: {
          id: existingSubmission.id,
          url: existingSubmission.url,
          platform: existingSubmission.platform,
          userId: existingSubmission.userId,
          discordHandle: existingSubmission.user.discordHandle || undefined,
          submittedAt: existingSubmission.createdAt,
          isLegacy: false
        },
        similarityScore: 1.0,
        message
      }
    }

    console.log(`✅ [DUPLICATE-CHECK] No URL duplicates found in current submissions`)
    return {
      isDuplicate: false,
      duplicateType: 'NONE',
      duplicateSource: 'NONE',
      similarityScore: 0,
      message: 'No URL duplicates found in current submissions'
    }
  }

  /**
   * Generate URL variations for comprehensive duplicate detection
   * Handles cases where URLs might have different query parameters
   */
  private generateUrlVariations(originalUrl: string, normalizedUrl: string): string[] {
    const variations = new Set<string>()

    // Add the original and normalized URLs
    variations.add(originalUrl)
    variations.add(normalizedUrl)

    try {
      // Generate variations without query parameters
      const originalUrlObj = new URL(originalUrl)
      const normalizedUrlObj = new URL(normalizedUrl)

      // Version without query parameters
      const originalWithoutQuery = `${originalUrlObj.protocol}//${originalUrlObj.host}${originalUrlObj.pathname}`
      const normalizedWithoutQuery = `${normalizedUrlObj.protocol}//${normalizedUrlObj.host}${normalizedUrlObj.pathname}`

      variations.add(originalWithoutQuery)
      variations.add(normalizedWithoutQuery)

      // For Medium specifically, also try with and without trailing slash
      if (originalUrlObj.hostname.includes('medium.com')) {
        const withSlash = originalWithoutQuery.endsWith('/') ? originalWithoutQuery : originalWithoutQuery + '/'
        const withoutSlash = originalWithoutQuery.endsWith('/') ? originalWithoutQuery.slice(0, -1) : originalWithoutQuery
        variations.add(withSlash)
        variations.add(withoutSlash)

        // Also add common Medium parameters that might exist in legacy data
        variations.add(originalWithoutQuery + '?postPublishedType=initial')
        variations.add(withSlash + '?postPublishedType=initial')
        variations.add(withoutSlash + '?postPublishedType=initial')
      }

    } catch (error) {
      console.log(`⚠️ [DUPLICATE-CHECK] Error generating URL variations:`, error)
    }

    return Array.from(variations)
  }

  /**
   * Check for URL duplicates in legacy submissions
   * Checks both original and normalized URLs to handle URL format differences
   */
  private async checkUrlDuplicateInLegacy(originalUrl: string, normalizedUrl: string): Promise<EnhancedDuplicateCheckResult> {
    console.log(`🔍 [DUPLICATE-CHECK] Checking legacy submissions for URLs:`)
    console.log(`  - Original: ${originalUrl}`)
    console.log(`  - Normalized: ${normalizedUrl}`)

    // Generate additional URL variations for better matching
    const urlVariations = this.generateUrlVariations(originalUrl, normalizedUrl)
    console.log(`🔄 [DUPLICATE-CHECK] Generated ${urlVariations.length} URL variations to check:`)
    urlVariations.forEach((variation, index) => {
      console.log(`  ${index + 1}. ${variation}`)
    })

    // Check all URL variations
    const legacySubmission = await prisma.legacySubmission.findFirst({
      where: {
        OR: urlVariations.map((url: string) => ({ url }))
      }
    })

    console.log(`📊 [DUPLICATE-CHECK] Legacy submission query result:`, legacySubmission ? 'FOUND' : 'NOT FOUND')

    if (legacySubmission) {
      console.log(`📝 [DUPLICATE-CHECK] Legacy submission details:`, {
        id: legacySubmission.id,
        url: legacySubmission.url,
        discordHandle: legacySubmission.discordHandle,
        submittedAt: legacySubmission.submittedAt,
        importedAt: legacySubmission.importedAt
      })

      return {
        isDuplicate: true,
        duplicateType: 'LEGACY_DUPLICATE',
        duplicateSource: 'LEGACY_SUBMISSION',
        existingSubmission: {
          id: legacySubmission.id,
          url: legacySubmission.url,
          platform: 'Legacy',
          discordHandle: legacySubmission.discordHandle || undefined,
          submittedAt: legacySubmission.submittedAt || legacySubmission.importedAt,
          isLegacy: true
        },
        similarityScore: 1.0,
        message: `This URL was already submitted`
      }
    }

    console.log(`✅ [DUPLICATE-CHECK] No URL duplicates found in legacy submissions`)
    return {
      isDuplicate: false,
      duplicateType: 'NONE',
      duplicateSource: 'NONE',
      similarityScore: 0,
      message: 'No URL duplicates found in legacy submissions'
    }
  }

  /**
   * Check for content duplicates using fingerprints
   */
  private async checkContentDuplicate(
    contentData: ContentData,
    currentUserId: string
  ): Promise<EnhancedDuplicateCheckResult> {
    console.log(`🔍 [DUPLICATE-CHECK] Checking content duplicates...`)
    console.log(`📊 [DUPLICATE-CHECK] Content length: ${contentData.content?.length || 0}`)

    if (!contentData.content || contentData.content.trim() === '') {
      console.log(`⚠️ [DUPLICATE-CHECK] Content is empty, skipping content fingerprint check`)
      return {
        isDuplicate: false,
        duplicateType: 'NONE',
        duplicateSource: 'NONE',
        similarityScore: 0,
        message: 'No content duplicates found (empty content)'
      }
    }

    const fingerprint = generateContentFingerprint(contentData.content)
    console.log(`🔑 [DUPLICATE-CHECK] Generated content fingerprint hash: ${fingerprint.hash}`)

    // Check for exact content hash matches
    const exactMatches = await prisma.contentFingerprint.findMany({
      where: {
        hash: fingerprint.hash
      },
      include: {
        submission: {
          include: {
            user: {
              select: {
                discordHandle: true
              }
            }
          }
        },
        legacySubmission: true
      }
    })

    console.log(`📊 [DUPLICATE-CHECK] Found ${exactMatches.length} content fingerprint matches`)

    for (const match of exactMatches) {
      console.log(`🔍 [DUPLICATE-CHECK] Examining content fingerprint match:`, {
        submissionId: match.submission?.id,
        legacySubmissionId: match.legacySubmission?.id,
        url: match.url,
        platform: match.platform
      })

      // Skip if it's the user's own content
      if (match.submission && match.submission.userId === currentUserId) {
        console.log(`⏭️ [DUPLICATE-CHECK] Skipping match - user's own content`)
        continue
      }

      // Skip rejected submissions
      if (match.submission && match.submission.status === 'REJECTED') {
        console.log(`⏭️ [DUPLICATE-CHECK] Skipping match - rejected submission`)
        continue
      }

      if (match.submission) {
        console.log(`❌ [DUPLICATE-CHECK] Found content duplicate in current submission`)
        return {
          isDuplicate: true,
          duplicateType: 'CONTENT_DUPLICATE',
          duplicateSource: 'CURRENT_SUBMISSION',
          existingSubmission: {
            id: match.submission.id,
            url: match.submission.url,
            platform: match.submission.platform,
            userId: match.submission.userId,
            discordHandle: match.submission.user.discordHandle || undefined,
            submittedAt: match.submission.createdAt,
            isLegacy: false
          },
          similarityScore: 1.0,
          message: 'This content appears to be identical to a previously submitted piece'
        }
      }

      if (match.legacySubmission) {
        console.log(`❌ [DUPLICATE-CHECK] Found content duplicate in legacy submission`)
        return {
          isDuplicate: true,
          duplicateType: 'CONTENT_DUPLICATE',
          duplicateSource: 'LEGACY_SUBMISSION',
          existingSubmission: {
            id: match.legacySubmission.id,
            url: match.legacySubmission.url,
            platform: 'Legacy',
            discordHandle: match.legacySubmission.discordHandle || undefined,
            submittedAt: match.legacySubmission.submittedAt || match.legacySubmission.importedAt,
            isLegacy: true
          },
          similarityScore: 1.0,
          message: `This content appears to be identical to content submitted`
        }
      }
    }

    console.log(`✅ [DUPLICATE-CHECK] No content duplicates found`)

    return {
      isDuplicate: false,
      duplicateType: 'NONE',
      duplicateSource: 'NONE',
      similarityScore: 0,
      message: 'No content duplicates found'
    }
  }

  /**
   * Get legacy submissions by Discord handle
   */
  async getLegacySubmissionsByDiscordHandle(discordHandle: string): Promise<any[]> {
    return await prisma.legacySubmission.findMany({
      where: { discordHandle },
      orderBy: { submittedAt: 'desc' }
    })
  }

  /**
   * Import legacy submission data
   */
  async importLegacySubmission(data: {
    url: string
    discordHandle?: string
    submittedAt?: Date
    role?: string
    notes?: string
  }): Promise<string> {
    const legacySubmission = await prisma.legacySubmission.create({
      data: {
        url: data.url,
        discordHandle: data.discordHandle,
        submittedAt: data.submittedAt,
        role: data.role,
        notes: data.notes,
        processed: false
      }
    })

    return legacySubmission.id
  }

  /**
   * Bulk import legacy submissions
   */
  async bulkImportLegacySubmissions(submissions: Array<{
    url: string
    discordHandle?: string
    submittedAt?: Date
    role?: string
    notes?: string
  }>): Promise<{ imported: number; errors: string[] }> {
    let imported = 0
    const errors: string[] = []

    for (const submission of submissions) {
      try {
        await this.importLegacySubmission(submission)
        imported++
      } catch (error) {
        errors.push(`Failed to import ${submission.url}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    return { imported, errors }
  }
}

export const enhancedDuplicateDetectionService = new EnhancedDuplicateDetectionService()
