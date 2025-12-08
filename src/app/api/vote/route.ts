import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface DivergentSubmission {
    id: string
    url: string
    platform: string
    xpStdDev: number
    reviewCount: bigint
    minXp: number
    maxXp: number
}

// GET: Fetch submissions with divergent scores for voting
export async function GET() {
    try {
        // Use raw query to match exact SQL logic
        const results = await prisma.$queryRaw<DivergentSubmission[]>`
            SELECT 
                s.id,
                s.url,
                s.platform,
                STDDEV(pr."xpScore")::float as "xpStdDev",
                COUNT(pr.id) as "reviewCount",
                MIN(pr."xpScore") as "minXp",
                MAX(pr."xpScore") as "maxXp"
            FROM "Submission" s
            JOIN "PeerReview" pr ON s.id = pr."submissionId"
            WHERE s.status = 'FINALIZED'
            AND s."createdAt" >= NOW() - INTERVAL '4 days'
            GROUP BY s.id
            HAVING STDDEV(pr."xpScore") > 50
            ORDER BY STDDEV(pr."xpScore") DESC
        `

        const cases = results.map(r => ({
            submissionId: r.id,
            url: r.url,
            platform: r.platform,
            divergentScores: [r.minXp, r.maxXp] as [number, number],
            stdDev: r.xpStdDev,
            reviewCount: Number(r.reviewCount),
        }))

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

// POST: Submit a vote
export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { submissionId, walletAddress, voteXp, signature } = body

        if (!submissionId || !walletAddress || voteXp === undefined || !signature) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            )
        }

        if (typeof signature !== 'string' || signature.length === 0) {
            return NextResponse.json(
                { error: 'Invalid signature format' },
                { status: 400 }
            )
        }

        // Check if wallet has already voted
        const existingVote = await prisma.judgmentVote.findUnique({
            where: {
                submissionId_walletAddress: {
                    submissionId,
                    walletAddress,
                },
            },
        })

        if (existingVote) {
            return NextResponse.json(
                { error: 'You have already voted on this submission' },
                { status: 400 }
            )
        }

        // Create vote
        const vote = await prisma.judgmentVote.create({
            data: {
                submissionId,
                walletAddress,
                voteXp,
                signature,
            },
        })

        return NextResponse.json({ success: true, vote }, { status: 201 })
    } catch (error: unknown) {
        console.error('Failed to submit vote:', error)

        // Handle unique constraint violation
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
            return NextResponse.json(
                { error: 'You have already voted on this submission' },
                { status: 400 }
            )
        }

        return NextResponse.json(
            { error: 'Failed to submit vote' },
            { status: 500 }
        )
    }
}
