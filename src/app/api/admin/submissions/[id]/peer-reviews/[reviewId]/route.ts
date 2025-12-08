import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'

export const PATCH = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const url = new URL(request.url)
    const pathParts = url.pathname.split('/')
    const submissionId = pathParts[pathParts.length - 3] // Extract submission ID from path
    const reviewId = pathParts[pathParts.length - 1] // Extract review ID from path
    const { xpScore, comments, qualityRating, contentCategory, qualityTier, reason } = await request.json()

    // Validate input
    if (typeof xpScore !== 'number' || xpScore < 0 || xpScore > 100) {
      return NextResponse.json(
        { message: 'XP score must be between 0 and 100' },
        { status: 400 }
      )
    }

    if (qualityRating !== null && qualityRating !== undefined && 
        (typeof qualityRating !== 'number' || qualityRating < 1 || qualityRating > 5)) {
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
          contentCategory: contentCategory || null,
          qualityTier: qualityTier || null,
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
              qualityRating: existingReview.qualityRating !== qualityRating,
              contentCategory: existingReview.contentCategory !== contentCategory,
              qualityTier: existingReview.qualityTier !== qualityTier
            }
          }
        }
      })

      return review
    })

    // If the score changed, recalculate submission peer XP
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

        console.log(`📊 Recalculated peer XP for submission ${submissionId}: ${averagePeerScore}`)
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
