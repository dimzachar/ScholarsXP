/**
 * Platform Article Validator (Reddit, Notion, Medium)
 * 
 * Handles validation for Task B - Platform articles that must be posted
 * on Reddit, Notion, or Medium with 2000+ characters.
 */

import {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationMetadata,
  ContentData
} from '@/types/task-types'
import { hasRequiredMention, hasRequiredHashtag } from '@/lib/content-validator'

export interface PlatformArticleData {
  platform: 'Reddit' | 'Notion' | 'Medium'
  characterCount: number
  wordCount: number
  readingTime: number // estimated minutes
  structure: ArticleStructure
  qualityIndicators: QualityIndicator[]
  hasMention: boolean
  hasHashtag: boolean
}

export interface ArticleStructure {
  hasTitle: boolean
  hasIntroduction: boolean
  hasConclusion: boolean
  sectionCount: number
  paragraphCount: number
  hasHeadings: boolean
  hasBulletPoints: boolean
  hasCodeBlocks: boolean
  hasLinks: boolean
}

export interface QualityIndicator {
  type: 'length' | 'structure' | 'formatting' | 'content' | 'engagement'
  score: number // 0-1
  description: string
}

const PLATFORM_RESTRICTIONS = ['Reddit', 'Notion', 'Medium']
const MIN_CHARACTER_COUNT = 2000

/**
 * Validate platform article content for Task B
 */
export async function validatePlatformArticle(
  contentData: ContentData
): Promise<ValidationResult & { articleData?: PlatformArticleData }> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  // Check platform restriction for Task B
  if (!PLATFORM_RESTRICTIONS.includes(contentData.platform)) {
    errors.push({
      code: 'PLATFORM_RESTRICTED',
      message: `Task B (Platform Article) is restricted to ${PLATFORM_RESTRICTIONS.join(', ')}. Current platform: ${contentData.platform}`,
      suggestion: `Post your article on one of these platforms: ${PLATFORM_RESTRICTIONS.join(', ')}`,
      field: 'platform'
    })
  }

  // Parse article data
  const articleData = parseArticleContent(contentData)

  // Validate mention requirement
  if (!articleData.hasMention) {
    errors.push({
      code: 'MISSING_MENTION',
      message: 'Missing required @ScholarsOfMove mention in article',
      suggestion: 'Add "@ScholarsOfMove" anywhere in your article content. This is required for all submissions.',
      field: 'content'
    })
  }

  // Validate hashtag requirement
  if (!articleData.hasHashtag) {
    errors.push({
      code: 'MISSING_HASHTAG',
      message: 'Missing required #ScholarsOfMove hashtag in article',
      suggestion: 'Add "#ScholarsOfMove" anywhere in your article content or tags. This is required for all submissions.',
      field: 'content'
    })
  }

  // Validate minimum character count
  if (articleData.characterCount < MIN_CHARACTER_COUNT) {
    errors.push({
      code: 'INSUFFICIENT_LENGTH',
      message: `Article too short for Task B. Required: ${MIN_CHARACTER_COUNT} characters, found: ${articleData.characterCount}`,
      suggestion: `Add more content to reach the minimum ${MIN_CHARACTER_COUNT} characters for Task B qualification.`,
      field: 'content'
    })
  }

  // Quality warnings
  if (articleData.structure.sectionCount < 3) {
    warnings.push({
      code: 'IMPROVE_STRUCTURE',
      message: 'Consider adding more sections to improve article structure and readability.'
    })
  }

  if (articleData.readingTime < 5) {
    warnings.push({
      code: 'SHORT_READING_TIME',
      message: `Estimated reading time: ${articleData.readingTime} minutes. Consider expanding for better engagement.`
    })
  }

  if (!articleData.structure.hasConclusion) {
    warnings.push({
      code: 'MISSING_CONCLUSION',
      message: 'Consider adding a conclusion section to summarize key points.'
    })
  }

  // Generate metadata
  const metadata: ValidationMetadata = {
    hasMention: articleData.hasMention,
    hasHashtag: articleData.hasHashtag,
    mentionLocation: articleData.hasMention ? 'article_content' : undefined,
    hashtagLocation: articleData.hasHashtag ? 'article_content' : undefined,
    contentLength: articleData.characterCount,
    platform: contentData.platform,
    publicationDate: contentData.extractedAt,
    weekNumber: getWeekNumber(contentData.extractedAt),
    isOriginal: assessArticleOriginality(articleData),
    weeklyCompletions: {},
    platformMetadata: {
      article: {
        platform: articleData.platform,
        wordCount: articleData.wordCount,
        readingTime: articleData.readingTime,
        structure: articleData.structure,
        qualityScore: calculateQualityScore(articleData.qualityIndicators)
      }
    }
  }

  // Determine qualifying task types
  const qualifyingTaskTypes: string[] = []
  
  // Task B: Platform Article (if all requirements met)
  if (PLATFORM_RESTRICTIONS.includes(contentData.platform) && 
      articleData.characterCount >= MIN_CHARACTER_COUNT &&
      articleData.hasMention && articleData.hasHashtag) {
    qualifyingTaskTypes.push('B')
  }

  // Additional task type detection
  const additionalTypes = detectArticleTaskTypes(articleData, contentData.content)
  qualifyingTaskTypes.push(...additionalTypes)

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    qualifyingTaskTypes: [...new Set(qualifyingTaskTypes)],
    metadata,
    articleData
  }
}

