import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { evaluateContent, fetchContentFromUrl } from '@/lib/ai-evaluator'
import { withErrorHandling, createSuccessResponse, validateRequiredFields } from '@/lib/api-middleware'
import { ValidationError, NotFoundError, BusinessLogicError } from '@/lib/api-error-handler'

export const POST = withErrorHandling(async (request: NextRequest) => {
  const { submissionId } = await request.json()

  validateRequiredFields({ submissionId }, ['submissionId'])

  // Find the submission
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId }
  })

  if (!submission) {
    throw new NotFoundError('Submission')
  }

  if (submission.status !== 'PENDING') {
    throw new BusinessLogicError('Submission already processed', {
      currentStatus: submission.status,
      expectedStatus: 'PENDING'
    })
  }

  // Skip AI evaluation for Twitter content - it should use peer review only
  if (submission.platform === 'Twitter') {
    throw new BusinessLogicError(
      'Twitter content uses peer review only - AI evaluation is disabled for this platform',
      { platform: submission.platform }
    )
  }

  try {
    // Fetch content from URL
    const contentData = await fetchContentFromUrl(submission.url)

    // Validate ScholarXP hashtag
    if (!contentData.content.includes('#ScholarXP')) {
      await prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: 'REJECTED',
          aiXp: 0
        }
      })

      return createSuccessResponse({
        message: 'Content rejected: Missing #ScholarXP hashtag',
        status: 'REJECTED'
      })
    }

    // Evaluate content with AI
    const analysis = await evaluateContent(contentData)

    // Update submission with AI evaluation
    const updatedSubmission = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        taskTypes: analysis.taskTypes,
        aiXp: analysis.baseXp,
        originalityScore: analysis.originalityScore,
        status: 'AI_REVIEWED'
      }
    })

    // TODO: Queue peer review assignment
    console.log(`Queuing peer review for submission ${submissionId}`)

    return createSuccessResponse({
      message: 'Content evaluated successfully',
      submission: updatedSubmission,
      analysis: {
        reasoning: analysis.reasoning,
        taskTypes: analysis.taskTypes,
        baseXp: analysis.baseXp,
        originalityScore: analysis.originalityScore
      }
    })

  } catch (evaluationError) {
    console.error('Error during evaluation:', evaluationError)

    // Mark submission as flagged for manual review
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        status: 'FLAGGED'
      }
    })

    return createSuccessResponse({
      message: 'Content flagged for manual review due to evaluation error',
      status: 'FLAGGED'
    })
  }
})

