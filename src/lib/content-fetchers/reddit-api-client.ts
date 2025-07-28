/**
 * Reddit API Client for Content Fetching
 * 
 * Implements Reddit API free tier integration with:
 * - Post content extraction
 * - Comment filtering (main content only)
 * - Rate limiting and error handling
 * - OAuth2 authentication
 */

import https from 'https'
import { ContentData } from '@/types/task-types'
import { checkRateLimit, recordApiRequest } from '@/lib/rate-limiter'
import { withRetry, withTimeout, ContentFetchError, logError } from '@/lib/content-fetchers/error-handler'

interface RedditContentData {
  content: string
  title: string
  author: string
  subreddit: string
  createdAt: string
  metadata: {
    postId: string
    subredditName: string
    score: number
    commentCount: number
    isTextPost: boolean
    url: string
  }
}

/**
 * Reddit API Client using direct HTTP requests
 */
export class RedditApiClient {
  private accessToken: string | null = null
  private tokenExpiry: number = 0

  constructor() {
    // Validate required environment variables
    const requiredVars = ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET']
    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        throw new Error(`Missing required environment variable: ${varName}`)
      }
    }
  }

  /**
   * Get Reddit access token using client credentials
   */
  private async getAccessToken(): Promise<string> {
    // Return cached token if still valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken
    }

    return new Promise((resolve, reject) => {
      const clientId = process.env.REDDIT_CLIENT_ID!
      const clientSecret = process.env.REDDIT_CLIENT_SECRET!
      const userAgent = process.env.REDDIT_USER_AGENT || 'Scholars_XP/1.0.0'

      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
      const postData = 'grant_type=client_credentials'

      const options = {
        hostname: 'www.reddit.com',
        path: '/api/v1/access_token',
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': userAgent,
          'Content-Length': postData.length
        }
      }

      const req = https.request(options, (res) => {
        let data = ''

        res.on('data', (chunk) => {
          data += chunk
        })

        res.on('end', () => {
          try {
            const response = JSON.parse(data)
            if (response.access_token) {
              this.accessToken = response.access_token
              // Set expiry to 90% of actual expiry for safety
              this.tokenExpiry = Date.now() + (response.expires_in * 900)
              resolve(response.access_token)
            } else {
              reject(new Error(`Token request failed: ${JSON.stringify(response)}`))
            }
          } catch (error) {
            reject(new Error(`Failed to parse token response: ${data}`))
          }
        })
      })

      req.on('error', (error) => {
        reject(error)
      })

      req.write(postData)
      req.end()
    })
  }

  /**
   * Extract post ID and subreddit from Reddit URL
   */
  private parseRedditUrl(url: string): { postId: string; subreddit: string } {
    // Handle various Reddit URL formats:
    // https://www.reddit.com/r/subreddit/comments/postid/title/
    // https://reddit.com/r/subreddit/comments/postid/
    // https://old.reddit.com/r/subreddit/comments/postid/title/
    
    const urlPatterns = [
      /\/r\/([^\/]+)\/comments\/([a-zA-Z0-9]+)/,
      /\/comments\/([a-zA-Z0-9]+)/
    ]

    for (const pattern of urlPatterns) {
      const match = url.match(pattern)
      if (match) {
        if (match.length === 3) {
          // Full pattern with subreddit
          return { subreddit: match[1], postId: match[2] }
        } else if (match.length === 2) {
          // Just post ID, we'll get subreddit from API
          return { subreddit: '', postId: match[1] }
        }
      }
    }

    throw new Error(`Invalid Reddit URL format: ${url}`)
  }

  /**
   * Check if we can make API request (rate limiting)
   */
  private async checkApiRateLimit(): Promise<boolean> {
    return await checkRateLimit('reddit', 'post_fetch', 60, 60 * 1000) // 60 per minute
  }

  /**
   * Clean and format Reddit content
   */
  private cleanRedditContent(content: string): string {
    if (!content) return ''

    return content
      // Remove Reddit markdown formatting
      .replace(/\*\*(.*?)\*\*/g, '$1') // Bold
      .replace(/\*(.*?)\*/g, '$1') // Italic
      .replace(/~~(.*?)~~/g, '$1') // Strikethrough
      .replace(/\^(.*?)\^/g, '$1') // Superscript
      // Remove excessive whitespace
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim()
  }

  /**
   * Fetch Reddit post using direct API
   */
  private async fetchRedditPost(postId: string, accessToken: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const userAgent = process.env.REDDIT_USER_AGENT || 'Scholars_XP/1.0.0'

      const options = {
        hostname: 'oauth.reddit.com',
        path: `/comments/${postId}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'User-Agent': userAgent
        }
      }

      const req = https.request(options, (res) => {
        let data = ''

        res.on('data', (chunk) => {
          data += chunk
        })

        res.on('end', () => {
          try {
            const response = JSON.parse(data)

            if (res.statusCode === 200 && response[0] && response[0].data && response[0].data.children[0]) {
              const post = response[0].data.children[0].data
              resolve(post)
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(response)}`))
            }
          } catch (error) {
            reject(new Error(`Failed to parse response: ${data.substring(0, 500)}`))
          }
        })
      })

      req.on('error', (error) => {
        reject(error)
      })

      req.end()
    })
  }

  /**
   * Extract content from Reddit post
   */
  async extractContent(url: string): Promise<ContentData> {
    console.log(`🔴 Starting Reddit content extraction for: ${url}`)

    return await withRetry(
      async () => {
        const { postId, subreddit } = this.parseRedditUrl(url)
        console.log(`📍 Parsed Reddit URL - Post ID: ${postId}, Subreddit: ${subreddit}`)

        // Check rate limit before making request
        const canMakeRequest = await this.checkApiRateLimit()
        if (!canMakeRequest) {
          throw new Error('Reddit API rate limit exceeded. Please try again later.')
        }

        // Get access token
        console.log(`🔑 Getting Reddit access token...`)
        const accessToken = await this.getAccessToken()

        // Fetch the submission (post)
        console.log(`🔍 Fetching Reddit post: ${postId}`)
        const submission = await this.fetchRedditPost(postId, accessToken)

        // Check if submission was fetched successfully
        if (!submission || !submission.title) {
          throw new Error(`Reddit post ${postId} not found or inaccessible`)
        }

        // Record successful API request
        await recordApiRequest('reddit', 'post_fetch')

        // Extract post data directly from API response
        const postTitle = submission.title || 'Reddit Post'
        const postContent = submission.selftext || ''
        const authorName = submission.author || 'unknown'
        const subredditName = submission.subreddit || subreddit

        // Handle timestamp safely
        let createdAt = new Date().toISOString() // Default to now
        try {
          if (submission.created_utc && typeof submission.created_utc === 'number' && !isNaN(submission.created_utc)) {
            createdAt = new Date(submission.created_utc * 1000).toISOString()
          }
        } catch (error) {
          console.warn(`⚠️ Invalid timestamp for Reddit post ${postId}:`, submission.created_utc)
        }

        // Get post metrics
        const score = submission.score || 0
        const commentCount = submission.num_comments || 0
        const isTextPost = Boolean(submission.selftext)
        const postUrl = submission.url || url

        // Clean and format content
        let fullContent = this.cleanRedditContent(postContent)

        // If it's a link post, include the URL
        if (!isTextPost && postUrl && postUrl !== url) {
          fullContent = `Link: ${postUrl}\n\n${fullContent}`
      }

      // Combine title and content for full text
      const combinedContent = `${postTitle}\n\n${fullContent}`.trim()

      // Calculate metadata
      const wordCount = combinedContent.split(/\s+/).filter(word => word.length > 0).length
      const hasScholarsOfMoveMention = /(@ScholarsOfMove|@Scholars_Of_Move|u\/ScholarsOfMove)/i.test(combinedContent)
      const hasScholarsOfMoveHashtag = /#(ScholarsOfMove|Scholars_Of_Move|ScholarXP)/i.test(combinedContent)

        console.log(`✅ Reddit content extracted successfully`)
        console.log(`📊 Content stats: ${wordCount} words, Score: ${score}, Comments: ${commentCount}`)
        console.log(`🏷️ Mentions: ${hasScholarsOfMoveMention}, Hashtags: ${hasScholarsOfMoveHashtag}`)

        return {
          url,
          platform: 'Reddit',
          content: combinedContent,
          title: postTitle,
          extractedAt: new Date(),
          metadata: {
            wordCount,
            hasScholarsOfMoveMention,
            hasScholarsOfMoveHashtag,
            extractionMethod: 'Reddit API',
            postId,
            subredditName,
            authorName,
            score,
            commentCount,
            isTextPost,
            createdAt,
            originalUrl: postUrl
          }
        }
      },
      {
        url,
        platform: 'reddit',
        method: 'extractContent',
        attempt: 0,
        maxAttempts: 3
      }
    ).catch((error: ContentFetchError) => {
      logError(error, { url, postId: this.parseRedditUrl(url).postId })
      throw error
    })
  }

  /**
   * Test API connection and credentials
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('🧪 Testing Reddit API connection...')
      
      // Test with a simple API call
      const user = await this.client.getMe()
      console.log(`✅ Reddit API connection successful. Authenticated as: ${user.name}`)
      
      return true
    } catch (error: any) {
      console.error('❌ Reddit API connection test failed:', error)
      return false
    }
  }

  /**
   * Get API usage information
   */
  async getApiUsage(): Promise<{ remaining: number; resetTime: number }> {
    try {
      // Reddit doesn't provide explicit rate limit headers like Twitter
      // We'll implement our own tracking
      const rateLimitInfo = await checkRateLimit('reddit', 'post_fetch', 60, 60 * 1000, true)
      
      return {
        remaining: rateLimitInfo ? 60 - (rateLimitInfo as any).requestCount : 60,
        resetTime: Date.now() + (60 * 1000) // Reset in 1 minute
      }
    } catch (error) {
      console.error('Error getting Reddit API usage:', error)
      return { remaining: 0, resetTime: Date.now() + (60 * 1000) }
    }
  }
}

/**
 * Singleton instance for Reddit API client
 */
let redditClient: RedditApiClient | null = null

export function getRedditClient(): RedditApiClient {
  if (!redditClient) {
    redditClient = new RedditApiClient()
  }
  return redditClient
}

/**
 * Extract content from Reddit URL (main export function)
 */
export async function extractRedditContent(url: string): Promise<ContentData> {
  const client = getRedditClient()
  return await client.extractContent(url)
}
