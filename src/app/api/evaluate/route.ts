import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { evaluateContent, fetchContentFromUrl } from '@/lib/ai-evaluator'

export async function POST(request: NextRequest) {
  try {
    const { submissionId } = await request.json()

    if (!submissionId) {
      return NextResponse.json({ message: 'Submission ID is required' }, { status: 400 })
    }

    // Find the submission
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId }
    })

    if (!submission) {
      return NextResponse.json({ message: 'Submission not found' }, { status: 404 })
    }

    if (submission.status !== 'PENDING') {
      return NextResponse.json({ message: 'Submission already processed' }, { status: 400 })
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

        return NextResponse.json({
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

      return NextResponse.json({
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

      return NextResponse.json({
        message: 'Content flagged for manual review due to evaluation error',
        status: 'FLAGGED'
      })
    }

  } catch (error) {
    console.error('Error in evaluation endpoint:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
}

