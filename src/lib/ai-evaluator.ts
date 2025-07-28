import OpenAI from 'openai'
import { ContentAnalysis, ContentData } from '@/types/task-types'
import { TASK_TYPES } from '@/lib/task-types'
import { hasRequiredMention, hasRequiredHashtag } from '@/lib/content-validator'
import { extractRedditContent as extractRedditContentAPI } from '@/lib/content-fetchers/reddit-api-client'
// Browser tools import temporarily disabled due to TypeScript path resolution issues
// TODO: Fix TypeScript module resolution for browser-tools
// import {
//   browser_navigate_Playwright,
//   browser_wait_for_Playwright,
//   browser_snapshot_Playwright,
//   browser_close_Playwright,
//   extractContentFromSnapshot,
//   extractTitleFromSnapshot
// } from '@/lib/browser-tools'

// Updated task type definitions for AI evaluation
const TASK_TYPE_DEFINITIONS = {
  A: {
    name: 'Thread or Long Article',
    description: 'Twitter/X thread (5+ tweets) OR long article (2000+ characters)',
    xpRange: '20-30 XP',
    examples: 'Multi-tweet threads, comprehensive articles, detailed explanations'
  },
  B: {
    name: 'Platform Article',
    description: 'Article in reddit/notion/medium (2000+ characters)',
    xpRange: '75-150 XP',
    examples: 'Medium articles, Reddit posts, Notion pages with substantial content',
    platformRestriction: 'Must be on Reddit, Notion, or Medium only'
  },
  C: {
    name: 'Tutorial/Guide',
    description: 'Tutorial/guide on a partner app',
    xpRange: '20-30 XP',
    examples: 'Step-by-step guides, how-to tutorials, app walkthroughs'
  },
  D: {
    name: 'Protocol Explanation',
    description: 'Detailed explanation of partner protocol',
    xpRange: '50-75 XP',
    examples: 'DeFi protocol explanations, smart contract analysis, technical deep-dives'
  },
  E: {
    name: 'Correction Bounty',
    description: 'Correction bounty submission',
    xpRange: '50-75 XP',
    examples: 'Error corrections, fact-checking, improvement suggestions'
  },
  F: {
    name: 'Strategies',
    description: 'Strategic content about Movement ecosystem',
    xpRange: '50-75 XP',
    examples: 'Investment strategies, usage strategies, ecosystem analysis'
  }
}

