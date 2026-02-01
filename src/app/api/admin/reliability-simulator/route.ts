import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'
import { calculateReviewerMetrics } from '@/lib/reliability/metrics-calculator'
import { ReviewerMetrics, RawReviewerData } from '@/lib/reliability/types'
import { REVIEWER_ROLES } from '@/lib/roles'

export const GET = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    console.log('[Reliability Simulator] Fetching reviewers...')
    const reviewers = await prisma.user.findMany({
      where: { role: { in: REVIEWER_ROLES } },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        missedReviews: true,
        streakWeeks: true,
        peerReviews: {
          select: {
            xpScore: true,
            qualityRating: true,
            isLate: true,
            judgmentStatus: true,
            createdAt: true,
            submission: {
              select: { finalXp: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        xpTransactions: {
          select: {
            amount: true,
            type: true
          }
        }
      }
    })
    console.log(`[Reliability Simulator] Found ${reviewers.length} reviewers`)

    const metrics: ReviewerMetrics[] = reviewers.map(r => {
      try {
        return calculateReviewerMetrics(r as unknown as RawReviewerData)
      } catch (err) {
        console.error(`[Reliability Simulator] Error calculating metrics for user ${r.id}:`, err)
        return null
      }
    }).filter((m): m is ReviewerMetrics => m !== null)

    console.log(`[Reliability Simulator] Calculated metrics for ${metrics.length} reviewers`)

    // Sanity check for NaN values which break JSON serialization
    const sanitizedMetrics = metrics.map(m => {
      const sanitized = { ...m }
      Object.keys(sanitized).forEach(key => {
        const val = (sanitized as any)[key]
        if (typeof val === 'number' && (isNaN(val) || !isFinite(val))) {
          console.warn(`[Reliability Simulator] Found invalid number for user ${m.username} field ${key}: ${val}`)
            ; (sanitized as any)[key] = 0 // Default to 0 to prevent crash
        }
      })
      return sanitized
    })

    return NextResponse.json({
      success: true,
      reviewers: sanitizedMetrics,
      totalCount: sanitizedMetrics.length
    })
  } catch (error: any) {
    console.error('[Reliability Simulator] API error:', error)

    // safe error serialization
    const safeError = {
      message: error?.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    }

    return NextResponse.json(
      {
        error: 'Failed to fetch reviewer data',
        details: safeError.message,
        debug: safeError
      },
      { status: 500 }
    )
  }
})
