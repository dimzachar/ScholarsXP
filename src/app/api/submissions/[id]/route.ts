import { NextRequest, NextResponse } from 'next/server'
import { getUserProfileByPrivyId } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const privyUserId = request.headers.get('x-privy-user-id')

  if (!privyUserId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const userProfile = await getUserProfileByPrivyId(privyUserId)
  if (!userProfile) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 })
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