export async function evaluateContent(contentData: ContentData): Promise<ContentAnalysis> {
  try {
    // Initialize OpenRouter client for AI evaluation
    const openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
        "X-Title": "Scholars_XP",
      },
    })

    // Pre-validation: Check for required mention and hashtag
    const hasMention = hasRequiredMention(contentData.content)
    const hasHashtag = hasRequiredHashtag(contentData.content)

    if (!hasMention || !hasHashtag) {
      // Return minimal analysis for content missing requirements
      return {
        taskTypes: [],
        baseXp: 0,
        originalityScore: 0,
        reasoning: `Content validation failed: Missing ${!hasMention ? '@ScholarsOfMove mention' : ''}${!hasMention && !hasHashtag ? ' and ' : ''}${!hasHashtag ? '#ScholarsOfMove hashtag' : ''}`,
        confidence: 1.0,
        qualityScore: 0
      }
    }

    const prompt = `
You are an AI evaluator for the Scholars_XP system. Analyze the following content and classify it according to the NEW task type system.

IMPORTANT: Content can qualify for MULTIPLE task types simultaneously. Evaluate all applicable types.

TASK TYPE DEFINITIONS:
${Object.entries(TASK_TYPE_DEFINITIONS).map(([id, def]) =>
  `- ${id}: ${def.name} (${def.xpRange})
    Description: ${def.description}
    ${'platformRestriction' in def ? `RESTRICTION: ${def.platformRestriction}` : ''}
    Examples: ${def.examples}`
).join('\n')}

EVALUATION CRITERIA:
1. Multi-task classification: Content can qualify for multiple types (e.g., a thread explaining a protocol = A + D)
2. Quality scoring (0-100): Based on depth, originality, educational value, effort
3. Originality score (0-1): Human vs AI-generated content detection
4. Platform compliance: Check platform restrictions (Task B limited to Reddit/Notion/Medium)

CONTENT TO ANALYZE:
Platform: ${contentData.platform}
URL: ${contentData.url}
Title: ${contentData.title || 'N/A'}
Content Length: ${contentData.content.length} characters
Content: ${contentData.content}

VALIDATION STATUS:
✅ @ScholarsOfMove mention: ${hasMention ? 'Found' : 'Missing'}
✅ #ScholarsOfMove hashtag: ${hasHashtag ? 'Found' : 'Missing'}

Respond in JSON format:
{
  "taskTypes": ["A", "D"], // Array of ALL applicable task types
  "baseXp": 85, // Quality score 0-100
  "originalityScore": 0.9, // Originality 0-1
  "reasoning": "Detailed explanation of why content qualifies for each task type",
  "confidence": 0.95, // Confidence in classification 0-1
  "qualityScore": 0.85 // Overall quality assessment 0-1
}
`

    const response = await openai.chat.completions.create({
      model: 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert content evaluator. Respond only with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1000
    })

    const result = response.choices[0]?.message?.content
    if (!result) {
      throw new Error('No response from AI evaluator')
    }

    const analysis: ContentAnalysis = JSON.parse(result)

    // Validate and filter task types
    const validTaskTypes = analysis.taskTypes.filter(taskType => TASK_TYPES[taskType as keyof typeof TASK_TYPES])
    analysis.taskTypes = validTaskTypes

    // Apply originality penalty to base XP
    if (analysis.originalityScore < 0.5) {
      analysis.baseXp = Math.floor(analysis.baseXp * 0.5) // 50% penalty for low originality
    } else if (analysis.originalityScore < 0.7) {
      analysis.baseXp = Math.floor(analysis.baseXp * 0.8) // 20% penalty for moderate originality
    }

    // Ensure confidence and qualityScore are set
    if (!analysis.confidence) {
      analysis.confidence = 0.8 // Default confidence
    }
    if (!analysis.qualityScore) {
      analysis.qualityScore = analysis.baseXp / 100 // Convert baseXp to quality score
    }

    return analysis

  } catch (error) {
    console.error('Error in AI evaluation:', error)
    throw new Error('Failed to evaluate content')
  }
}

/**
 * Validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Timeout wrapper for promises
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    })
  ])
}

/**
 * Detect platform from URL
 */
function detectPlatform(url: string): string {
  const urlLower = url.toLowerCase()

  if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
    return 'Twitter'
  } else if (urlLower.includes('medium.com')) {
    return 'Medium'
  } else if (urlLower.includes('reddit.com')) {
    return 'Reddit'
  } else if (urlLower.includes('notion.so') || urlLower.includes('notion.site')) {
    return 'Notion'
  } else if (urlLower.includes('linkedin.com')) {
    return 'LinkedIn'
  } else if (urlLower.includes('github.com')) {
    return 'GitHub'
  } else if (urlLower.includes('substack.com')) {
    return 'Substack'
  } else {
    return 'Other'
  }
}

/**
 * Unified content fetcher using API-first approach with fallbacks
 * Priority order: 1) Native APIs, 2) LLM with web browsing, 3) MCP browser automation
 * Includes timeout handling, retry logic, and graceful error handling
 */
