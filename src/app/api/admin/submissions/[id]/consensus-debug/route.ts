import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'
import { withErrorHandling, createSuccessResponse } from '@/lib/api-middleware'

export const POST = withPermission('review_content')(
  withErrorHandling(async (request: AuthenticatedRequest, context: { params: Promise<{ id: string }> }) => {
    const { id: submissionId } = await context.params

    try {
      // Get detailed information about the submission using Prisma
      const submissionInfo = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: {
          peerReviews: {
            select: {
              id: true,
              reviewerId: true,
              xpScore: true,
              createdAt: true,
              comments: true
            }
          },
          reviewAssignments: {
            select: {
              id: true,
              reviewerId: true,
              status: true,
              assignedAt: true,
              deadline: true,
              completedAt: true
            }
          }
        }
      })

      if (!submissionInfo) {
        return NextResponse.json({
          success: false,
          error: {
            error: 'Submission not found',
            code: 'NOT_FOUND',
            details: 'The specified submission does not exist'
          }
        }, { status: 404 })
      }

      // Analyze the submission state
      const peerReviews = submissionInfo.peerReviews || []
      const reviewAssignments = submissionInfo.reviewAssignments || []
      
      // Filter active (non-reassigned) assignments
      const activeAssignments = reviewAssignments.filter(a => a.status !== 'REASSIGNED')
      const pendingAssignments = reviewAssignments.filter(a => 
        a.status === 'PENDING' || a.status === 'IN_PROGRESS'
      )

      // Check consensus trigger conditions
      const hasNoPendingAssignments = pendingAssignments.length === 0
      const activeAssignmentCount = activeAssignments.length
      const peerReviewCount = peerReviews.length
      const shouldAttemptConsensus = hasNoPendingAssignments && 
                                   peerReviewCount > 0 && 
                                   peerReviewCount >= activeAssignmentCount

      // Prepare debug information
      const debugInfo = {
        submission: {
          id: submissionInfo.id,
          status: submissionInfo.status,
          userId: submissionInfo.userId,
          weekNumber: submissionInfo.weekNumber,
          reviewCount: submissionInfo.reviewCount
        },
        assignments: {
          total: reviewAssignments.length,
          active: activeAssignmentCount,
          pending: pendingAssignments.length,
          reassigned: reviewAssignments.filter(a => a.status === 'REASSIGNED').length,
          completed: reviewAssignments.filter(a => a.status === 'COMPLETED').length,
          details: reviewAssignments.map(a => ({
            id: a.id,
            reviewerId: a.reviewerId,
            status: a.status,
            assignedAt: a.assignedAt,
            deadline: a.deadline,
            completedAt: a.completedAt
          }))
        },
        reviews: {
          count: peerReviewCount,
          details: peerReviews.map(r => ({
            id: r.id,
            reviewerId: r.reviewerId,
            xpScore: r.xpScore,
            createdAt: r.createdAt,
            hasComments: (r.comments || '').length > 0
          }))
        },
        consensusAnalysis: {
          hasNoPendingAssignments,
          hasReviews: peerReviewCount > 0,
          reviewsMeetThreshold: peerReviewCount >= activeAssignmentCount,
          shouldAttemptConsensus,
          conditions: {
            noPending: hasNoPendingAssignments,
            hasReviews: peerReviewCount > 0,
            enoughReviews: peerReviewCount >= activeAssignmentCount
          }
        }
      }

      let consensusResult = null
      let consensusError = null

      // Attempt consensus calculation if conditions are met
      if (shouldAttemptConsensus) {
        try {
          const { consensusCalculatorService } = await import('@/lib/consensus-calculator')
          consensusResult = await consensusCalculatorService.calculateConsensus(submissionId)
          
          // console.log(`🎯 MANUAL CONSENSUS TRIGGERED for submission ${submissionId}: ${consensusResult!.finalXp} XP`)
        } catch (error: any) {
          consensusError = error.message
          // console.error(`❌ MANUAL CONSENSUS FAILED for submission ${submissionId}:`, error.message)
        }
      } else {
        // console.log(`📝 MANUAL CONSENSUS SKIPPED for submission ${submissionId}: conditions not met`)
      }

      return createSuccessResponse({
        message: shouldAttemptConsensus 
          ? (consensusResult ? 'Consensus calculated successfully' : 'Consensus calculation failed')
          : 'Consensus conditions not met',
        submissionId,
        debugInfo,
        consensus: consensusResult ? {
          calculated: true,
          finalXp: consensusResult.finalXp,
          consensusScore: consensusResult.consensusScore,
          confidence: consensusResult.confidence,
          reviewCount: consensusResult.reviewCount
        } : {
          calculated: false,
          reason: consensusError || 'Conditions not met',
          shouldAttemptConsensus
        }
      })

    } catch (error) {
      console.error(`❌ Debug consensus failed for submission ${submissionId}:`, error)
      return NextResponse.json({
        success: false,
        error: {
          error: 'Failed to debug consensus',
          code: 'INTERNAL_ERROR',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      }, { status: 500 })
    }
  })
)
