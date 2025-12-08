/**
 * Twitter/X Platform Validator
 * 
 * Handles Twitter-specific content validation including thread detection,
 * tweet counting, and mention/hashtag detection within threads.
 */

import {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationMetadata,
  ContentData
} from '@/types/task-types'
import { hasRequiredMention, hasRequiredHashtag } from '@/lib/content-validator'
import { getWeekNumber } from '@/lib/utils'

export interface TwitterThreadData {
  tweets: TwitterTweet[]
  totalTweets: number
  totalCharacters: number
  hasMentionInThread: boolean
  hasHashtagInThread: boolean
  threadMetadata: {
    isThread: boolean
    threadLength: number
    averageTweetLength: number
    engagementIndicators: string[]
  }
}

export interface TwitterTweet {
  content: string
  length: number
  hasMention: boolean
  hasHashtag: boolean
  tweetNumber: number
}

/**
 * Validate Twitter/X content with thread detection and analysis
 */
export async function validateTwitterContent(
  contentData: ContentData
): Promise<ValidationResult & { twitterData?: TwitterThreadData }> {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  // Parse Twitter thread data
  const twitterData = parseTwitterThread(contentData.content)

  // Validate mention requirement across the thread
  if (!twitterData.hasMentionInThread) {
    errors.push({
      code: 'MISSING_MENTION',
      message: 'Missing required @ScholarsOfMove mention in Twitter thread',
      suggestion: 'Add "@ScholarsOfMove" in any tweet of your thread. This is required for all submissions.',
      field: 'content'
    })
  }

  // Validate hashtag requirement across the thread (temporarily disabled)
  // TODO: Re-enable when tweets with both mention and hashtag are available
  /*
  if (!twitterData.hasHashtagInThread) {
    errors.push({
      code: 'MISSING_HASHTAG',
      message: 'Missing required #ScholarsOfMove hashtag in Twitter thread',
      suggestion: 'Add "#ScholarsOfMove" in any tweet of your thread. This is required for all submissions.',
      field: 'content'
    })
  }
  */

  // Validate thread length for Task A qualification
  if (twitterData.isThread && twitterData.totalTweets < 5) {
    warnings.push({
      code: 'INSUFFICIENT_THREAD_LENGTH',
      message: `Thread has ${twitterData.totalTweets} tweets. Need 5+ tweets to qualify for Task A (Thread).`
    })
  }

  // Check for engagement indicators
  if (twitterData.threadMetadata.engagementIndicators.length === 0) {
    warnings.push({
      code: 'LOW_ENGAGEMENT_INDICATORS',
      message: 'Consider adding engagement elements like emojis, questions, or calls to action.'
    })
  }

  // Generate metadata
  const metadata: ValidationMetadata = {
    hasMention: twitterData.hasMentionInThread,
    hasHashtag: twitterData.hasHashtagInThread,
    mentionLocation: twitterData.hasMentionInThread ? 'thread' : undefined,
    hashtagLocation: twitterData.hasHashtagInThread ? 'thread' : undefined,
    contentLength: twitterData.totalCharacters,
    platform: 'Twitter',
    publicationDate: contentData.extractedAt,
    weekNumber: getWeekNumber(contentData.extractedAt),
    isOriginal: assessTwitterOriginality(twitterData),
    weeklyCompletions: {},
    platformMetadata: {
      twitter: {
        isThread: twitterData.isThread,
        tweetCount: twitterData.totalTweets,
        averageTweetLength: twitterData.threadMetadata.averageTweetLength,
        engagementIndicators: twitterData.threadMetadata.engagementIndicators
      }
    }
  }

  // Determine qualifying task types
  const qualifyingTaskTypes: string[] = []
  
  // Task A: Thread (5+ tweets) OR long content
  if (twitterData.isThread && twitterData.totalTweets >= 5) {
    qualifyingTaskTypes.push('A')
  } else if (twitterData.totalCharacters >= 2000) {
    qualifyingTaskTypes.push('A') // Long-form Twitter content
  }

  // Additional task type detection based on content analysis
  const additionalTypes = detectTwitterTaskTypes(twitterData)
  qualifyingTaskTypes.push(...additionalTypes)

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    qualifyingTaskTypes: [...new Set(qualifyingTaskTypes)], // Remove duplicates
    metadata,
    twitterData
  }
}

/**
 * Parse Twitter thread content into structured data
 */
