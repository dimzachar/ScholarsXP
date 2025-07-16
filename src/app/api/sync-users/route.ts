import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    // Create service client for admin operations (user synchronization requires elevated privileges)
    const supabaseAdmin = createServiceClient()

    // Get all users from auth.users
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers()
    
    if (authError) {
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch auth users: ' + authError.message
      }, { status: 500 })
    }

    const results = []

    // Sync each auth user to custom User table
    for (const authUser of authUsers.users) {
      try {
        // Check if user exists in custom table
        const { data: existingUser, error: fetchError } = await supabaseAdmin
          .from('User')
          .select('*')
          .eq('id', authUser.id)
          .single()

        if (fetchError && fetchError.code !== 'PGRST116') {
          results.push({
            userId: authUser.id,
            email: authUser.email,
            status: 'error',
            message: 'Failed to check existing user: ' + fetchError.message
          })
          continue
        }

        if (!existingUser) {
          // Create new user
          const newUser = {
            id: authUser.id,
            email: authUser.email!,
            username: authUser.user_metadata?.full_name || 
                     authUser.user_metadata?.name || 
                     authUser.email?.split('@')[0] || 
                     'User',
            totalXp: 0,
            currentWeekXp: 0,
            streakWeeks: 0,
            missedReviews: 0
          }

          const { data: createdUser, error: createError } = await supabaseAdmin
            .from('User')
            .insert(newUser)
            .select()
            .single()

          if (createError) {
            results.push({
              userId: authUser.id,
              email: authUser.email,
              status: 'error',
              message: 'Failed to create user: ' + createError.message
            })
          } else {
            results.push({
              userId: authUser.id,
              email: authUser.email,
              status: 'created',
              message: 'User created successfully'
            })
          }
        } else {
          results.push({
            userId: authUser.id,
            email: authUser.email,
            status: 'exists',
            message: 'User already exists'
          })
        }
      } catch (error) {
        results.push({
          userId: authUser.id,
          email: authUser.email,
          status: 'error',
          message: 'Unexpected error: ' + (error instanceof Error ? error.message : 'Unknown error')
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${authUsers.users.length} users`,
      results
    })

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Server error: ' + (error instanceof Error ? error.message : 'Unknown error')
    }, { status: 500 })
  }
}
