import { NextResponse } from 'next/server'
import { submissionService, userService } from '@/lib/database'
import { detectPlatform, getWeekNumber } from '@/lib/utils'
import { withPermission, withAuth, AuthenticatedRequest } from '@/lib/auth-middleware'
import { validateSubmission } from '@/lib/content-validator'
import { checkForDuplicateContent, checkUrlDuplicate } from '@/lib/duplicate-content-detector'
import { canUserSubmitForTaskTypes } from '@/lib/weekly-task-tracker'
import { fetchContentFromUrl } from '@/lib/ai-evaluator'
import { ContentData } from '@/types/task-types'
import { createServiceClient } from '@/lib/supabase-server'

export const POST = withPermission('submit_content')(async (request: AuthenticatedRequest) => {
  try {
    const { url } = await request.json()

    if (!url) {
      return NextResponse.json({
        error: 'URL is required',
        code: 'MISSING_URL'
      }, { status: 400 })
    }

    const platform = detectPlatform(url)
    if (!platform) {
      return NextResponse.json({
        error: 'Platform not supported. Supported platforms: Twitter/X, Medium, Reddit, Notion, LinkedIn, Discord, Telegram',
        code: 'UNSUPPORTED_PLATFORM'
      }, { status: 400 })
    }

    // Check for URL duplicates
    const urlDuplicateCheck = await checkUrlDuplicate(url, request.user!.id)
    if (urlDuplicateCheck.isDuplicate) {
      return NextResponse.json({
        error: 'This URL has already been submitted by another user',
        code: 'DUPLICATE_URL',
        existingSubmission: urlDuplicateCheck.existingSubmission
      }, { status: 400 })
    }

    // Fetch and validate content
    let contentData: ContentData
    try {
      contentData = await fetchContentFromUrl(url)
    } catch (error) {
      return NextResponse.json({
        error: 'Could not fetch content from URL. Please ensure the URL is accessible.',
        code: 'CONTENT_FETCH_FAILED'
      }, { status: 400 })
    }

    // Validate content with new validation system
    const validationResult = await validateSubmission(contentData, request.user!.id)

    if (!validationResult.isValid) {
      console.log('Content validation failed:', {
        url,
        errors: validationResult.errors,
        contentPreview: contentData.content?.substring(0, 200) + '...'
      })
      return NextResponse.json({
        error: 'Content validation failed',
        code: 'VALIDATION_FAILED',
        validationErrors: validationResult.errors,
        suggestions: validationResult.errors.map(e => e.suggestion).filter(Boolean)
      }, { status: 400 })
    }

    // Check weekly completion limits for qualifying task types
    const weeklyCheck = await canUserSubmitForTaskTypes(
      request.user!.id,
      validationResult.qualifyingTaskTypes as any[]
    )

    if (!weeklyCheck.canSubmit) {
      return NextResponse.json({
        error: 'Weekly submission limits reached for qualifying task types',
        code: 'WEEKLY_LIMIT_EXCEEDED',
        blockedTaskTypes: weeklyCheck.blockedTaskTypes,
        reasons: weeklyCheck.reasons
      }, { status: 400 })
    }

    // Check for duplicate content
    const duplicateCheck = await checkForDuplicateContent(contentData, request.user!.id)
    if (duplicateCheck.isDuplicate && duplicateCheck.duplicateType === 'EXACT') {
      return NextResponse.json({
        error: 'This content appears to be a duplicate of previously submitted content',
        code: 'DUPLICATE_CONTENT',
        similarSubmissions: duplicateCheck.similarSubmissions
      }, { status: 400 })
    }

    const weekNumber = getWeekNumber()

    // Create submission with validated task types using service client to bypass RLS
    // This is necessary because the authenticated user context isn't properly set for RLS
    const supabase = createServiceClient()
    const { data: submission, error: submissionError } = await supabase
      .from('Submission')
      .insert({
        userId: request.user!.id,
        url,
        platform,
        taskTypes: validationResult.qualifyingTaskTypes,
        aiXp: 0, // Will be updated by AI evaluation
        weekNumber,
        status: 'PENDING'
      })
      .select()
      .single()

    if (submissionError || !submission) {
      console.error('Error creating submission:', submissionError)
      return NextResponse.json({
        error: 'Failed to create submission',
        code: 'CREATION_FAILED'
      }, { status: 500 })
    }

    return NextResponse.json({
      message: 'Submission created successfully',
      submissionId: submission.id,
      status: 'PENDING',
      validationResult: {
        qualifyingTaskTypes: validationResult.qualifyingTaskTypes,
        warnings: validationResult.warnings,
        metadata: validationResult.metadata
      },
      duplicateCheck: duplicateCheck.duplicateType !== 'UNIQUE' ? {
        type: duplicateCheck.duplicateType,
        similarityScore: duplicateCheck.similarityScore
      } : undefined
    })

  } catch (error) {
    console.error('Error creating submission:', error)
    return NextResponse.json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    }, { status: 500 })
  }
})

export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    const userOnly = searchParams.get('userOnly') === 'true'

    let submissions

    if (userOnly || request.user!.role === 'USER') {
      // Users can only see their own submissions
      submissions = await submissionService.findManyByUser(request.user!.id, limit)
    } else {
      // Reviewers and admins can see all submissions
      submissions = await submissionService.findManyWithUser(limit)
    }

    return NextResponse.json({
      submissions,
      userRole: request.user!.role
    })

  } catch (error) {
    console.error('Error fetching submissions:', error)
    return NextResponse.json({
      error: 'Internal server error',
      code: 'FETCH_ERROR'
    }, { status: 500 })
  }
})