function parseTwitterThread(content: string): TwitterThreadData {
  // Split content by common thread indicators
  const threadSeparators = [
    /\n\d+\//, // "1/", "2/", etc.
    /\n\d+\)/, // "1)", "2)", etc.
    /\n\d+\./, // "1.", "2.", etc.
    /\n🧵/, // Thread emoji
    /\n\d+\s*-/, // "1 -", "2 -", etc.
  ]

  let tweets: string[] = [content] // Default to single tweet

  // Try to detect thread structure
  for (const separator of threadSeparators) {
    const parts = content.split(separator)
    if (parts.length > 1) {
      tweets = parts.map(part => part.trim()).filter(part => part.length > 0)
      break
    }
  }

  // If no clear thread structure, try to split by double newlines
  if (tweets.length === 1 && content.includes('\n\n')) {
    const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0)
    if (paragraphs.length > 1) {
      tweets = paragraphs
    }
  }

  // Analyze each tweet
  const tweetData: TwitterTweet[] = tweets.map((tweetContent, index) => ({
    content: tweetContent,
    length: tweetContent.length,
    hasMention: hasRequiredMention(tweetContent),
    hasHashtag: hasRequiredHashtag(tweetContent),
    tweetNumber: index + 1
  }))

  const totalTweets = tweetData.length
  const totalCharacters = tweetData.reduce((sum, tweet) => sum + tweet.length, 0)
  const hasMentionInThread = tweetData.some(tweet => tweet.hasMention)
  const hasHashtagInThread = tweetData.some(tweet => tweet.hasHashtag)

  // Detect engagement indicators
  const engagementIndicators = detectEngagementIndicators(content)

  return {
    tweets: tweetData,
    totalTweets,
    totalCharacters,
    hasMentionInThread,
    hasHashtagInThread,
    threadMetadata: {
      isThread: totalTweets > 1,
      threadLength: totalTweets,
      averageTweetLength: Math.round(totalCharacters / totalTweets),
      engagementIndicators
    }
  }
}

/**
 * Detect engagement indicators in Twitter content
 */
function detectEngagementIndicators(content: string): string[] {
  const indicators: string[] = []

  // Emoji usage
  if (/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]/u.test(content)) {
    indicators.push('emojis')
  }

  // Questions
  if (content.includes('?')) {
    indicators.push('questions')
  }

  // Call to action phrases
  const ctaPhrases = ['what do you think', 'let me know', 'share your thoughts', 'comment below', 'retweet if']
  if (ctaPhrases.some(phrase => content.toLowerCase().includes(phrase))) {
    indicators.push('call_to_action')
  }

  // Thread indicators
  if (/🧵|thread|👇/.test(content)) {
    indicators.push('thread_indicators')
  }

  // Hashtags (beyond required ones)
  const hashtagCount = (content.match(/#\w+/g) || []).length
  if (hashtagCount > 1) { // More than just #ScholarsOfMove
    indicators.push('multiple_hashtags')
  }

  return indicators
}

/**
 * Detect additional task types based on Twitter content
 */
function detectTwitterTaskTypes(twitterData: TwitterThreadData): string[] {
  const taskTypes: string[] = []
  const content = twitterData.tweets.map(t => t.content).join(' ').toLowerCase()

  // Task C: Tutorial/Guide
  if (content.includes('tutorial') || content.includes('guide') || 
      content.includes('how to') || content.includes('step by step')) {
    taskTypes.push('C')
  }

  // Task D: Protocol Explanation
  if (content.includes('protocol') || content.includes('defi') || 
      content.includes('smart contract') || content.includes('blockchain')) {
    taskTypes.push('D')
  }

  // Task E: Correction Bounty
  if (content.includes('correction') || content.includes('fix') || 
      content.includes('error') || content.includes('mistake')) {
    taskTypes.push('E')
  }

  // Task F: Strategy
  if (content.includes('strategy') || content.includes('approach') || 
      content.includes('method') || content.includes('technique')) {
    taskTypes.push('F')
  }

  return taskTypes
}

/**
 * Assess originality of Twitter content
 */
function assessTwitterOriginality(twitterData: TwitterThreadData): boolean {
  const content = twitterData.tweets.map(t => t.content).join(' ').toLowerCase()

  // Check for AI-generated content indicators
  const aiIndicators = [
    'generated by ai',
    'this is an ai',
    'as an ai',
    'i am an ai',
    'artificial intelligence'
  ]

  if (aiIndicators.some(indicator => content.includes(indicator))) {
    return false
  }

  // Check for very short or generic content
  if (twitterData.totalCharacters < 100) {
    return false
  }

  // Check for personal voice indicators
  const personalIndicators = [
    'i think',
    'in my opinion',
    'my experience',
    'i believe',
    'personally',
    'from my perspective'
  ]

  const hasPersonalVoice = personalIndicators.some(indicator => content.includes(indicator))
  
  return hasPersonalVoice || twitterData.totalCharacters > 500
}

// getWeekNumber is now imported from @/lib/utils (ISO 8601 compliant)