export async function fetchContentFromUrl(url: string): Promise<ContentData> {
  // Validate URL format
  if (!isValidUrl(url)) {
    throw new Error(`Invalid URL format: ${url}`)
  }

  const maxRetries = 2
  const timeoutMs = 30000 // 30 seconds timeout
  const platform = detectPlatform(url)

  console.log(`🚀 Starting content extraction for ${url} (Platform: ${platform})`)

  // Try API-based extraction first (Reddit only - Twitter uses LLM fallback due to API restrictions)
  if (platform === 'Reddit') {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempting API content fetch for ${url} (attempt ${attempt}/${maxRetries})`)

        const result = await withTimeout(
          fetchContentWithAPI(url, platform),
          timeoutMs,
          `API content fetching timed out after ${timeoutMs}ms`
        )

        console.log(`✅ API content fetch successful for ${url}`)
        return result
      } catch (error) {
        console.error(`❌ API content fetching failed for ${url} (attempt ${attempt}):`, error)

        if (attempt === maxRetries) {
          console.log(`All API attempts failed for ${url}, trying LLM fallback`)
          break
        }

        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
    }
  }

  // Try LLM approach with retries
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempting LLM content fetch for ${url} (attempt ${attempt}/${maxRetries})`)

      const result = await withTimeout(
        fetchContentWithLLM(url),
        timeoutMs,
        `LLM content fetching timed out after ${timeoutMs}ms`
      )

      console.log(`LLM content fetch successful for ${url}`)
      return result
    } catch (error) {
      console.error(`LLM content fetching failed for ${url} (attempt ${attempt}):`, error)

      if (attempt === maxRetries) {
        console.log(`All LLM attempts failed for ${url}, trying MCP fallback`)
        break
      }

      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    }
  }

  // Try MCP approach with retries
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempting MCP content fetch for ${url} (attempt ${attempt}/${maxRetries})`)

      const result = await withTimeout(
        fetchContentWithMCP(url),
        timeoutMs,
        `MCP content fetching timed out after ${timeoutMs}ms`
      )

      console.log(`MCP content fetch successful for ${url}`)
      return result
    } catch (error) {
      console.error(`MCP content fetching failed for ${url} (attempt ${attempt}):`, error)

      if (attempt === maxRetries) {
        break
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
    }
  }

  // All approaches failed - return error for FLAGGED status
  console.error(`All content extraction attempts failed for ${url}`)

  // Provide more detailed error information for debugging
  throw new Error(`Content extraction failed for ${url}: API, LLM, and MCP approaches all failed after ${maxRetries} attempts each. Please check the server logs for detailed error information. This submission will be flagged for manual review.`)
}

/**
 * API-based content fetching for supported platforms
 * Currently supports: Reddit (Twitter uses LLM fallback due to API restrictions)
 */
async function fetchContentWithAPI(url: string, platform: string): Promise<ContentData> {
  console.log(`🔌 Starting API-based content extraction for ${platform}: ${url}`)

  switch (platform) {
    case 'Reddit':
      return await extractRedditContentAPI(url)

    default:
      throw new Error(`API-based extraction not supported for platform: ${platform}. Supported platforms: Reddit`)
  }
}

/**
 * Primary content fetching using LLM with web browsing
 */
async function fetchContentWithLLM(url: string): Promise<ContentData> {
  console.log(`🤖 Initializing OpenRouter client for ${url}`)
  console.log(`🔑 API Key present: ${!!process.env.OPENROUTER_API_KEY}`)
  console.log(`🌐 Site URL: ${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}`)

  // Initialize OpenRouter client
  const openrouter = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
      "X-Title": "Scholars_XP",
    },
  })

  console.log(`📡 Making OpenRouter API call for ${url}`)

  const completion = await openrouter.chat.completions.create({
    model: "openai/gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: `Please browse to this URL and extract the content: ${url}

You have web browsing capabilities enabled. Please visit the URL and extract the actual content from the page.

CRITICAL: Do NOT generate, hallucinate, or make up content. Only extract what is actually present on the page.

For Twitter/X posts:
- Extract the main tweet text
- If it's a thread, include all tweets from the main author
- Include any quoted tweets or retweets if relevant
- Do not include replies from other users

For articles (Medium, Reddit, etc.):
- Extract the main article content
- Include the title and main body text
- Exclude comments, sidebars, navigation, and advertisements

Return the extracted information as JSON:
{
  "content": "The actual text content from the page - DO NOT MAKE THIS UP",
  "title": "The actual title/headline from the page",
  "platform": "Detected platform (Twitter, Medium, Reddit, etc.)",
  "hasScholarsOfMoveMention": "boolean - true if @ScholarsOfMove is mentioned in the content",
  "hasScholarsOfMoveHashtag": "boolean - true if #ScholarsOfMove hashtag is present",
  "wordCount": "actual word count of the extracted content",
  "error": null
}

