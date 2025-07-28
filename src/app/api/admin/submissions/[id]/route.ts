import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'
import { propagateXpChanges, validateXpModification } from '@/lib/services/xp-propagation'

export const GET = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const url = new URL(request.url)
    const submissionId = url.pathname.split('/').slice(-1)[0] // Extract ID from path

    // Try to get from regular submissions first
    let submission = await prisma.submission.findUnique({
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
            flagger: {
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

    // If not found in regular submissions, try legacy submissions
    if (!submission) {
      // Use raw query to get legacy submission with XP fields
      const legacySubmissionResult = await prisma.$queryRaw`
        SELECT id, url, "discordHandle", "submittedAt", role, notes, "importedAt",
               "aiXp", "peerXp", "finalXp"
        FROM "LegacySubmission"
        WHERE id = ${submissionId}::uuid
      ` as any[]

      const legacySubmission = legacySubmissionResult[0] || null

      if (legacySubmission) {
        // Find the actual user associated with this legacy submission (prefer real Discord accounts)
        const actualUser = await prisma.user.findFirst({
          where: {
            OR: [
              { discordHandle: legacySubmission.discordHandle },
              { discordHandle: legacySubmission.discordHandle + '#0' },
              { username: legacySubmission.discordHandle }
            ],
            NOT: {
              email: { endsWith: '@legacy.import' }
            }
          }
        })

        // Convert legacy submission to submission format
        submission = {
          id: legacySubmission.id,
          title: 'Legacy Submission',
          url: legacySubmission.url,
          platform: 'LEGACY',
          taskTypes: ['LEGACY'],
          status: 'LEGACY_IMPORTED',
          aiXp: legacySubmission.aiXp || 0,
          peerXp: legacySubmission.peerXp,
          finalXp: legacySubmission.finalXp,
          originalityScore: null,
          consensusScore: null,
          reviewCount: 0,
          flagCount: 0,
          createdAt: legacySubmission.submittedAt || legacySubmission.importedAt,
          updatedAt: legacySubmission.importedAt,
          weekNumber: 1,
          reviewDeadline: null,
          user: actualUser ? {
            id: actualUser.id,
            username: actualUser.username || legacySubmission.discordHandle || 'Legacy User',
            email: actualUser.email,
            role: actualUser.role,
            totalXp: actualUser.totalXp,
            currentWeekXp: actualUser.currentWeekXp,
            streakWeeks: actualUser.streakWeeks,
            createdAt: actualUser.joinedAt,
            lastActiveAt: legacySubmission.importedAt
          } : {
            id: 'legacy-user',
            username: legacySubmission.discordHandle || 'Legacy User',
            email: 'legacy@import.data',
            role: legacySubmission.role || 'USER',
            totalXp: 0,
            currentWeekXp: 0,
            streakWeeks: 0,
            createdAt: legacySubmission.importedAt,
            lastActiveAt: legacySubmission.importedAt
          },
          peerReviews: [],
          reviewAssignments: [],
          contentFlags: [],
          xpTransactions: [],
          aiEvaluation: null
        } as any
      }
    }

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
      avgPeerScore: submission.peerReviews && submission.peerReviews.length > 0
        ? submission.peerReviews.reduce((sum: number, review: any) => sum + (review.xpScore || 0), 0) / submission.peerReviews.length
        : null,
      consensusScore: submission.consensusScore,
      reviewProgress: {
        assigned: submission.reviewAssignments?.length || 0,
        completed: submission.peerReviews?.length || 0,
        pending: (submission.reviewAssignments?.length || 0) - (submission.peerReviews?.length || 0),
        overdue: submission.reviewAssignments?.filter(
          (assignment: any) => assignment.deadline < new Date() && assignment.status === 'PENDING'
        ).length || 0
      },
      flagCount: submission.contentFlags?.length || 0,
      activeFlagCount: submission.contentFlags?.filter((flag: any) => flag.status === 'PENDING').length || 0,
      totalXpAwarded: submission.xpTransactions?.reduce((sum: number, tx: any) => sum + tx.amount, 0) || 0
    }

    // Create timeline of events
    const timeline = [
      {
        type: 'submission_created',
        timestamp: submission.createdAt,
        description: 'Submission created',
        actor: submission.user?.username || 'Unknown'
      },
      ...(submission.reviewAssignments?.map((assignment: any) => ({
        type: 'review_assigned',
        timestamp: assignment.assignedAt,
        description: `Review assigned to ${assignment.reviewer?.username || 'Unknown'}`,
        actor: 'System',
        data: assignment
      })) || []),
      ...(submission.peerReviews?.map((review: any) => ({
        type: 'review_completed',
        timestamp: review.createdAt,
        description: `Review completed by ${review.reviewer?.username || 'Unknown'}`,
        actor: review.reviewer?.username || 'Unknown',
        data: review
      })) || []),
      ...(submission.contentFlags?.map((flag: any) => ({
        type: 'content_flagged',
        timestamp: flag.createdAt,
        description: `Content flagged for ${flag.reason}`,
        actor: flag.flagger?.username || 'Unknown',
        data: flag
      })) || []),
      ...(submission.xpTransactions?.map((tx: any) => ({
        type: 'xp_transaction',
        timestamp: tx.createdAt,
        description: tx.description,
        actor: 'System',
        data: tx
      })) || []),
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
      {
        success: false,
        error: {
          error: 'Internal server error',
          code: 'INTERNAL_ERROR',
          details: error instanceof Error ? error.message : 'Unknown error'
        }
      },
      { status: 500 }
    )
  }
})

