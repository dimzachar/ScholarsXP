import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'

export const POST = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    console.log('🗑️ Deleting test submissions...')
    
    // Delete submissions that match our test data URLs
    const testUrls = [
      'https://twitter.com/user1/status/123456789',
      'https://linkedin.com/posts/user2-activity-123456789',
      'https://medium.com/@user3/great-article-123',
      'https://twitter.com/user4/status/987654321',
      'https://youtube.com/watch?v=abc123'
    ]
    
    const deletedSubmissions = await prisma.submission.deleteMany({
      where: {
        url: {
          in: testUrls
        }
      }
    })
    
    console.log('✅ Deleted test submissions:', deletedSubmissions.count)
    
    // Verify deletion
    const remainingCount = await prisma.submission.count()
    console.log('🔍 Remaining submissions in DB:', remainingCount)
    
    return NextResponse.json({
      message: `Successfully deleted ${deletedSubmissions.count} test submissions`,
      deleted: deletedSubmissions.count,
      remaining: remainingCount
    })
    
  } catch (error) {
    console.error('💥 Error deleting test submissions:', error)
    return NextResponse.json({
      error: error.message,
      deleted: 0
    }, { status: 500 })
  }
})