If you cannot access the URL or encounter any errors, return:
{
  "content": null,
  "title": null,
  "platform": null,
  "hasScholarsOfMoveMention": false,
  "hasScholarsOfMoveHashtag": false,
  "wordCount": 0,
  "error": "Description of the specific error encountered"
}`
      }
    ],
    temperature: 0.1,
    max_tokens: 4000
  })

  console.log(`✅ OpenRouter API call completed for ${url}`)

  const result = completion.choices[0]?.message?.content
  if (!result) {
    throw new Error('No response from OpenRouter LLM')
  }

  let parsedResult
  try {
    parsedResult = JSON.parse(result)
  } catch (parseError) {
    throw new Error(`Failed to parse LLM response: ${parseError}`)
  }

  if (parsedResult.error) {
    console.log(`⚠️  LLM reported error: ${parsedResult.error}`)
    throw new Error(`LLM reported error: ${parsedResult.error}`)
  }

  // Check if LLM doesn't have web browsing capabilities
  if (!parsedResult.content) {
    console.log(`⚠️  LLM doesn't have web browsing - falling back to browser automation`)
    throw new Error(`LLM web browsing not available - falling back to browser automation`)
  }

  // Additional validation to detect hallucinated content
  // Temporarily disabled to test new online model capabilities
  // if (isLikelyHallucinatedContent(parsedResult.content, url)) {
  //   console.log(`⚠️  Detected potentially hallucinated content from LLM`)
  //   throw new Error(`LLM appears to be generating hallucinated content instead of extracting from URL`)
  // }

  return {
    url,
    platform: parsedResult.platform || detectPlatform(url),
    content: parsedResult.content,
    title: parsedResult.title,
    extractedAt: new Date(),
    metadata: {
      wordCount: parsedResult.wordCount,
      hasScholarsOfMoveMention: parsedResult.hasScholarsOfMoveMention,
      hasScholarsOfMoveHashtag: parsedResult.hasScholarsOfMoveHashtag,
      extractionMethod: 'LLM'
    }
  }
}

/**
 * Content fetching using Playwright browser automation
 */
