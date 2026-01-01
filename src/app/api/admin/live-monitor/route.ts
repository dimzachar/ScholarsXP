import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'
import { reliabilityService } from '@/lib/reliability/reliability-service'
import { RELIABILITY_CONFIG } from '@/config/reliability'
import { getFormula, calculateScore, identifyBad } from '@/lib/reliability/formulas'

// Simple retry wrapper for transient database connection failures
async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 500): Promise<T> {
    let lastError: unknown
    for (let i = 0; i <= retries; i++) {
        try {
            return await fn()
        } catch (error: unknown) {
            lastError = error
            const isRetryable = error instanceof Error &&
                (error.message.includes("Can't reach database server") ||
                    error.message.includes('P1001') ||
                    error.message.includes('connection'))
            if (!isRetryable || i === retries) throw error
            await new Promise(resolve => setTimeout(resolve, delayMs * (i + 1)))
        }
    }
    throw lastError
}

export const GET = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
    try {
        // 1. Fetch Active Divergent Cases (Raw query needed for STDDEV)
        // Find submissions with high disagreement (STDDEV > 50) in the last 30 days
        // PRIORITIZE cases with votes by ordering by vote count DESC
        const divergentSubmissions = await withRetry(() => prisma.$queryRaw<{ id: string, title: string, url: string, createdAt: Date }[]>`
            SELECT 
                s.id,
                s.title,
                s.url,
                s."createdAt"
            FROM "Submission" s
            JOIN "PeerReview" pr ON s.id = pr."submissionId"
            LEFT JOIN "JudgmentVote" jv ON s.id = jv."submissionId"
            WHERE s.status = 'FINALIZED'
            AND s."createdAt" >= NOW() - INTERVAL '30 days'
            GROUP BY s.id, s.title, s.url, s."createdAt"
            HAVING STDDEV(pr."xpScore") > 50
            ORDER BY COUNT(jv.id) DESC, s."createdAt" DESC
            LIMIT 10
        `)

        // 2. Fetch Votes for these submissions
        const submissionIds = divergentSubmissions.map(s => s.id)
        const votes = submissionIds.length > 0
            ? await withRetry(() => prisma.judgmentVote.findMany({
                where: { submissionId: { in: submissionIds } },
                select: { submissionId: true, voteXp: true }
            }))
            : []

        // Map votes to submissions
        const activeVotes = divergentSubmissions.map(s => {
            const caseVotes = votes.filter(v => v.submissionId === s.id)
            return {
                id: s.id,
                title: s.title,
                url: s.url,
                createdAt: s.createdAt,
                voteCount: caseVotes.length,
                voteDistribution: caseVotes.reduce((acc: Record<number, number>, v) => {
                    acc[v.voteXp] = (acc[v.voteXp] || 0) + 1
                    return acc
                }, {} as Record<number, number>)
            }
        })

        // 3. Fetch Recent Consensus Events
        const recentConsensus = await withRetry(() => prisma.shadowConsensusLog.findMany({
            take: 10,
            orderBy: { timestamp: 'desc' },
            select: {
                id: true,
                submissionId: true,
                timestamp: true,
                submission: {
                    select: {
                        id: true,
                        title: true,
                        peerReviews: {
                            select: {
                                reviewerId: true,
                                judgmentStatus: true,
                                reviewer: { select: { username: true } }
                            },
                            take: 5
                        }
                    }
                }
            }
        }))

        // 4. Identify Active Reviewers
        // Primary source: Reviewers involved in recent consensus
        const activeReviewerIds = new Set<string>()
        recentConsensus.forEach((l: any) => l.submission.peerReviews.forEach((r: any) => activeReviewerIds.add(r.reviewerId)))

        // Secondary source: If we have fewer than 10 reviewers, fetch most recent active reviewers
        if (activeReviewerIds.size < 10) {
            const recentReviewers = await withRetry(() => prisma.peerReview.findMany({
                take: 20,
                orderBy: { createdAt: 'desc' },
                distinct: ['reviewerId'],
                select: { reviewerId: true }
            }))
            recentReviewers.forEach(r => activeReviewerIds.add(r.reviewerId))
        }

        // 4. Get Reliability Scores for these reviewers (Batch fetch)
        const reviewerIds = Array.from(activeReviewerIds)
        const reliabilityMap = await reliabilityService.getReliabilityScores(reviewerIds)

        // 5. Calculate Shadow Scores locally to avoid redundant DB calls
        const formulaV1 = getFormula('CUSTOM_V1')
        const formulaV2 = getFormula('CUSTOM_V2')

        const reviewersWithScores = reviewerIds.map((id) => {
            const active = reliabilityMap.get(id)
            if (!active) return null

            // Calculate shadow scores locally using already fetched metrics
            const shadowScoreV1 = calculateScore(active.metrics, formulaV1.weights, formulaV1.defaultValues)
            const shadowScoreV2 = calculateScore(active.metrics, formulaV2.weights, formulaV2.defaultValues)

            // Determine status
            const { isBad } = identifyBad(active.metrics)
            let status: 'Excellent' | 'Good' | 'At Risk' = 'Good'

            if (isBad) {
                status = 'At Risk'
            } else if (active.score >= 0.8) {
                status = 'Excellent'
            }

            return {
                id,
                username: active.metrics.username,
                activeScore: active.score,
                shadowScoreV1,
                shadowScoreV2,
                metrics: active.metrics,
                timestamp: active.timestamp,
                status
            }
        }).filter(Boolean)

        return NextResponse.json({
            activeVotes,
            recentConsensus: recentConsensus.map((l: any) => ({
                id: l.id,
                submissionId: l.submissionId,
                title: l.submission.title,
                timestamp: l.timestamp,
                impact: l.submission.peerReviews.map((r: any) => ({
                    reviewerId: r.reviewerId,
                    username: r.reviewer.username,
                    status: r.judgmentStatus
                }))
            })),
            watchlist: reviewersWithScores,
            config: {
                activeFormula: RELIABILITY_CONFIG.ACTIVE_FORMULA,
                shadowFormulaV1: 'CUSTOM_V1',
                shadowFormulaV2: 'CUSTOM_V2',
                shadowModeEnabled: RELIABILITY_CONFIG.ENABLE_SHADOW_MODE
            }
        })
    } catch (error: any) {
        console.error('[Live Monitor API] Error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch live monitor data', details: error.message },
            { status: 500 }
        )
    }
})
