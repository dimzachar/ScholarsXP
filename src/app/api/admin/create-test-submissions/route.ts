import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'

export const POST = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    console.log('🔧 Creating test submissions...')
    
    // Get some users to assign submissions to
    const users = await prisma.user.findMany({
      take: 5,
      select: { id: true, username: true, email: true }
    })
    
    if (users.length === 0) {
      return NextResponse.json({
        error: 'No users found to create submissions for',
        created: 0
      })
    }
    
    const testSubmissions = [
      {
        userId: users[0].id,
        url: 'https://twitter.com/user1/status/123456789',
        platform: 'TWITTER',
        taskTypes: ['A'],
        status: 'PENDING',
        aiXp: 25,
        finalXp: 25,
        weekNumber: 1
      },
      {
        userId: users[1]?.id || users[0].id,
        url: 'https://linkedin.com/posts/user2-activity-123456789',
        platform: 'LINKEDIN',
        taskTypes: ['B'],
        status: 'AI_REVIEWED',
        aiXp: 120,
        finalXp: 120,
        weekNumber: 1
      },
      {
        userId: users[2]?.id || users[0].id,
        url: 'https://medium.com/@user3/great-article-123',
        platform: 'MEDIUM',
        taskTypes: ['C'],
        status: 'UNDER_PEER_REVIEW',
        aiXp: 30,
        peerXp: 28,
        finalXp: 28,
        weekNumber: 1
      },
      {
        userId: users[3]?.id || users[0].id,
        url: 'https://twitter.com/user4/status/987654321',
        platform: 'TWITTER',
        taskTypes: ['D'],
        status: 'FINALIZED',
        aiXp: 65,
        peerXp: 70,
        finalXp: 70,
        weekNumber: 1
      },
      {
        userId: users[4]?.id || users[0].id,
        url: 'https://youtube.com/watch?v=abc123',
        platform: 'YOUTUBE',
        taskTypes: ['E'],
        status: 'FINALIZED',
        aiXp: 75,
        peerXp: 72,
        finalXp: 72,
        weekNumber: 1
      }
    ] as const
    
    // Create the submissions one by one to get better error handling
    let createdCount = 0
    const errors = []

    for (const submission of testSubmissions) {
      try {
        console.log('🔧 Creating submission:', submission)
        const created = await prisma.submission.create({
          data: submission
        })
        console.log('✅ Created submission:', created.id)
        createdCount++
      } catch (error) {
        console.error('💥 Error creating submission:', error)
        errors.push(error.message)
      }
    }

    console.log('✅ Created test submissions:', createdCount, 'errors:', errors.length)

    // Verify submissions were actually created
    const verifyCount = await prisma.submission.count()
    console.log('🔍 Verification: Total submissions in DB after creation:', verifyCount)

    return NextResponse.json({
      message: `Successfully created ${createdCount} test submissions${errors.length > 0 ? ` (${errors.length} errors)` : ''}`,
      created: createdCount,
      verified: verifyCount,
      errors: errors,
      errorDetails: errors.length > 0 ? errors.join(' | ') : null,
      users: users.map(u => ({ id: u.id, username: u.username }))
    })
    
  } catch (error) {
    console.error('💥 Error creating test submissions:', error)
    return NextResponse.json({
      error: error.message,
      created: 0
    }, { status: 500 })
  }
})
