/**
 * Content Validation API Endpoint
 * 
 * Provides real-time validation feedback for content before submission
 * including mention/hashtag validation and task type suggestions.
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateSubmission } from '@/lib/content-validator'
import { checkForDuplicateContent, checkUrlDuplicate } from '@/lib/duplicate-content-detector'
import { canUserSubmitForTaskTypes } from '@/lib/weekly-task-tracker'
import { fetchContentFromUrl } from '@/lib/ai-evaluator'
import { detectPlatform } from '@/lib/utils'
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware'
import { ContentData, TaskTypeId } from '@/types/task-types'

export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const { url, platform, taskType } = await request.json()

    if (!url) {
      return NextResponse.json({
        error: 'URL is required',
        code: 'MISSING_URL'
      }, { status: 400 })
    }

    // Detect platform if not provided
    const detectedPlatform = platform || detectPlatform(url)
    if (!detectedPlatform) {
      return NextResponse.json({
        error: 'Could not detect platform. Supported platforms: Twitter/X, Medium, Reddit, Notion, LinkedIn, Discord, Telegram',
        code: 'UNSUPPORTED_PLATFORM'
      }, { status: 400 })
    }

    // Check for URL duplicates
    const urlDuplicateCheck = await checkUrlDuplicate(url, request.user!.id)

    // Fetch content
    let contentData: ContentData
    try {
      contentData = await fetchContentFromUrl(url)
    } catch (error) {
      return NextResponse.json({
        isValid: false,
        errors: [{
          code: 'CONTENT_FETCH_FAILED',
          message: 'Could not fetch content from URL',
          suggestion: 'Please ensure the URL is accessible and publicly viewable'
        }],
        warnings: [],
        metadata: {
          hasMention: false,
          hasHashtag: false,
          contentLength: 0,
          platform: detectedPlatform,
          weekNumber: 0,
          isOriginal: false,
          weeklyCompletions: {}
        }
      })
    }

    // Validate content
    const validationResult = await validateSubmission(
      contentData, 
      request.user!.id, 
      taskType ? [taskType as TaskTypeId] : undefined
    )

    // Check weekly limits for qualifying task types
    let weeklyLimitCheck = { canSubmit: true, blockedTaskTypes: [], reasons: [] }
    if (validationResult.qualifyingTaskTypes.length > 0) {
      weeklyLimitCheck = await canUserSubmitForTaskTypes(
        request.user!.id,
        validationResult.qualifyingTaskTypes as TaskTypeId[]
      )
    }

    // Check for duplicate content
    const duplicateCheck = await checkForDuplicateContent(contentData, request.user!.id)

    // Calculate estimated XP range
    let estimatedXp = { min: 0, max: 0 }
    if (validationResult.qualifyingTaskTypes.length > 0) {
      // This would use the task type configurations to estimate XP
      // For now, provide a basic estimate
      estimatedXp = {
        min: validationResult.qualifyingTaskTypes.length * 20,
        max: validationResult.qualifyingTaskTypes.length * 150
      }
    }

    return NextResponse.json({
      isValid: validationResult.isValid,
      errors: validationResult.errors,
      warnings: validationResult.warnings,
      metadata: {
        ...validationResult.metadata,
        urlDuplicate: urlDuplicateCheck.isDuplicate,
        duplicateContent: duplicateCheck.isDuplicate,
        duplicateType: duplicateCheck.duplicateType,
        similarityScore: duplicateCheck.similarityScore
      },
      suggestedTaskTypes: validationResult.qualifyingTaskTypes,
      estimatedXp,
      weeklyLimitStatus: {
        canSubmit: weeklyLimitCheck.canSubmit,
        blockedTaskTypes: weeklyLimitCheck.blockedTaskTypes,
        reasons: weeklyLimitCheck.reasons
      },
      recommendations: generateRecommendations(validationResult, duplicateCheck, weeklyLimitCheck)
    })

  } catch (error) {
    console.error('Error validating content:', error)
    return NextResponse.json({
      error: 'Internal server error during validation',
      code: 'VALIDATION_ERROR'
    }, { status: 500 })
  }
})

/**
 * Generate recommendations for improving content
 */
