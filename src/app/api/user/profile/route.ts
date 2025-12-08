import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase-server'

export const GET = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id

    // Create service client for database queries (auth handled by middleware)
    const supabase = createServiceClient()

    // Get user profile from database
    const { data: userProfile, error: profileError } = await supabase
      .from('User')
      .select('*')
      .eq('id', userId)
      .single()

    if (profileError) {
      console.error('Error fetching user profile:', profileError)
      return NextResponse.json({ error: 'Failed to fetch user profile' }, { status: 500 })
    }

    return NextResponse.json(userProfile)
  } catch (error) {
    console.error('User profile API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})