async function fetchContentWithMCP(url: string): Promise<ContentData> {
  console.log(`🌐 Starting Playwright browser automation for ${url}`)

  try {
    // Navigate to the URL using the available Playwright tools
    console.log(`📍 Navigating to ${url}`)

    // Use the browser navigation tool
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'
    const navigationResult = await fetch(`${baseUrl}/api/internal/playwright/navigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    })

    if (!navigationResult.ok) {
      throw new Error(`Navigation failed: ${navigationResult.statusText}`)
    }

    console.log(`✅ [Playwright API] Navigation successful`)

    // Wait for content to load
    console.log(`⏳ Waiting for content to load...`)
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Take a snapshot to get the page content
    console.log(`📸 Taking page snapshot...`)
    const snapshotResult = await fetch(`${baseUrl}/api/internal/playwright/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })

    if (!snapshotResult.ok) {
      throw new Error(`Snapshot failed: ${snapshotResult.statusText}`)
    }

    console.log(`✅ [Playwright API] Snapshot successful`)

    const snapshotData = await snapshotResult.json()
    const snapshot = snapshotData.content || snapshotData.snapshot || ''

    console.log(`📄 Raw snapshot preview:`)
    console.log(`${snapshot.substring(0, 500)}...`)

    // Extract content based on platform
    const platform = detectPlatform(url)
    const { content, title } = await extractContentFromPlaywrightSnapshot(snapshot, url, platform)

    console.log(`📝 Extracted content preview:`)
    console.log(`Title: ${title}`)
    console.log(`Content (first 300 chars): ${content.substring(0, 300)}...`)
    console.log(`Platform: ${platform}`)

    // Detect required mention and hashtag
    const hasScholarsOfMoveMention = hasRequiredMention(content)
    const hasScholarsOfMoveHashtag = hasRequiredHashtag(content)

    console.log(`🔍 Content validation:`)
    console.log(`- Has @ScholarsOfMove mention: ${hasScholarsOfMoveMention}`)
    console.log(`- Has #ScholarsOfMove hashtag: ${hasScholarsOfMoveHashtag}`)

    // Calculate word count
    const wordCount = content.split(/\s+/).filter((word: string) => word.length > 0).length

    console.log(`📊 Content stats: ${wordCount} words`)
    console.log(`✅ Successfully extracted content from ${url}`)

    // Close browser to free resources
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'
      await fetch(`${baseUrl}/api/internal/playwright/close`, { method: 'POST' })
      console.log(`✅ [Playwright API] Browser closed`)
    } catch (closeError) {
      console.error('Failed to close browser:', closeError)
    }

    return {
      url,
      platform,
      content,
      title,
      extractedAt: new Date(),
      metadata: {
        wordCount,
        hasScholarsOfMoveMention,
        hasScholarsOfMoveHashtag,
        extractionMethod: 'Playwright'
      }
    }
  } catch (error) {
    console.error(`❌ Playwright browser automation failed for ${url}:`, error)

    // Try to close browser even if there was an error
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'
      await fetch(`${baseUrl}/api/internal/playwright/close`, { method: 'POST' })
    } catch (closeError) {
      console.error('Failed to close browser:', closeError)
    }

    throw new Error(`Playwright browser automation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Extract content from Playwright snapshot based on platform
 */
async function extractContentFromPlaywrightSnapshot(snapshot: string, url: string, platform: string): Promise<{ content: string; title: string }> {
  console.log(`🔍 Extracting content for platform: ${platform}`)

  if (platform === 'Twitter') {
    return extractTwitterContent(snapshot, url)
  } else if (platform === 'Medium') {
    return extractMediumContent(snapshot, url)
  } else if (platform === 'Reddit') {
    return extractRedditContent(snapshot, url)
  } else {
    return extractGenericContent(snapshot, url)
  }
}

/**
 * Extract Twitter/X content from snapshot
 */
function extractTwitterContent(snapshot: string, url: string): { content: string; title: string } {
  console.log(`🐦 Extracting Twitter content from snapshot`)
  console.log(`📄 Raw snapshot for Twitter extraction:`)
  console.log(snapshot.substring(0, 500) + '...')

  // Look for text content in the snapshot - specifically look for lines starting with "text"
  const textLines = snapshot.split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('text "') && line.endsWith('"'))
    .map(line => line.slice(6, -1)) // Remove 'text "' and '"'

  console.log(`📝 Found ${textLines.length} text lines:`)
  textLines.forEach((line, index) => {
    console.log(`  ${index + 1}: ${line}`)
  })

  // Combine all text lines that look like tweet content
  let extractedContent = ''

  if (textLines.length > 0) {
    // Filter out navigation and UI text, keep actual content
    const contentLines = textLines.filter(line => {
      const lowerLine = line.toLowerCase()
      return !lowerLine.includes('home') &&
             !lowerLine.includes('explore') &&
             !lowerLine.includes('notifications') &&
             !lowerLine.includes('trending') &&
             !lowerLine.includes('who to follow') &&
             !lowerLine.includes('author:') &&
             !lowerLine.includes('platform:') &&
             !lowerLine.includes('timestamp:') &&
             line.length > 10 // Ignore very short lines
    })

    console.log(`📝 Filtered content lines (${contentLines.length}):`)
    contentLines.forEach((line, index) => {
      console.log(`  ${index + 1}: ${line}`)
    })

    extractedContent = contentLines.join(' ').trim()
  }

  // Fallback extraction if no text lines found
  if (!extractedContent) {
    console.log(`⚠️  No text lines found, using fallback extraction`)
    const cleanedSnapshot = snapshot
      .replace(/button|link|image|icon|menu|navigation/gi, '')
      .replace(/\s+/g, ' ')
      .trim()

    extractedContent = cleanedSnapshot.substring(0, 280).trim()
  }

  console.log(`🐦 Final extracted Twitter content (${extractedContent.length} chars):`)
  console.log(`"${extractedContent}"`)

  // Check for required mentions in extracted content
  const hasMention = /@ScholarsOfMove/i.test(extractedContent)
  const hasHashtag = /#ScholarsOfMove/i.test(extractedContent)
  console.log(`🔍 Content validation check:`)
  console.log(`  - Has @ScholarsOfMove mention: ${hasMention}`)
  console.log(`  - Has #ScholarsOfMove hashtag: ${hasHashtag}`)

  return {
    content: extractedContent || `Content extracted from Twitter URL: ${url}`,
    title: 'Twitter Post'
  }
}