function generateRecommendations(
  validationResult: any,
  duplicateCheck: any,
  weeklyLimitCheck: any
): string[] {
  const recommendations: string[] = []

  // Universal validation recommendations
  if (!validationResult.metadata.hasMention) {
    recommendations.push('Add "@ScholarsOfMove" mention to your content - this is required for all submissions')
  }

  if (!validationResult.metadata.hasHashtag) {
    recommendations.push('Add "#ScholarsOfMove" hashtag to your content - this is required for all submissions')
  }

  // Content quality recommendations
  if (validationResult.metadata.contentLength < 500) {
    recommendations.push('Consider expanding your content for better engagement and higher XP potential')
  }

  if (validationResult.qualifyingTaskTypes.length === 0) {
    recommendations.push('Your content does not currently qualify for any task types. Consider adding more detailed explanations or tutorials')
  }

  // Duplicate content recommendations
  if (duplicateCheck.isDuplicate) {
    switch (duplicateCheck.duplicateType) {
      case 'EXACT':
        recommendations.push('This content appears to be an exact duplicate. Please create original content')
        break
      case 'NEAR_DUPLICATE':
        recommendations.push('This content is very similar to existing submissions. Consider adding more unique insights')
        break
      case 'SIMILAR':
        recommendations.push('This content is similar to existing submissions. Adding unique perspectives could improve originality')
        break
    }
  }

  // Weekly limit recommendations
  if (!weeklyLimitCheck.canSubmit) {
    recommendations.push('You have reached weekly limits for some task types. Consider submitting different types of content')
  }

  // Platform-specific recommendations
  if (validationResult.metadata.platform === 'Twitter' && validationResult.metadata.contentLength < 1000) {
    recommendations.push('For Twitter threads, consider creating longer, more detailed content (5+ tweets) to qualify for Task A')
  }

  if (['Reddit', 'Notion', 'Medium'].includes(validationResult.metadata.platform) && 
      validationResult.metadata.contentLength < 2000) {
    recommendations.push('For platform articles, ensure your content is at least 2000 characters to qualify for Task B')
  }

  return recommendations
}

// GET endpoint for validation rules and requirements
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const platform = searchParams.get('platform')

    const validationRules = {
      universal: {
        mention: {
          required: '@ScholarsOfMove',
          description: 'Must mention @ScholarsOfMove in content',
          caseInsensitive: true
        },
        hashtag: {
          required: '#ScholarsOfMove',
          description: 'Must include #ScholarsOfMove hashtag',
          caseInsensitive: true
        },
        timing: {
          description: 'Content must be published in current week (Monday-Sunday)'
        },
        originality: {
          description: 'Content must be original and Movement ecosystem focused'
        }
      },
      taskTypes: {
        A: {
          name: 'Thread or Long Article',
          xpRange: '20-30 XP',
          weeklyLimit: '90 XP (max 3 completions)',
          requirements: 'Twitter thread (5+ tweets) OR long article (2000+ chars)'
        },
        B: {
          name: 'Platform Article',
          xpRange: '75-150 XP',
          weeklyLimit: '450 XP (max 3 completions)',
          requirements: 'Article on Reddit/Notion/Medium (2000+ chars)',
          platformRestriction: 'Reddit, Notion, Medium only'
        },
        C: {
          name: 'Tutorial/Guide',
          xpRange: '20-30 XP',
          weeklyLimit: '90 XP (max 3 completions)',
          requirements: 'Tutorial/guide on partner app'
        },
        D: {
          name: 'Protocol Explanation',
          xpRange: '50-75 XP',
          weeklyLimit: '225 XP (max 3 completions)',
          requirements: 'Detailed explanation of partner protocol'
        },
        E: {
          name: 'Correction Bounty',
          xpRange: '50-75 XP',
          weeklyLimit: '225 XP (max 3 completions)',
          requirements: 'Correction bounty submission'
        },
        F: {
          name: 'Strategies',
          xpRange: '50-75 XP',
          weeklyLimit: '225 XP (max 3 completions)',
          requirements: 'Strategic content about Movement ecosystem'
        }
      },
      platformSpecific: platform ? getPlatformSpecificRules(platform) : null
    }

    return NextResponse.json(validationRules)

  } catch (error) {
    console.error('Error fetching validation rules:', error)
    return NextResponse.json({
      error: 'Internal server error',
      code: 'FETCH_ERROR'
    }, { status: 500 })
  }
}

function getPlatformSpecificRules(platform: string) {
  switch (platform.toLowerCase()) {
    case 'twitter':
      return {
        threadDetection: 'Automatically detects threads with 5+ tweets',
        mentionLocation: 'Mention can be in any tweet of the thread',
        hashtagLocation: 'Hashtag can be in any tweet of the thread',
        qualifyingTaskTypes: ['A', 'C', 'D', 'E', 'F']
      }
    case 'reddit':
    case 'notion':
    case 'medium':
      return {
        characterCount: 'Minimum 2000 characters for Task B',
        mentionLocation: 'Mention can be anywhere in the article',
        hashtagLocation: 'Hashtag can be in content or tags',
        qualifyingTaskTypes: ['A', 'B', 'C', 'D', 'E', 'F']
      }
    default:
      return {
        basicValidation: 'Standard mention and hashtag validation',
        qualifyingTaskTypes: ['A', 'C', 'D', 'E', 'F']
      }
  }
}
