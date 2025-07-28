import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const { email, password, username } = await request.json()
    
    if (!email || !password || !username) {
      return NextResponse.json(
        { error: 'Email, password, and username are required' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    // Create the user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username
      }
    })

    if (authError) {
      console.error('Auth error:', authError)
      return NextResponse.json(
        { error: `Failed to create auth user: ${authError.message}` },
        { status: 400 }
      )
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 400 }
      )
    }

    // Create the user profile in the database
    const { data: profileData, error: profileError } = await supabase
      .from('User')
      .insert({
        id: authData.user.id,
        email: authData.user.email!,
        username,
        role: 'ADMIN',
        totalXp: 0,
        currentWeekXp: 0,
        streakWeeks: 0,
        missedReviews: 0
      })
      .select()
      .single()

    if (profileError) {
      console.error('Profile error:', profileError)
      // Try to clean up the auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json(
        { error: `Failed to create user profile: ${profileError.message}` },
        { status: 400 }
      )
    }

    return NextResponse.json({
      message: 'Test admin user created successfully',
      user: {
        id: authData.user.id,
        email: authData.user.email,
        username,
        role: 'ADMIN'
      }
    })

  } catch (error) {
    console.error('Error creating test admin:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