export const PATCH = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const url = new URL(request.url)
    const submissionId = url.pathname.split('/').slice(-1)[0] // Extract ID from path
    const requestBody = await request.json()
    const { action } = requestBody

    // Handle both request formats: with and without 'data' wrapper
    const data = requestBody.data || requestBody

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
        // First try to find in regular submissions
        let submission = await prisma.submission.findUnique({
          where: { id: submissionId },
          include: { user: true }
        })

        // If not found, check if it's a legacy submission
        if (!submission) {
          // Use raw query to get legacy submission with XP fields
          const legacySubmissionResult = await prisma.$queryRaw`
            SELECT id, url, "discordHandle", "submittedAt", role, notes, "importedAt",
                   "aiXp", "peerXp", "finalXp"
            FROM "LegacySubmission"
            WHERE id = ${submissionId}::uuid
          ` as any[]

          const legacySubmission = legacySubmissionResult[0] || null

          if (legacySubmission) {
            // Find the actual user associated with this legacy submission (prefer real Discord accounts)
            const actualUser = await prisma.user.findFirst({
              where: {
                OR: [
                  { discordHandle: legacySubmission.discordHandle },
                  { discordHandle: legacySubmission.discordHandle + '#0' },
                  { username: legacySubmission.discordHandle }
                ],
                NOT: {
                  email: { endsWith: '@legacy.import' }
                }
              }
            })

            if (!actualUser) {
              return NextResponse.json(
                { message: 'User not found for legacy submission' },
                { status: 404 }
              )
            }

            // Handle legacy submission XP update
            const newXp = data.xpAwarded
            const reason = data.reason || 'Manual adjustment for legacy submission'
            const xpType = data.xpType || 'final'

            // Get current XP value
            let oldXp: number
            let fieldToUpdate: string

            switch (xpType) {
              case 'ai':
                oldXp = legacySubmission.aiXp || 0
                fieldToUpdate = 'aiXp'
                break
              case 'peer':
                oldXp = legacySubmission.peerXp || 0
                fieldToUpdate = 'peerXp'
                break
              case 'final':
              default:
                oldXp = legacySubmission.finalXp || 0
                fieldToUpdate = 'finalXp'
                break
            }

            const xpDifference = newXp - oldXp

            // Update legacy submission XP field using raw SQL
            if (fieldToUpdate === 'aiXp') {
              await prisma.$executeRaw`
                UPDATE "LegacySubmission"
                SET "aiXp" = ${newXp}
                WHERE id = ${submissionId}::uuid
              `
            } else if (fieldToUpdate === 'peerXp') {
              await prisma.$executeRaw`
                UPDATE "LegacySubmission"
                SET "peerXp" = ${newXp}
                WHERE id = ${submissionId}::uuid
              `
            } else if (fieldToUpdate === 'finalXp') {
              await prisma.$executeRaw`
                UPDATE "LegacySubmission"
                SET "finalXp" = ${newXp}
                WHERE id = ${submissionId}::uuid
              `
            }

            // Update user's total XP if this affects final XP
            if (xpType === 'final' && xpDifference !== 0) {
              await prisma.user.update({
                where: { id: actualUser.id },
                data: { totalXp: { increment: xpDifference } }
              })
            }

            // Create XP transaction record
            await prisma.xpTransaction.create({
              data: {
                userId: actualUser.id,
                amount: xpDifference,
                type: 'ADMIN_ADJUSTMENT',
                description: `Legacy XP adjustment: ${reason} (Admin: ${request.user.id})`,
                sourceId: submissionId,
                weekNumber: Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000))
              }
            })

            // Create admin action audit
            await prisma.adminAction.create({
              data: {
                adminId: request.user.id,
                action: 'XP_OVERRIDE',
                targetType: 'legacy_submission',
                targetId: submissionId,
                details: {
                  xpType: data.xpType || 'final',
                  newXp: newXp,
                  reason: reason
                }
              }
            })

            return NextResponse.json({
              message: 'Legacy submission XP updated successfully',
              xpAwarded: newXp
            })
          }

          return NextResponse.json(
            { message: 'Submission not found' },
            { status: 404 }
          )
        }

        // Determine which XP field to update based on xpType
        const xpType = data.xpType || 'final' // Default to final XP
        let oldXp: number
        let fieldToUpdate: string

        switch (xpType) {
          case 'ai':
            oldXp = submission.aiXp || 0
            fieldToUpdate = 'aiXp'
            break
          case 'peer':
            oldXp = submission.peerXp || 0
            fieldToUpdate = 'peerXp'
            break
          case 'final':
          default:
            oldXp = submission.finalXp || 0
            fieldToUpdate = 'finalXp'
            break
        }

        const newXp = data.xpAwarded
        const reason = data.reason || 'Manual adjustment'

        // Validate the XP modification
        const validation = validateXpModification(oldXp, newXp, reason)
        if (!validation.valid) {
          return NextResponse.json(
            { message: 'Validation failed', errors: validation.errors },
            { status: 400 }
          )
        }

        // Use the XP propagation service for comprehensive updates
        const propagationResult = await propagateXpChanges(
          submissionId,
          oldXp,
          newXp,
          reason,
          request.user.id
        )

        if (!propagationResult.success) {
          return NextResponse.json(
            {
              message: 'Failed to update XP',
              errors: propagationResult.errors
            },
            { status: 500 }
          )
        }

        // Update the specific XP field on the submission
        await prisma.submission.update({
          where: { id: submissionId },
          data: { [fieldToUpdate]: newXp }
        })

        result = {
          message: propagationResult.message,
          xpDifference: newXp - oldXp,
          updatedEntities: propagationResult.updatedEntities
        }
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
