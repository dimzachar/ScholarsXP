import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'
import { AuditReviewer, ReviewHistoryItem, InverseSignalAuditData } from '@/app/admin/reliability-simulator/lib/types'
import { ReviewerMetrics, RawReviewerData } from '@/lib/reliability/types'
import { calculateReviewerMetrics } from '@/lib/reliability/metrics-calculator'
import { detectPatterns, inferRootCause } from '@/app/admin/reliability-simulator/lib/audit'
import { identifyBad, identifyGood, classifyReviewers, getBadReviewerReason } from '@/app/admin/reliability-simulator/lib/formulas'
import { REVIEWER_ROLES } from '@/lib/roles'

export const GET = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
    try {
        // 1. Fetch all reviewers with their metrics (reusing logic from main route)
        const reviewers = await prisma.user.findMany({
            where: { role: { in: REVIEWER_ROLES } },
            select: {
                id: true,
                username: true,
                email: true,
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
                            select: { id: true, title: true, finalXp: true }
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

        const metrics = reviewers.map(r => calculateReviewerMetrics(r as unknown as RawReviewerData))

        // 2. Identify Bad and Good reviewers using SAME logic as formulas.ts
        const { good, bad } = classifyReviewers(metrics)
        const goodReviewers = good.map(g => g.reviewer)
        const badReviewers = bad.map(b => b.reviewer)

        // 3. Calculate accuracy averages
        const badAvgAccuracy = badReviewers.length > 0
            ? badReviewers.reduce((a, b) => a + b.accuracy, 0) / badReviewers.length
            : 0
        const goodAvgAccuracy = goodReviewers.length > 0
            ? goodReviewers.reduce((a, b) => a + b.accuracy, 0) / goodReviewers.length
            : 0

        const isInverse = badAvgAccuracy > goodAvgAccuracy + 0.05

        // 4. Format reviewers for audit (including history)
        const formatReviewer = (r: any): AuditReviewer => {
            const reviewerMetrics = metrics.find(m => m.id === r.id)!
            const history: ReviewHistoryItem[] = r.peerReviews.slice(0, 10).map((pr: any) => ({
                submissionId: pr.submission?.id || 'unknown',
                submissionTitle: pr.submission?.title || 'Unknown Submission',
                reviewerXpScore: pr.xpScore,
                finalConsensus: pr.submission?.finalXp || 0,
                deviation: pr.submission?.finalXp != null ? Math.abs(pr.xpScore - pr.submission.finalXp) : null,
                wasLate: pr.isLate,
                daysLate: pr.isLate ? 1 : 0, // Simplified
                reviewDate: pr.createdAt
            }))

            return {
                id: r.id,
                username: r.username || r.email?.split('@')[0] || 'Unknown',
                email: r.email || '',
                timeliness: reviewerMetrics.timeliness,
                accuracy: reviewerMetrics.accuracy,
                penaltyScore: reviewerMetrics.penaltyScore,
                reviewVariance: reviewerMetrics.reviewVariance,
                missedReviews: reviewerMetrics.missedReviews,
                totalReviews: reviewerMetrics.totalReviews,
                missedPenalty: reviewerMetrics.missedPenalty,   // Added
                experience: reviewerMetrics.experience,         // Added
                reviewHistory: history,
                avgDeviation: reviewerMetrics.avgDeviation,
                deviationTrend: 'STABLE', // Simplified
                latenessTrend: 'STABLE',   // Simplified
                reason: getBadReviewerReason(reviewerMetrics) || undefined
            }
        }

        // All Bad Reviewers
        const allBad = reviewers
            .filter(r => {
                const m = metrics.find(met => met.id === r.id)!
                return identifyBad(m).isBad
            })
            .map(formatReviewer)

        // All Good Reviewers
        const allGood = reviewers
            .filter(r => {
                const m = metrics.find(met => met.id === r.id)!
                return identifyGood(m).isGood
            })
            .map(formatReviewer)

        // Middle Tier
        const middleTier = reviewers
            .filter(r => {
                const m = metrics.find(met => met.id === r.id)!
                const { isGood } = identifyGood(m)
                const { isBad } = identifyBad(m)
                return !isGood && !isBad
            })
            .map(formatReviewer)

        // 5. Run pattern detection (still using anomalies for logic)
        const badButAccurate = allBad.filter(r => r.accuracy > goodAvgAccuracy)
        const goodButInaccurate = allGood.filter(r => r.accuracy < badAvgAccuracy)
        const patterns = detectPatterns(badButAccurate, goodButInaccurate)
        const suggestedRootCause = inferRootCause(patterns, badButAccurate, goodButInaccurate)

        const auditData: InverseSignalAuditData = {
            isInverseSignalDetected: isInverse,
            badReviewerAvgAccuracy: badAvgAccuracy,
            goodReviewerAvgAccuracy: goodAvgAccuracy,
            signalDelta: badAvgAccuracy - goodAvgAccuracy,
            allBad,
            allGood,
            middleTier,
            patterns,
            suggestedRootCause,
            status: isInverse ? 'FAILED' : 'PASSED'
        }

        return NextResponse.json(auditData)
    } catch (error: any) {
        console.error('[Inverse Signal Audit] API error:', error)
        return NextResponse.json(
            { error: 'Failed to run audit', details: error.message },
            { status: 500 }
        )
    }
})

