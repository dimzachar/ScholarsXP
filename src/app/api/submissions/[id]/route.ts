import { NextResponse } from 'next/server'
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'

async function getHandler(
  request: AuthenticatedRequest,
  context?: unknown
) {
  const userProfile = request.userProfile
  const params = (context as { params: { id: string } } | undefined)?.params
  
  if (!params?.id) {
    return NextResponse.json({ error: 'Missing submission ID' }, { status: 400 })
  }

  const submission = await prisma.submission.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      url: true,
      platform: true,
      status: true,
      taskTypes: true,
      aiXp: true,
      finalXp: true,
      createdAt: true,
      user: { select: { id: true, username: true, email: true } }
    }
  })

  if (!submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  const isOwner = submission.user?.id === userProfile.id
  const isAdmin = userProfile.role === 'ADMIN'

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json(submission)
}

export const GET = withAuth(getHandler)
