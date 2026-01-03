import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getReviewerStats, type ReviewerStats } from '@/lib/reviewer-analytics'
import { getPlatformBenchmarks, type PlatformBenchmark } from '@/lib/platform-benchmarks'
import { getHistoricalDivergentCases } from '@/lib/historical-cases'
import { analyzeWithoutLLM, type CaseAnalysisResult } from '@/lib/case-analysis'

interface DivergentSubmission {
    id: string
    url: string
    platform: string
    title: string | null
    content: string | null
    aiXp: number | null
    finalXp: number | null
    createdAt: Date
    xpStdDev: string | number
    reviewCount: bigint
    minXp: number
    maxXp: number
}

interface ReviewData {
    id: string
    reviewerId: string
    xpScore: number
    comments: string | null
    contentCategory: string | null
    qualityTier: string | null
    createdAt: string
}

// Detect conflict type based on score patterns
function detectConflictType(reviews: ReviewData[]): { type: string; description: string } {
    if (reviews.length < 2) return { type: 'insufficient', description: 'Not enough reviews' }

    const scores = reviews.map(r => r.xpScore).sort((a, b) => a - b)
    const hasZero = scores.some(s => s === 0)
    const hasHigh = scores.some(s => s >= 150)
    const categories = [...new Set(reviews.map(r => r.contentCategory).filter(Boolean))]
    const tiers = [...new Set(reviews.map(r => r.qualityTier).filter(Boolean))]

    // Check for outlier (one score far from others)
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    const outliers = scores.filter(s => Math.abs(s - avg) > avg * 0.5)

    if (hasZero && hasHigh) {
        return { type: 'spam_dispute', description: 'Possible spam/quality dispute - one reviewer gave 0 XP while others rated highly' }
    }
    if (categories.length > 1) {
        return { type: 'category_mismatch', description: `Category disagreement - reviewers classified as: ${categories.join(', ')}` }
    }
    if (tiers.length > 1) {
        return { type: 'tier_dispute', description: `Quality tier disagreement - reviewers assigned tiers: ${tiers.join(', ')}` }
    }
    if (outliers.length === 1) {
        return { type: 'outlier', description: 'One reviewer scored significantly different from others' }
    }
    return { type: 'general', description: 'Significant score variance between reviewers' }
}

