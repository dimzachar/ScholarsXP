/**
 * DIAGNOSTIC ENDPOINT: Audits which reliability metrics have actual data
 * GET /api/admin/reliability-simulator/audit
 */

import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'
import { REVIEWER_ROLES } from '@/lib/roles'

interface MetricStat {
    name: string
    reviewersWithData: number
    coverage: string
    status: 'NO_DATA' | 'LOW_DATA' | 'PARTIAL' | 'GOOD_DATA'
    dataSource: string
    samples: any[]
}

export const GET = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
    try {
        const reviewers = await prisma.user.findMany({
            where: { role: { in: REVIEWER_ROLES } },
            select: {
                id: true,
                username: true,
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
                    }
                },
                xpTransactions: {
                    select: {
                        amount: true,
                        type: true
                    }
                }
            }
        })

        const totalReviewers = reviewers.length
        const metricStats: Record<string, MetricStat> = {
            timeliness: {
                name: 'Timeliness (isLate)',
                reviewersWithData: 0,
                coverage: '',
                status: 'NO_DATA',
                dataSource: 'peerReviews.isLate',
                samples: []
            },
            quality: {
                name: 'Quality (qualityRating)',
                reviewersWithData: 0,
                coverage: '',
                status: 'NO_DATA',
                dataSource: 'peerReviews.qualityRating',
                samples: []
            },
            accuracy: {
                name: 'Accuracy (xpScore vs finalXp)',
                reviewersWithData: 0,
                coverage: '',
                status: 'NO_DATA',
                dataSource: 'peerReviews.xpScore vs submission.finalXp',
                samples: []
            },
            voteValidation: {
                name: 'Vote Validation (judgmentStatus)',
                reviewersWithData: 0,
                coverage: '',
                status: 'NO_DATA',
                dataSource: 'peerReviews.judgmentStatus VALIDATED/INVALIDATED',
                samples: []
            },
            experience: {
                name: 'Experience (review count)',
                reviewersWithData: 0,
                coverage: '',
                status: 'NO_DATA',
                dataSource: 'peerReviews.length',
                samples: []
            },
            missedPenalty: {
                name: 'Missed Penalty',
                reviewersWithData: 0,
                coverage: '',
                status: 'NO_DATA',
                dataSource: 'user.missedReviews',
                samples: []
            },
            penaltyScore: {
                name: 'Penalty Score (transactions)',
                reviewersWithData: 0,
                coverage: '',
                status: 'NO_DATA',
                dataSource: 'xpTransactions where type=PENALTY',
                samples: []
            },
            reviewVariance: {
                name: 'Review Variance (std dev)',
                reviewersWithData: 0,
                coverage: '',
                status: 'NO_DATA',
                dataSource: 'std dev of peerReviews.xpScore',
                samples: []
            },
            latePercentage: {
                name: 'Late Percentage',
                reviewersWithData: 0,
                coverage: '',
                status: 'NO_DATA',
                dataSource: 'lateReviews / totalReviews',
                samples: []
            }
        }

        // Analyze each reviewer
        for (const reviewer of reviewers) {
            const reviews = reviewer.peerReviews
            const username = reviewer.username || 'Unknown'
            const totalReviews = reviews.length

            // TIMELINESS
            if (totalReviews > 0) {
                const lateCount = reviews.filter(r => r.isLate).length
                metricStats.timeliness.reviewersWithData++
                if (metricStats.timeliness.samples.length < 3) {
                    metricStats.timeliness.samples.push({
                        username,
                        normalized: (1 - (lateCount / totalReviews)).toFixed(2),
                        raw: `${lateCount} late / ${totalReviews} total`
                    })
                }
            }

            // QUALITY
            const qualityRatings = reviews.filter(r => r.qualityRating != null)
            if (qualityRatings.length > 0) {
                metricStats.quality.reviewersWithData++
                const avgRating = qualityRatings.reduce((a, b) => a + b.qualityRating!, 0) / qualityRatings.length
                if (metricStats.quality.samples.length < 3) {
                    metricStats.quality.samples.push({
                        username,
                        avgRating: avgRating.toFixed(2),
                        count: qualityRatings.length
                    })
                }
            }

            // ACCURACY
            const reviewsWithFinalXp = reviews.filter(r => r.submission?.finalXp != null)
            if (reviewsWithFinalXp.length > 0) {
                metricStats.accuracy.reviewersWithData++
                const deviations = reviewsWithFinalXp.map(r => Math.abs(r.xpScore - r.submission!.finalXp!))
                const avgDev = deviations.reduce((a, b) => a + b, 0) / deviations.length
                if (metricStats.accuracy.samples.length < 3) {
                    metricStats.accuracy.samples.push({
                        username,
                        normalized: Math.max(0, 1 - (avgDev / 50)).toFixed(2),
                        avgDeviation: avgDev.toFixed(1),
                        reviewsCompared: reviewsWithFinalXp.length
                    })
                }
            }

            // VOTE VALIDATION
            const validated = reviews.filter(r => r.judgmentStatus === 'VALIDATED').length
            const invalidated = reviews.filter(r => r.judgmentStatus === 'INVALIDATED').length
            if (validated > 0 || invalidated > 0) {
                metricStats.voteValidation.reviewersWithData++
                if (metricStats.voteValidation.samples.length < 3) {
                    metricStats.voteValidation.samples.push({
                        username,
                        validated,
                        invalidated
                    })
                }
            }

            // EXPERIENCE
            if (totalReviews > 0) {
                metricStats.experience.reviewersWithData++
                if (metricStats.experience.samples.length < 3) {
                    metricStats.experience.samples.push({
                        username,
                        totalReviews,
                        normalized: Math.min(1, totalReviews / 50).toFixed(2)
                    })
                }
            }

            // MISSED PENALTY
            if (reviewer.missedReviews > 0) {
                metricStats.missedPenalty.reviewersWithData++
                if (metricStats.missedPenalty.samples.length < 3) {
                    metricStats.missedPenalty.samples.push({
                        username,
                        missedReviews: reviewer.missedReviews,
                        normalized: Math.max(0, 1 - (reviewer.missedReviews * 0.25)).toFixed(2)
                    })
                }
            }

            // PENALTY SCORE
            const penaltyTx = reviewer.xpTransactions.filter(t => t.type === 'PENALTY')
            if (penaltyTx.length > 0) {
                metricStats.penaltyScore.reviewersWithData++
                const totalPenalty = penaltyTx.reduce((sum, t) => sum + Math.abs(t.amount), 0)
                if (metricStats.penaltyScore.samples.length < 3) {
                    metricStats.penaltyScore.samples.push({
                        username,
                        penaltyAmount: totalPenalty,
                        normalized: Math.max(0, 1 - (totalPenalty / 100)).toFixed(2)
                    })
                }
            }

            // REVIEW VARIANCE
            if (totalReviews >= 2) {
                const xpScores = reviews.map(r => r.xpScore)
                const mean = xpScores.reduce((a, b) => a + b, 0) / totalReviews
                const variance = xpScores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / totalReviews
                const stdDev = Math.sqrt(variance)

                metricStats.reviewVariance.reviewersWithData++
                if (metricStats.reviewVariance.samples.length < 3) {
                    metricStats.reviewVariance.samples.push({
                        username,
                        stdDev: stdDev.toFixed(2),
                        normalized: Math.max(0, 1 - (stdDev / 40)).toFixed(2)
                    })
                }
            }

            // LATE PERCENTAGE
            if (totalReviews > 0) {
                const lateCount = reviews.filter(r => r.isLate).length
                metricStats.latePercentage.reviewersWithData++
                if (metricStats.latePercentage.samples.length < 3) {
                    metricStats.latePercentage.samples.push({
                        username,
                        late: lateCount,
                        total: totalReviews,
                        normalized: (1 - (lateCount / totalReviews)).toFixed(2)
                    })
                }
            }
        }

        // Calculate status for each metric
        const getStatus = (count: number, total: number): 'NO_DATA' | 'LOW_DATA' | 'PARTIAL' | 'GOOD_DATA' => {
            const ratio = count / total
            if (ratio === 0) return 'NO_DATA'
            if (ratio < 0.3) return 'LOW_DATA'
            if (ratio < 0.7) return 'PARTIAL'
            return 'GOOD_DATA'
        }

        for (const key of Object.keys(metricStats)) {
            const stat = metricStats[key]
            stat.coverage = `${stat.reviewersWithData}/${totalReviewers} (${((stat.reviewersWithData / totalReviewers) * 100).toFixed(0)}%)`
            stat.status = getStatus(stat.reviewersWithData, totalReviewers)
        }

        // Build summary
        const withData = Object.entries(metricStats)
            .filter(([_, stat]) => stat.status !== 'NO_DATA')
            .map(([key, stat]) => ({ key, ...stat }))

        const noData = Object.entries(metricStats)
            .filter(([_, stat]) => stat.status === 'NO_DATA')
            .map(([key, stat]) => ({ key, ...stat }))

        return NextResponse.json({
            success: true,
            totalReviewers,
            metrics: metricStats,
            summary: {
                metricsWithData: withData.map(m => `${m.name}: ${m.coverage}`),
                metricsWithNoData: noData.map(m => m.name),
                deadCode: noData.map(m => m.key)
            }
        })
    } catch (error: any) {
        console.error('[Metric Audit] Error:', error)
        return NextResponse.json(
            { error: 'Failed to audit metrics', details: error.message },
            { status: 500 }
        )
    }
})
