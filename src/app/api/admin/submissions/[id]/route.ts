import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'

export const GET = withPermission('admin_access')(async (
  request: AuthenticatedRequest,
  { params }: { params: { id: string } }
) => {
  try {
    const submissionId = params.id

    // Get comprehensive submission data
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            totalXp: true,
            currentWeekXp: true,
            streakWeeks: true,
            createdAt: true,
            lastActiveAt: true
          }
        },
        peerReviews: {
          include: {
            reviewer: {
              select: {
                id: true,
                username: true,
                email: true,
                role: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        },
        reviewAssignments: {
          include: {
            reviewer: {
              select: {
                id: true,
                username: true,
                email: true,
                role: true
              }
            }
          },
          orderBy: {
            assignedAt: 'desc'
          }
        },
        contentFlags: {
          include: {
            flaggedBy: {
              select: {
                id: true,
                username: true,
                email: true
              }
            },
            resolvedBy: {
              select: {
                id: true,
                username: true,
                email: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        },
        xpTransactions: {
          where: {
            sourceId: submissionId
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    })

    if (!submission) {
      return NextResponse.json(
        { message: 'Submission not found' },
        { status: 404 }
      )
    }

    // Get admin actions related to this submission
    const adminActions = await prisma.adminAction.findMany({
      where: {
        targetType: 'submission',
        targetId: submissionId
      },
      include: {
        admin: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // Calculate metrics
    const metrics = {
      avgPeerScore: submission.peerReviews.length > 0
        ? submission.peerReviews.reduce((sum, review) => sum + (review.xpScore || 0), 0) / submission.peerReviews.length
        : null,
      consensusScore: submission.consensusScore,
      reviewProgress: {
        assigned: submission.reviewAssignments.length,
        completed: submission.peerReviews.length,
        pending: submission.reviewAssignments.length - submission.peerReviews.length,
        overdue: submission.reviewAssignments.filter(
          assignment => assignment.deadline < new Date() && assignment.status === 'PENDING'
        ).length
      },
      flagCount: submission.contentFlags.length,
      activeFlagCount: submission.contentFlags.filter(flag => flag.status === 'PENDING').length,
      totalXpAwarded: submission.xpTransactions.reduce((sum, tx) => sum + tx.amount, 0)
    }

    // Create timeline of events
    const timeline = [
      {
        type: 'submission_created',
        timestamp: submission.createdAt,
        description: 'Submission created',
        actor: submission.user.username
      },
      ...submission.reviewAssignments.map(assignment => ({
        type: 'review_assigned',
        timestamp: assignment.assignedAt,
        description: `Review assigned to ${assignment.reviewer.username}`,
        actor: 'System',
        data: assignment
      })),
      ...submission.peerReviews.map(review => ({
        type: 'review_completed',
        timestamp: review.createdAt,
        description: `Review completed by ${review.reviewer.username}`,
        actor: review.reviewer.username,
        data: review
      })),
      ...submission.contentFlags.map(flag => ({
        type: 'content_flagged',
        timestamp: flag.createdAt,
        description: `Content flagged for ${flag.reason}`,
        actor: flag.flaggedBy.username,
        data: flag
      })),
      ...submission.xpTransactions.map(tx => ({
        type: 'xp_transaction',
        timestamp: tx.createdAt,
        description: tx.description,
        actor: 'System',
        data: tx
      })),
      ...adminActions.map(action => ({
        type: 'admin_action',
        timestamp: action.createdAt,
        description: `Admin action: ${action.action}`,
        actor: action.admin.username,
        data: action
      }))
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return NextResponse.json({
      submission,
      metrics,
      timeline,
      adminActions
    })

  } catch (error) {
    console.error('Error fetching submission details:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})

export const PATCH = withPermission('admin_access')(async (
  request: AuthenticatedRequest,
  { params }: { params: { id: string } }
) => {
  try {
    const submissionId = params.id
    const { action, data } = await request.json()

    let result

    switch (action) {
      case 'updateStatus':
        result = await prisma.submission.update({
          where: { id: submissionId },
          data: { 
            status: data.status,
            updatedAt: new Date()
          }
        })

        // Create admin action audit
        await prisma.adminAction.create({
          data: {
            adminId: request.user.id,
            action: 'STATUS_CHANGE',
            targetType: 'submission',
            targetId: submissionId,
            details: {
              newStatus: data.status,
              reason: data.reason
            }
          }
        })
        break

      case 'updateXp':
        const submission = await prisma.submission.findUnique({
          where: { id: submissionId },
          include: { user: true }
        })

        if (!submission) {
          return NextResponse.json(
            { message: 'Submission not found' },
            { status: 404 }
          )
        }

        const xpDifference = data.xpAwarded - (submission.xpAwarded || 0)

        await prisma.$transaction([
          // Update submission XP
          prisma.submission.update({
            where: { id: submissionId },
            data: { xpAwarded: data.xpAwarded }
          }),
          // Update user total XP
          prisma.user.update({
            where: { id: submission.userId },
            data: { totalXp: { increment: xpDifference } }
          }),
          // Create XP transaction record
          prisma.xpTransaction.create({
            data: {
              userId: submission.userId,
              amount: xpDifference,
              type: 'ADMIN_ADJUSTMENT',
              sourceId: submissionId,
              description: `Admin XP adjustment: ${data.reason || 'Manual adjustment'}`,
              weekNumber: Math.ceil(new Date().getDate() / 7)
            }
          }),
          // Create admin action audit
          prisma.adminAction.create({
            data: {
              adminId: request.user.id,
              action: 'XP_OVERRIDE',
              targetType: 'submission',
              targetId: submissionId,
              details: {
                oldXp: submission.xpAwarded,
                newXp: data.xpAwarded,
                reason: data.reason
              }
            }
          })
        ])

        result = { message: 'XP updated successfully' }
        break

      case 'reassignReview':
        // Find pending assignment
        const assignment = await prisma.reviewAssignment.findFirst({
          where: {
            submissionId,
            reviewerId: data.oldReviewerId,
            status: 'PENDING'
          }
        })

        if (assignment) {
          await prisma.$transaction([
            // Update old assignment
            prisma.reviewAssignment.update({
              where: { id: assignment.id },
              data: { status: 'REASSIGNED' }
            }),
            // Create new assignment
            prisma.reviewAssignment.create({
              data: {
                submissionId,
                reviewerId: data.newReviewerId,
                deadline: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours from now
                status: 'PENDING'
              }
            }),
            // Create admin action audit
            prisma.adminAction.create({
              data: {
                adminId: request.user.id,
                action: 'REVIEW_REASSIGN',
                targetType: 'submission',
                targetId: submissionId,
                details: {
                  oldReviewerId: data.oldReviewerId,
                  newReviewerId: data.newReviewerId,
                  reason: data.reason
                }
              }
            })
          ])
        }

        result = { message: 'Review reassigned successfully' }
        break

      default:
        return NextResponse.json(
          { message: 'Invalid action' },
          { status: 400 }
        )
    }

    return NextResponse.json(result)

  } catch (error) {
    console.error('Error updating submission:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})
