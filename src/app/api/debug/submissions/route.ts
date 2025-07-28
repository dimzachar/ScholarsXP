import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Debug: Checking submissions in database...')
    
    // Get basic count
    const totalSubmissions = await prisma.submission.count()
    console.log('📊 Total submissions in database:', totalSubmissions)
    
    // Get sample submissions
    const sampleSubmissions = await prisma.submission.findMany({
      take: 5,
      select: {
        id: true,
        url: true,
        platform: true,
        status: true,
        createdAt: true,
        userId: true
      }
    })
    
    console.log('📋 Sample submissions:', sampleSubmissions)
    
    // Get user count
    const totalUsers = await prisma.user.count()
    console.log('👥 Total users in database:', totalUsers)
    
    return NextResponse.json({
      totalSubmissions,
      totalUsers,
      sampleSubmissions,
      message: 'Debug info retrieved successfully'
    })
    
  } catch (error) {
    console.error('💥 Debug error:', error)
    return NextResponse.json({
      error: error.message,
      totalSubmissions: 0,
      totalUsers: 0,
      sampleSubmissions: [],
      message: 'Database connection failed'
    })
  }
}
