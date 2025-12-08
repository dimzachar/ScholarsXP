import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/user/me
 * Get current user from Supabase by Privy user ID
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const privyUserId = searchParams.get('privyUserId')
    
    if (!privyUserId) {
      return NextResponse.json(
        { error: 'privyUserId query parameter is required' },
        { status: 400 }
      )
    }
    
    const user = await prisma.user.findUnique({
      where: { privyUserId },
    })
    
    return NextResponse.json({ user })
    
  } catch (error) {
    console.error('Get user error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
