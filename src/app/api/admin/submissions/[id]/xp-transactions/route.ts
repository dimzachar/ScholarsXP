import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'

export const GET = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const url = new URL(request.url)
    const submissionId = url.pathname.split('/').slice(-2)[0] // Extract ID from path

    // Verify submission exists (check both regular and legacy submissions)
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true, userId: true }
    })

    // If not found in regular submissions, check legacy submissions
    if (!submission) {
      const legacySubmission = await prisma.legacySubmission.findUnique({
        where: { id: submissionId },
        select: { id: true }
      })

      if (legacySubmission) {
        // Legacy submissions don't have XP transactions, return empty array
        return NextResponse.json({
          transactions: [],
          totalCount: 0,
          message: 'Legacy submissions do not have XP transactions'
        })
      }

      return NextResponse.json(
        { message: 'Submission not found' },
        { status: 404 }
      )
    }

    // Get all XP transactions related to this submission
    const transactions = await prisma.xpTransaction.findMany({
      where: {
        OR: [
          { sourceId: submissionId }, // Direct submission-related transactions
          { 
            userId: submission.userId,
            description: { contains: submissionId } // Transactions that mention this submission
          }
        ]
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amount: true,
        type: true,
        description: true,
        createdAt: true,
        weekNumber: true
      }
    })

    return NextResponse.json({
      transactions,
      count: transactions.length
    })

  } catch (error) {
    console.error('Error fetching XP transactions:', error)
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    )
  }
})
