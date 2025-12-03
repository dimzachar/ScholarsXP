import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma, patchPeerReviewV2Columns } from '@/lib/prisma'
import { getWeekNumber } from '@/lib/utils'
import { propagateXpChanges, validateXpModification } from '@/lib/services/xp-propagation'

export const GET = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const url = new URL(request.url)
    const submissionId = url.pathname.split('/').slice(-1)[0] // Extract ID from path
    const aiEvaluationGloballyEnabled = (process.env.ENABLE_AI_EVALUATION ?? 'true').toLowerCase() === 'true'

    // Ensure DB has v2 PeerReview audit columns in dev/local
    await patchPeerReviewV2Columns()

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
        aiEvaluation: true,
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
      // Use raw query to get legacy submission with XP fields.
      // Try as UUID first, then fallback to text compare to be robust across schemas.
      let legacySubmissionResult: any[] = []
      try {
        legacySubmissionResult = await prisma.$queryRaw`
          SELECT id, url, "discordHandle", "submittedAt", role, notes, "importedAt",
                 "aiXp", "peerXp", "finalXp"
          FROM "LegacySubmission"
          WHERE id = ${submissionId}::uuid
          LIMIT 1
        ` as any[]
      } catch (_) {
        // ignore cast error, fallback below
      }

      if (!legacySubmissionResult || legacySubmissionResult.length === 0) {
        try {
          legacySubmissionResult = await prisma.$queryRaw`
            SELECT id, url, "discordHandle", "submittedAt", role, notes, "importedAt",
                   "aiXp", "peerXp", "finalXp"
            FROM "LegacySubmission"
            WHERE id::text = ${submissionId}
            LIMIT 1
          ` as any[]
        } catch (_) { }
      }

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
          weekNumber: getWeekNumber(new Date(legacySubmission.submittedAt || legacySubmission.importedAt || Date.now())),
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

    const attachAiSettings = (submissionData: any) => {
      if (!submissionData) return submissionData
      const hasEvaluation = Boolean(
        submissionData.aiEvaluation && submissionData.aiEvaluation.status === 'COMPLETED'
      )
      return {
        ...submissionData,
        aiEvaluationSettings: {
          globallyEnabled: aiEvaluationGloballyEnabled,
          hasEvaluation
        }
      }
    }

    submission = attachAiSettings(submission)

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
        assigned: submission.reviewAssignments?.filter((a: any) => a.status !== 'REASSIGNED')?.length || 0,
        completed: submission.peerReviews?.length || 0,
        pending: (submission.reviewAssignments?.filter((a: any) => a.status !== 'REASSIGNED')?.length || 0) - (submission.peerReviews?.length || 0),
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
      case 'updateStatus': {
        // Normalize status names from UI into DB enum values
        const statusMap: Record<string, string> = {
          COMPLETED: 'FINALIZED',
          COMPLETE: 'FINALIZED',
          DONE: 'FINALIZED',
          PEER_REVIEW: 'UNDER_PEER_REVIEW',
          'PEER-REVIEW': 'UNDER_PEER_REVIEW',
        }
        const requested = String(data.status || '').toUpperCase()
        const normalized = statusMap[requested] || requested
        const allowed = new Set([
          'PROCESSING',
          'PENDING',
          'AI_REVIEWED',
          'UNDER_PEER_REVIEW',
          'FINALIZED',
          'FLAGGED',
          'REJECTED',
        ])
        if (!allowed.has(normalized)) {
          return NextResponse.json(
            { message: `Unsupported status: ${requested}` },
            { status: 400 }
          )
        }

        result = await prisma.submission.update({
          where: { id: submissionId },
          data: {
            status: normalized,
            updatedAt: new Date()
          }
        })

        // Create admin action audit
        await prisma.adminAction.create({
          data: {
            adminId: request.user.id,
            action: 'SYSTEM_CONFIG',
            targetType: 'submission',
            targetId: submissionId,
            details: {
              subAction: 'STATUS_CHANGE',
              newStatus: normalized,
              reason: data.reason
            }
          }
        })
        break
      }

      case 'updateXp':
        // First try to find in regular submissions
        const submission = await prisma.submission.findUnique({
          where: { id: submissionId },
          include: { user: true }
        })

        // If not found, check if it's a legacy submission
        if (!submission) {
          // Use raw query to get legacy submission with XP fields
          // Try as UUID first, fallback to text compare
          let legacySubmissionResult: any[] = []
          try {
            legacySubmissionResult = await prisma.$queryRaw`
              SELECT id, url, "discordHandle", "submittedAt", role, notes, "importedAt",
                     "aiXp", "peerXp", "finalXp"
              FROM "LegacySubmission"
              WHERE id = ${submissionId}::uuid
              LIMIT 1
            ` as any[]
          } catch (_) { }
          if (!legacySubmissionResult || legacySubmissionResult.length === 0) {
            try {
              legacySubmissionResult = await prisma.$queryRaw`
                SELECT id, url, "discordHandle", "submittedAt", role, notes, "importedAt",
                       "aiXp", "peerXp", "finalXp"
                FROM "LegacySubmission"
                WHERE id::text = ${submissionId}
                LIMIT 1
              ` as any[]
            } catch (_) { }
          }

          const legacySubmission = legacySubmissionResult[0] || null

          if (legacySubmission) {
            const handle = legacySubmission.discordHandle?.trim() || ''
            const orConditions: any[] = []

            if (handle) {
              orConditions.push({ discordHandle: { equals: handle, mode: 'insensitive' as const } })
              if (!handle.includes('#')) {
                orConditions.push({ discordHandle: { equals: `${handle}#0`, mode: 'insensitive' as const } })
              }
              orConditions.push({ username: { equals: handle, mode: 'insensitive' as const } })
            }

            const actualUser = await prisma.user.findFirst({
              where: {
                ...(orConditions.length > 0 ? { OR: orConditions } : {}),
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

              // Invalidate user profile cache after XP update
              const { CacheInvalidation } = await import('@/lib/cache/invalidation')
              const { multiLayerCache } = await import('@/lib/cache/enhanced-cache')
              const cacheInvalidation = new CacheInvalidation(multiLayerCache)
              await cacheInvalidation.invalidateOnUserAction('xp_awarded', actualUser.id)
            }

            // Create XP transaction record
            await prisma.xpTransaction.create({
              data: {
                userId: actualUser.id,
                amount: xpDifference,
                type: 'ADMIN_ADJUSTMENT',
                description: `Legacy XP adjustment: ${reason} (Admin: ${request.user.id})`,
                sourceId: submissionId,
                weekNumber: getWeekNumber(new Date())
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
          const detail = propagationResult.errors && propagationResult.errors.length > 0
            ? `: ${String(propagationResult.errors[0])}`
            : ''
          return NextResponse.json(
            {
              message: `Failed to update XP${detail}`,
              errors: propagationResult.errors
            },
            { status: 500 }
          )
        }

        // Update the specific XP field on the submission
        // Update XP field and mark as FINALIZED if final XP updated
        await prisma.submission.update({
          where: { id: submissionId },
          data: {
            [fieldToUpdate]: newXp,
            ...(fieldToUpdate === 'finalXp' ? { status: 'FINALIZED' } : {})
          }
        })

        // If finalizing, generate AI summary in background
        if (fieldToUpdate === 'finalXp') {
          // We don't await this to keep the response fast
          (async () => {
            try {
              // Check if summary already exists
              const sub = await prisma.submission.findUnique({
                where: { id: submissionId },
                select: { title: true, aiSummary: true }
              })

              if (sub && !sub.aiSummary) {
                const reviews = await prisma.peerReview.findMany({
                  where: { submissionId },
                  select: { comments: true, xpScore: true, qualityRating: true }
                })

                // Import dynamically to avoid circular dependencies if any
                const { generateReviewSummary } = await import('@/lib/ai-summary')
                const summary = await generateReviewSummary(sub.title || 'Untitled Submission', reviews)

                if (!summary.startsWith('Failed to generate') && !summary.startsWith('No detailed feedback')) {
                  await prisma.submission.update({
                    where: { id: submissionId },
                    data: {
                      aiSummary: summary,
                      summaryGeneratedAt: new Date()
                    }
                  })
                }
              }
            } catch (err) {
              console.error('Background summary generation failed:', err)
            }
          })()
        }

        result = {
          message: propagationResult.message,
          xpDifference: newXp - oldXp,
          updatedEntities: propagationResult.updatedEntities
        }
        // Invalidate cached admin submissions lists so UI refreshes
        try {
          const { QueryCache } = await import('@/lib/cache/query-cache')
          await Promise.all([
            QueryCache.invalidatePattern('admin_submissions:*'),
            QueryCache.invalidatePattern('admin_submission_count:*'),
            QueryCache.invalidatePattern('admin_submission_stats:*')
          ])
        } catch (e) {
          console.warn('Cache invalidation failed (admin_submissions):', e)
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

          try {
            const activeAssignments = await prisma.reviewAssignment.count({
              where: {
                submissionId,
                NOT: {
                  status: 'REASSIGNED'
                }
              }
            })

            await prisma.submission.update({
              where: { id: submissionId },
              data: { reviewCount: activeAssignments }
            })
          } catch (countError) {
            console.warn('Failed to refresh review count after reassignment:', countError)
          }
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
