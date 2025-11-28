import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'

export const GET = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
    try {
        const { searchParams } = new URL(request.url)
        const page = parseInt(searchParams.get('page') || '1')
        const limit = parseInt(searchParams.get('limit') || '20')
        const offset = (page - 1) * limit
        const search = searchParams.get('search')

        const where: any = {}

        if (search) {
            where.OR = [
                {
                    title: { contains: search, mode: 'insensitive' }
                },
                {
                    url: { contains: search, mode: 'insensitive' }
                },
                {
                    peerReviews: {
                        some: {
                            reviewer: {
                                username: { contains: search, mode: 'insensitive' }
                            }
                        }
                    }
                }
            ]
        }

        const [submissions, totalCount] = await Promise.all([
            prisma.submission.findMany({
                where: {
                    ...where,
                    peerReviews: {
                        some: {} // Only fetch submissions that have at least one review
                    }
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
                },
                orderBy: { updatedAt: 'desc' },
                skip: offset,
                take: limit
            }),
            prisma.submission.count({
                where: {
                    ...where,
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
