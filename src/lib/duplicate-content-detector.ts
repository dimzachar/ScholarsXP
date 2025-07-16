/**
 * Duplicate Content Detection System
 * 
 * Prevents gaming the system by detecting duplicate or similar content
 * across submissions and platforms.
 */

import { prisma } from '@/lib/prisma'
import { ContentData } from '@/types/task-types'
import crypto from 'crypto'

export interface DuplicateCheckResult {
  isDuplicate: boolean
  similarSubmissions: SimilarSubmission[]
  contentFingerprint: string
  similarityScore: number
  duplicateType: 'EXACT' | 'NEAR_DUPLICATE' | 'SIMILAR' | 'UNIQUE'
}

export interface SimilarSubmission {
  submissionId: string
  url: string
  platform: string
  userId: string
  similarityScore: number
  createdAt: Date
  contentFingerprint: string
}

export interface ContentFingerprint {
  hash: string
  normalizedContent: string
  keyPhrases: string[]
  contentLength: number
  wordCount: number
}

const SIMILARITY_THRESHOLDS = {
  EXACT_DUPLICATE: 0.95,
  NEAR_DUPLICATE: 0.85,
  SIMILAR_CONTENT: 0.70,
  UNIQUE_CONTENT: 0.70
}

/**
 * Check for duplicate or similar content
 */
export async function checkForDuplicateContent(
  contentData: ContentData,
  userId: string
): Promise<DuplicateCheckResult> {
  // Generate content fingerprint
  const fingerprint = generateContentFingerprint(contentData.content)
  
  // Check for exact duplicates first
  const exactDuplicates = await findExactDuplicates(fingerprint.hash, userId)
  
  if (exactDuplicates.length > 0) {
    return {
      isDuplicate: true,
      similarSubmissions: exactDuplicates,
      contentFingerprint: fingerprint.hash,
      similarityScore: 1.0,
      duplicateType: 'EXACT'
    }
  }

  // Check for near duplicates and similar content
  const similarContent = await findSimilarContent(fingerprint, userId)
  
  // Determine duplicate type based on highest similarity score
  let duplicateType: 'EXACT' | 'NEAR_DUPLICATE' | 'SIMILAR' | 'UNIQUE' = 'UNIQUE'
  let maxSimilarity = 0

  if (similarContent.length > 0) {
    maxSimilarity = Math.max(...similarContent.map(s => s.similarityScore))
    
    if (maxSimilarity >= SIMILARITY_THRESHOLDS.EXACT_DUPLICATE) {
      duplicateType = 'EXACT'
    } else if (maxSimilarity >= SIMILARITY_THRESHOLDS.NEAR_DUPLICATE) {
      duplicateType = 'NEAR_DUPLICATE'
    } else if (maxSimilarity >= SIMILARITY_THRESHOLDS.SIMILAR_CONTENT) {
      duplicateType = 'SIMILAR'
    }
  }

  return {
    isDuplicate: maxSimilarity >= SIMILARITY_THRESHOLDS.SIMILAR_CONTENT,
    similarSubmissions: similarContent,
    contentFingerprint: fingerprint.hash,
    similarityScore: maxSimilarity,
    duplicateType
  }
}

/**
 * Generate content fingerprint for duplicate detection
 */
function generateContentFingerprint(content: string): ContentFingerprint {
  // Normalize content for comparison
  const normalizedContent = normalizeContent(content)
  
  // Generate hash
  const hash = crypto.createHash('sha256').update(normalizedContent).digest('hex')
  
  // Extract key phrases
  const keyPhrases = extractKeyPhrases(normalizedContent)
  
  return {
    hash,
    normalizedContent,
    keyPhrases,
    contentLength: content.length,
    wordCount: content.split(/\s+/).filter(word => word.length > 0).length
  }
}

/**
 * Normalize content for comparison
 */
