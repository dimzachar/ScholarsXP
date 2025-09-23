import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma, patchPeerReviewV2Columns } from '@/lib/prisma'

export const GET = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const url = new URL(request.url)
    const submissionId = url.pathname.split('/').slice(-2)[0] // Extract ID from path

    // Ensure DB has v2 columns (dev/local convenience)
    await patchPeerReviewV2Columns()

    // Verify submission exists
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true }
    })

    if (!submission) {
      return NextResponse.json(
        { message: 'Submission not found' },
        { status: 404 }
      )
    }

    // Get all peer reviews for this submission
    const peerReviews = await prisma.peerReview.findMany({
      where: { submissionId },
      include: {
        reviewer: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({
      peerReviews,
      count: peerReviews.length
    })

  } catch (error) {
    console.error('Error fetching peer reviews:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})

export const PATCH = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const url = new URL(request.url)
    const submissionId = url.pathname.split('/').slice(-2)[0] // Extract ID from path
    await patchPeerReviewV2Columns()
    const { reviewId, xpScore, comments, qualityRating, reason } = await request.json()

    if (!reviewId) {
      return NextResponse.json(
        { message: 'Review ID is required' },
        { status: 400 }
      )
    }

    // Validate input (v2 allows higher discrete values; relax upper bound)
    if (typeof xpScore !== 'number' || xpScore < 0 || xpScore > 300) {
      return NextResponse.json(
        { message: 'XP score must be between 0 and 300' },
        { status: 400 }
      )
    }

    if (qualityRating !== null && (typeof qualityRating !== 'number' || qualityRating < 1 || qualityRating > 5)) {
      return NextResponse.json(
        { message: 'Quality rating must be between 1 and 5' },
        { status: 400 }
      )
    }

    if (!reason || reason.trim().length < 5) {
      return NextResponse.json(
        { message: 'Reason must be at least 5 characters long' },
        { status: 400 }
      )
    }

    // Verify the peer review exists and belongs to this submission
    const existingReview = await prisma.peerReview.findFirst({
      where: {
        id: reviewId,
        submissionId
      },
      include: {
        reviewer: {
          select: { username: true }
        }
      }
    })

    if (!existingReview) {
      return NextResponse.json(
        { message: 'Peer review not found' },
        { status: 404 }
      )
    }

    const oldScore = existingReview.xpScore

    // Update the peer review
    const updatedReview = await prisma.$transaction(async (tx) => {
      // Update the peer review
      const review = await tx.peerReview.update({
        where: { id: reviewId },
        data: {
          xpScore,
          comments: comments || null,
          qualityRating: qualityRating || null,
          updatedAt: new Date()
        },
        include: {
          reviewer: {
            select: {
              id: true,
              username: true,
              email: true
            }
          }
        }
      })

      // Create admin action audit
      await tx.adminAction.create({
        data: {
          adminId: request.user.id,
          action: 'XP_OVERRIDE',
          targetType: 'peer_review',
          targetId: reviewId,
          details: {
            submissionId,
            reviewerId: existingReview.reviewerId,
            oldScore,
            newScore: xpScore,
            scoreDifference: xpScore - oldScore,
            reason,
            modifiedFields: {
              xpScore: oldScore !== xpScore,
              comments: (existingReview.comments || '') !== (comments || ''),
              qualityRating: existingReview.qualityRating !== qualityRating
            }
          }
        }
      })

      return review
    })

    // If the score changed, we might need to recalculate submission XP
    if (oldScore !== xpScore) {
      // Get all peer reviews for this submission to recalculate peer XP
      const allReviews = await prisma.peerReview.findMany({
        where: { submissionId },
        select: { xpScore: true }
      })

      if (allReviews.length > 0) {
        const averagePeerScore = Math.round(
          allReviews.reduce((sum, review) => sum + review.xpScore, 0) / allReviews.length
        )

        // Update submission peer XP
        await prisma.submission.update({
          where: { id: submissionId },
          data: { peerXp: averagePeerScore }
        })
      }
    }

    return NextResponse.json({
      message: 'Peer review updated successfully',
      review: updatedReview,
      scoreDifference: xpScore - oldScore
    })

  } catch (error) {
    console.error('Error updating peer review:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})