/**
 * Parse article content into structured data
 */
function parseArticleContent(contentData: ContentData): PlatformArticleData {
  const content = contentData.content
  const characterCount = content.length
  const wordCount = content.split(/\s+/).filter(word => word.length > 0).length
  const readingTime = Math.ceil(wordCount / 200) // Assume 200 words per minute

  // Analyze article structure
  const structure = analyzeArticleStructure(content)
  
  // Calculate quality indicators
  const qualityIndicators = calculateQualityIndicators(content, structure, characterCount, wordCount)

  return {
    platform: contentData.platform as 'Reddit' | 'Notion' | 'Medium',
    characterCount,
    wordCount,
    readingTime,
    structure,
    qualityIndicators,
    hasMention: hasRequiredMention(content),
    hasHashtag: hasRequiredHashtag(content)
  }
}

/**
 * Analyze article structure
 */
function analyzeArticleStructure(content: string): ArticleStructure {
  const lines = content.split('\n').filter(line => line.trim().length > 0)
  
  // Detect headings (markdown style or formatted)
  const headingPatterns = [
    /^#{1,6}\s+/, // Markdown headings
    /^[A-Z][^.!?]*$/, // All caps or title case lines
    /^\*\*.*\*\*$/, // Bold text as headings
  ]
  
  const hasHeadings = lines.some(line => 
    headingPatterns.some(pattern => pattern.test(line.trim()))
  )

  // Count sections (separated by headings or double newlines)
  const sectionCount = Math.max(1, content.split(/\n\s*\n/).length)
  
  // Count paragraphs
  const paragraphCount = content.split(/\n\s*\n/).filter(p => p.trim().length > 50).length

  // Detect bullet points
  const hasBulletPoints = /^[\s]*[-*+•]\s+/m.test(content)

  // Detect code blocks
  const hasCodeBlocks = /```|`[^`]+`/.test(content)

  // Detect links
  const hasLinks = /https?:\/\/|www\.|\.com|\.org/.test(content)

  // Detect introduction (first substantial paragraph)
  const firstParagraph = content.split(/\n\s*\n/)[0]
  const hasIntroduction = firstParagraph && firstParagraph.length > 100

  // Detect conclusion (last substantial paragraph with conclusion keywords)
  const lastParagraph = content.split(/\n\s*\n/).slice(-1)[0]
  const conclusionKeywords = ['conclusion', 'summary', 'in summary', 'to conclude', 'finally']
  const hasConclusion = lastParagraph && 
    conclusionKeywords.some(keyword => lastParagraph.toLowerCase().includes(keyword))

  // Detect title (first line if it looks like a title)
  const firstLine = lines[0]
  const hasTitle = firstLine && firstLine.length < 100 && !firstLine.endsWith('.')

  return {
    hasTitle,
    hasIntroduction,
    hasConclusion,
    sectionCount,
    paragraphCount,
    hasHeadings,
    hasBulletPoints,
    hasCodeBlocks,
    hasLinks
  }
}

/**
 * Calculate quality indicators for the article
 */
function calculateQualityIndicators(
  content: string, 
  structure: ArticleStructure, 
  characterCount: number, 
  wordCount: number
): QualityIndicator[] {
  const indicators: QualityIndicator[] = []

  // Length quality
  let lengthScore = 0
  if (characterCount >= 4000) lengthScore = 1.0
  else if (characterCount >= 3000) lengthScore = 0.8
  else if (characterCount >= 2000) lengthScore = 0.6
  else lengthScore = 0.3

  indicators.push({
    type: 'length',
    score: lengthScore,
    description: `Article length: ${characterCount} characters (${wordCount} words)`
  })

  // Structure quality
  let structureScore = 0
  if (structure.hasTitle) structureScore += 0.2
  if (structure.hasIntroduction) structureScore += 0.2
  if (structure.hasConclusion) structureScore += 0.2
  if (structure.hasHeadings) structureScore += 0.2
  if (structure.sectionCount >= 3) structureScore += 0.2

  indicators.push({
    type: 'structure',
    score: structureScore,
    description: `Structure score: ${Math.round(structureScore * 100)}% (${structure.sectionCount} sections)`
  })

  // Formatting quality
  let formattingScore = 0
  if (structure.hasBulletPoints) formattingScore += 0.3
  if (structure.hasCodeBlocks) formattingScore += 0.3
  if (structure.hasLinks) formattingScore += 0.2
  if (structure.hasHeadings) formattingScore += 0.2

  indicators.push({
    type: 'formatting',
    score: Math.min(1.0, formattingScore),
    description: `Formatting elements: ${[
      structure.hasBulletPoints && 'bullet points',
      structure.hasCodeBlocks && 'code blocks',
      structure.hasLinks && 'links',
      structure.hasHeadings && 'headings'
    ].filter(Boolean).join(', ') || 'basic text'}`
  })

  return indicators
}

/**
 * Calculate overall quality score
 */
function calculateQualityScore(indicators: QualityIndicator[]): number {
  if (indicators.length === 0) return 0
  return indicators.reduce((sum, indicator) => sum + indicator.score, 0) / indicators.length
}

/**
 * Detect additional task types based on article content
 */
function detectArticleTaskTypes(articleData: PlatformArticleData, content: string): string[] {
  const taskTypes: string[] = []
  const lowerContent = content.toLowerCase()

  // Task A: Long Article (if 2000+ characters)
  if (articleData.characterCount >= 2000) {
    taskTypes.push('A')
  }

  // Task C: Tutorial/Guide
  if (lowerContent.includes('tutorial') || lowerContent.includes('guide') || 
      lowerContent.includes('how to') || lowerContent.includes('step by step')) {
    taskTypes.push('C')
  }

  // Task D: Protocol Explanation
  if (lowerContent.includes('protocol') || lowerContent.includes('defi') || 
      lowerContent.includes('smart contract') || lowerContent.includes('blockchain')) {
    taskTypes.push('D')
  }

  // Task F: Strategy
  if (lowerContent.includes('strategy') || lowerContent.includes('approach') || 
      lowerContent.includes('method') || lowerContent.includes('analysis')) {
    taskTypes.push('F')
  }

  return taskTypes
}

/**
 * Assess article originality
 */
function assessArticleOriginality(articleData: PlatformArticleData): boolean {
  // Basic originality assessment
  if (articleData.characterCount < 1000) return false
  if (articleData.structure.sectionCount < 2) return false
  
  // Articles with good structure are more likely to be original
  return articleData.structure.hasIntroduction && 
         articleData.structure.sectionCount >= 3 &&
         articleData.wordCount >= 300
}

/**
 * Get week number from date (placeholder)
 */
function getWeekNumber(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1)
  const diff = date.getTime() - start.getTime()
  const oneWeek = 1000 * 60 * 60 * 24 * 7
  return Math.floor(diff / oneWeek) + 1
}