// GET: Fetch submissions with divergent scores for voting
// Filter out already-voted submissions based on userId (checks all user's wallets)
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const userId = searchParams.get('userId')

        // Use raw query to match exact SQL logic - include more submission details
        const results = await prisma.$queryRaw<DivergentSubmission[]>`
            SELECT 
                s.id,
                s.url,
                s.platform,
                s.title,
                s.content,
                s."aiXp",
                s."finalXp",
                s."createdAt",
                STDDEV(pr."xpScore") as "xpStdDev",
                COUNT(pr.id) as "reviewCount",
                MIN(pr."xpScore") as "minXp",
                MAX(pr."xpScore") as "maxXp"
            FROM "Submission" s
            JOIN "PeerReview" pr ON s.id = pr."submissionId"
            WHERE s.status = 'FINALIZED'
            AND s."createdAt" >= NOW() - INTERVAL '90 days'
            GROUP BY s.id, s.url, s.platform, s.title, s.content, s."aiXp", s."finalXp", s."createdAt"
            HAVING STDDEV(pr."xpScore") > 50
            ORDER BY STDDEV(pr."xpScore") DESC
        `

        // Fetch reviews for all divergent submissions
        const submissionIds = results.map(r => r.id)
        const reviews = submissionIds.length > 0
            ? await prisma.peerReview.findMany({
                where: { submissionId: { in: submissionIds } },
                select: {
                    id: true,
                    submissionId: true,
                    reviewerId: true,
                    xpScore: true,
                    comments: true,
                    contentCategory: true,
                    qualityTier: true,
                    createdAt: true,
                }
            })
            : []

        // Group reviews by submission
        const reviewsBySubmission = reviews.reduce((acc, review) => {
            if (!acc[review.submissionId]) {
                acc[review.submissionId] = []
            }
            acc[review.submissionId].push({
                id: review.id,
                reviewerId: review.reviewerId,
                xpScore: review.xpScore,
                comments: review.comments,
                contentCategory: review.contentCategory,
                qualityTier: review.qualityTier,
                createdAt: review.createdAt.toISOString(),
            })
            return acc
        }, {} as Record<string, ReviewData[]>)

        // Get unique reviewer IDs and platforms
        const reviewerIds = [...new Set(reviews.map(r => r.reviewerId))]
        const platforms = [...new Set(results.map(r => r.platform))]

        // Use modular services for stats
        const reviewerStatsMap = await getReviewerStats(reviewerIds)
        const platformBenchmarksMap = await getPlatformBenchmarks(platforms)

        // Fetch historical cases for each platform
        const historicalByPlatform: Record<string, Awaited<ReturnType<typeof getHistoricalDivergentCases>>> = {}
        for (const platform of platforms) {
            historicalByPlatform[platform] = await getHistoricalDivergentCases(platform, 5)
        }

        let cases = results.map((r, idx) => {
            const submissionReviews = reviewsBySubmission[r.id] || []
            const conflict = detectConflictType(submissionReviews)

            // Enrich reviews with reviewer stats
            const enrichedReviews = submissionReviews.map((review, reviewIdx) => ({
                ...review,
                reviewerStats: reviewerStatsMap[review.reviewerId] || null,
                label: String.fromCharCode(65 + reviewIdx), // A, B, C
            }))

            const platformBenchmark = platformBenchmarksMap[r.platform] || null
            const historical = historicalByPlatform[r.platform]

            // Generate case analysis (rule-based, fast)
            const analysis: CaseAnalysisResult = analyzeWithoutLLM({
                platform: r.platform,
                scores: [r.minXp, r.maxXp],
                reviews: enrichedReviews.map(rev => ({
                    label: rev.label,
                    xpScore: rev.xpScore,
                    comments: rev.comments,
                    category: rev.contentCategory,
                    tier: rev.qualityTier,
                })),
                conflictType: conflict.type,
                conflictDescription: conflict.description,
                platformAvgXp: platformBenchmark?.avgXp,
            })

            return {
                submissionId: r.id,
                url: r.url,
                platform: r.platform,
                title: r.title,
                createdAt: r.createdAt?.toISOString?.() || null,
                divergentScores: [r.minXp, r.maxXp] as [number, number],
                stdDev: typeof r.xpStdDev === 'string' ? parseFloat(r.xpStdDev) : r.xpStdDev,
                reviewCount: Number(r.reviewCount),
                finalXp: r.finalXp,
                reviews: enrichedReviews,
                conflict,
                platformBenchmark,
                historicalCases: historical?.cases || [],
                analysis,
            }
        })

        // Filter out submissions the user has already voted on (check all user's wallets)
        if (userId) {
            // Get all wallet addresses belonging to this user
            const userWallets = await prisma.$queryRaw<Array<{ address: string }>>`
                SELECT address FROM "UserWallet" WHERE "userId" = ${userId}::uuid
            `
            const walletAddresses = userWallets.map(w => w.address)

            if (walletAddresses.length > 0) {
                // Get all votes from any of the user's wallets
                const existingVotes = await prisma.judgmentVote.findMany({
                    where: { walletAddress: { in: walletAddresses } },
                    select: { submissionId: true }
                })
                const votedIds = new Set(existingVotes.map(v => v.submissionId))
                cases = cases.filter(c => !votedIds.has(c.submissionId))
            }
        }

        return NextResponse.json({
            cases,
            total: cases.length,
        })
    } catch (error) {
        console.error('Failed to fetch judgment cases:', error)
        return NextResponse.json(
            { error: 'Failed to fetch judgment cases', details: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        )
    }
}
