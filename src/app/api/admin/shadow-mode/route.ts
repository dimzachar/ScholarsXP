import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'

export const GET = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
    try {
        const { searchParams } = new URL(request.url)
        const limit = parseInt(searchParams.get('limit') || '50')
        const offset = parseInt(searchParams.get('offset') || '0')

        const logs = await prisma.shadowConsensusLog.findMany({
            take: limit,
            skip: offset,
            orderBy: { timestamp: 'desc' },
            include: {
                submission: {
                    select: {
                        id: true,
                        title: true,
                        url: true,
                        status: true
                    }
                }
            }
        })

        const total = await prisma.shadowConsensusLog.count()

        return NextResponse.json({
            logs,
            total,
            limit,
            offset
        })
    } catch (error: any) {
        console.error('[Shadow Mode API] Error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch shadow mode logs', details: error.message },
            { status: 500 }
        )
    }
})