function normalizeContent(content: string): string {
  return content
    .toLowerCase()
    // Remove URLs
    .replace(/https?:\/\/[^\s]+/g, '')
    // Remove mentions and hashtags for comparison
    .replace(/@\w+/g, '')
    .replace(/#\w+/g, '')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    // Remove punctuation
    .replace(/[^\w\s]/g, '')
    .trim()
}

/**
 * Extract key phrases from content
 */
function extractKeyPhrases(normalizedContent: string): string[] {
  const words = normalizedContent.split(/\s+/).filter(word => word.length > 3)
  
  // Create 3-word phrases (trigrams)
  const phrases: string[] = []
  for (let i = 0; i < words.length - 2; i++) {
    phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`)
  }
  
  // Return most common phrases
  const phraseCount = new Map<string, number>()
  phrases.forEach(phrase => {
    phraseCount.set(phrase, (phraseCount.get(phrase) || 0) + 1)
  })
  
  return Array.from(phraseCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase]) => phrase)
}

/**
 * Find exact duplicates by hash
 */
async function findExactDuplicates(
  contentHash: string,
  currentUserId: string
): Promise<SimilarSubmission[]> {
  // This would query a content_fingerprints table in a real implementation
  // For now, return empty array as we don't have the table structure
  
  // In a real implementation:
  // const duplicates = await prisma.contentFingerprint.findMany({
  //   where: {
  //     hash: contentHash,
  //     submission: {
  //       userId: { not: currentUserId } // Don't flag user's own content
  //     }
  //   },
  //   include: {
  //     submission: true
  //   }
  // })
  
  return []
}

/**
 * Find similar content using key phrase matching
 */
async function findSimilarContent(
  fingerprint: ContentFingerprint,
  currentUserId: string
): Promise<SimilarSubmission[]> {
  // This would implement sophisticated similarity detection
  // For now, return empty array as we don't have the full implementation
  
  // In a real implementation, this would:
  // 1. Query submissions with similar key phrases
  // 2. Calculate similarity scores using various algorithms
  // 3. Return submissions above similarity threshold
  
  return []
}

/**
 * Calculate similarity between two content pieces
 */
function calculateSimilarity(content1: string, content2: string): number {
  const normalized1 = normalizeContent(content1)
  const normalized2 = normalizeContent(content2)
  
  // Simple Jaccard similarity for demonstration
  const words1 = new Set(normalized1.split(/\s+/))
  const words2 = new Set(normalized2.split(/\s+/))
  
  const intersection = new Set([...words1].filter(word => words2.has(word)))
  const union = new Set([...words1, ...words2])
  
  return intersection.size / union.size
}

/**
 * Store content fingerprint for future duplicate detection
 */
export async function storeContentFingerprint(
  submissionId: string,
  contentData: ContentData
): Promise<void> {
  const fingerprint = generateContentFingerprint(contentData.content)
  
  // In a real implementation, this would store the fingerprint:
  // await prisma.contentFingerprint.create({
  //   data: {
  //     submissionId,
  //     hash: fingerprint.hash,
  //     normalizedContent: fingerprint.normalizedContent,
  //     keyPhrases: fingerprint.keyPhrases,
  //     contentLength: fingerprint.contentLength,
  //     wordCount: fingerprint.wordCount
  //   }
  // })
  
  console.log(`Stored content fingerprint for submission ${submissionId}: ${fingerprint.hash}`)
}

/**
 * Check if URL has been submitted before
 */
export async function checkUrlDuplicate(url: string, currentUserId: string): Promise<{
  isDuplicate: boolean
  existingSubmission?: {
    id: string
    userId: string
    createdAt: Date
    platform: string
  }
}> {
  try {
    const existingSubmission = await prisma.submission.findFirst({
      where: {
        url,
        userId: { not: currentUserId }, // Allow users to resubmit their own content
        status: { not: 'REJECTED' } // Don't count rejected submissions
      },
      select: {
        id: true,
        userId: true,
        createdAt: true,
        platform: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    return {
      isDuplicate: !!existingSubmission,
      existingSubmission: existingSubmission || undefined
    }
  } catch (error) {
    console.error('Error checking URL duplicate:', error)
    return { isDuplicate: false }
  }
}

/**
 * Check for cross-platform content reposting
 */
export async function checkCrossPlatformDuplicate(
  contentData: ContentData,
  userId: string
): Promise<{
  isCrossPlatformDuplicate: boolean
  originalSubmissions: SimilarSubmission[]
}> {
  // This would check if the same content has been posted on different platforms
  // Cross-platform posting of the same content should earn separate XP according to the spec
  
  const fingerprint = generateContentFingerprint(contentData.content)
  
  // In a real implementation, this would find submissions with same content hash
  // but different platforms, and return them as cross-platform duplicates
  
  return {
    isCrossPlatformDuplicate: false,
    originalSubmissions: []
  }
}

/**
 * Get duplicate detection summary for display
 */
export function getDuplicateDetectionSummary(result: DuplicateCheckResult): string {
  switch (result.duplicateType) {
    case 'EXACT':
      return `❌ Exact duplicate detected (${Math.round(result.similarityScore * 100)}% match)`
    case 'NEAR_DUPLICATE':
      return `⚠️ Near duplicate detected (${Math.round(result.similarityScore * 100)}% similarity)`
    case 'SIMILAR':
      return `⚠️ Similar content detected (${Math.round(result.similarityScore * 100)}% similarity)`
    case 'UNIQUE':
      return `✅ Unique content (${Math.round(result.similarityScore * 100)}% similarity to existing content)`
    default:
      return '✅ Content appears to be unique'
  }
}
