import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export const GET = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
    try {
        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '20')
        const offset = (page - 1) * limit
        const search = searchParams.get('search')

        // Build the WHERE clause for search
        let whereClause = Prisma.sql``
        if (search) {
            const searchPattern = `%${search}%`
            whereClause = Prisma.sql`
                WHERE (
                    s.title ILIKE ${searchPattern}
                    OR s.url ILIKE ${searchPattern}
                    OR EXISTS (
                        SELECT 1 FROM "PeerReview" pr2
                        INNER JOIN "User" u ON u.id = pr2."reviewerId"
                        WHERE pr2."submissionId" = s.id
                        AND u.username ILIKE ${searchPattern}
                    )
                )
            `
        }

        // Get submission IDs ordered by their most recent review
        const submissionIdsWithLatestReview = await prisma.$queryRaw<{ id: string }[]>`
            SELECT s.id
            FROM "Submission" s
            INNER JOIN "PeerReview" pr ON pr."submissionId" = s.id
            ${whereClause}
            GROUP BY s.id
            ORDER BY MAX(pr."createdAt") DESC
            OFFSET ${offset}
            LIMIT ${limit}
        `

        const orderedIds = submissionIdsWithLatestReview.map(s => s.id)

        const [submissions, totalCount] = await Promise.all([
            prisma.submission.findMany({
                where: {
                    id: { in: orderedIds }
                },
                select: {
                    id: true,
                    url: true,
                    platform: true,
                    title: true,
                    finalXp: true,
                    aiSummary: true,
                    peerReviews: {
                        select: {
                            id: true,
                            xpScore: true,
                            comments: true,
                            createdAt: true,
                            qualityRating: true,
                            isLate: true,
                            contentCategory: true,
                            qualityTier: true,
                            reviewer: {
                                select: {
                                    id: true,
                                    username: true,
                                    email: true,
                                    profileImageUrl: true
                                }
                            }
                        },
                        orderBy: { createdAt: 'desc' }
                    }
                }
            }).then(results => {
                // Re-order results to match the order from the raw query
                const orderMap = new Map(orderedIds.map((id, index) => [id, index]))
                return results.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))
            }),
            prisma.submission.count({
                where: {
                    ...(search ? {
                        OR: [
                            { title: { contains: search, mode: 'insensitive' } },
                            { url: { contains: search, mode: 'insensitive' } },
                            { peerReviews: { some: { reviewer: { username: { contains: search, mode: 'insensitive' } } } } }
                        ]
                    } : {}),
                    peerReviews: {
                        some: {}
                    }
                }
            })
        ])

        const totalPages = Math.ceil(totalCount / limit)

        return NextResponse.json({
            success: true,
            data: {
                submissions,
                pagination: {
                    page,
                    limit,
                    totalCount,
                    totalPages
                }
            }
        })

    } catch (error) {
        console.error('Error fetching admin reviews:', error)
        return NextResponse.json(
            {
                success: false,
                error: {
                    error: 'Internal server error',
                    code: 'INTERNAL_SERVER_ERROR'
                }
            },
            { status: 500 }
        )
    }
})