/**
 * Extract Medium content from snapshot
 */
function extractMediumContent(snapshot: string, url: string): { content: string; title: string } {
  console.log(`📰 Extracting Medium content from snapshot`)

  // Look for article title and content patterns
  const titlePatterns = [
    /title\s*[:\-]?\s*(.+?)(?:\n|$)/gi,
    /heading\s*[:\-]?\s*(.+?)(?:\n|$)/gi,
    /h1\s*[:\-]?\s*(.+?)(?:\n|$)/gi
  ]

  let title = 'Medium Article'
  let content = ''

  // Extract title
  for (const pattern of titlePatterns) {
    const match = snapshot.match(pattern)
    if (match && match[0]) {
      title = match[0].replace(/title\s*[:\-]?\s*/gi, '').trim()
      break
    }
  }

  // Extract main content (remove UI elements)
  content = snapshot
    .replace(/button|link|image|icon|menu|navigation|sidebar/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  console.log(`📰 Extracted Medium content: ${content.substring(0, 100)}...`)

  return {
    content: content || `Content extracted from Medium URL: ${url}`,
    title
  }
}

/**
 * Extract Reddit content from snapshot
 */
function extractRedditContent(snapshot: string, url: string): { content: string; title: string } {
  console.log(`🔴 Extracting Reddit content from snapshot`)

  let title = 'Reddit Post'
  let content = snapshot
    .replace(/button|link|image|icon|menu|navigation|sidebar|vote|comment/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  console.log(`🔴 Extracted Reddit content: ${content.substring(0, 100)}...`)

  return {
    content: content || `Content extracted from Reddit URL: ${url}`,
    title
  }
}

/**
 * Extract generic content from snapshot
 */
function extractGenericContent(snapshot: string, url: string): { content: string; title: string } {
  console.log(`🌐 Extracting generic content from snapshot`)

  let title = 'Web Content'
  let content = snapshot
    .replace(/button|link|image|icon|menu|navigation|sidebar|header|footer/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  console.log(`🌐 Extracted generic content: ${content.substring(0, 100)}...`)

  return {
    content: content || `Content extracted from URL: ${url}`,
    title
  }
}

/**
 * Detect if content is likely hallucinated by the LLM
 * This helps identify when LLMs generate fake content instead of extracting real content
 */
function isLikelyHallucinatedContent(content: string, url: string): boolean {
  // Check for generic Move ecosystem content that appears in multiple submissions
  const suspiciousPatterns = [
    /move language is now officially open source/i,
    /apache 20 license/i,
    /huge milestone for the entire move ecosystem/i,
    /movebased project and im excited to share/i,
    /building anything in the move ecosystem/i,
    /years of development across multiple chains/i
  ]

  // If content matches known hallucinated patterns, flag it
  const matchesHallucinatedPattern = suspiciousPatterns.some(pattern => pattern.test(content))

  if (matchesHallucinatedPattern) {
    console.log(`🚨 Content matches known hallucination patterns for ${url}`)
    return true
  }

  // Check for generic/templated content that doesn't seem URL-specific
  const genericPatterns = [
    /this is a (huge|major|significant) milestone/i,
    /the future is bright/i,
    /check out the repo/i,
    /all major contributors onboard/i
  ]

  const hasGenericPatterns = genericPatterns.some(pattern => pattern.test(content))
  const isVeryShort = content.length < 100
  const isVeryLong = content.length > 2000

  // Flag content that seems too generic or templated
  if (hasGenericPatterns && (isVeryShort || isVeryLong)) {
    console.log(`🚨 Content appears generic/templated for ${url}`)
    return true
  }

  return false
}

