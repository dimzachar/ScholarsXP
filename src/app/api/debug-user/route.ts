import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current auth user
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
    
    if (authError) {
      return NextResponse.json({
        success: false,
        error: 'Auth error: ' + authError.message,
        authUser: null,
        customUser: null
      })
    }

    if (!authUser) {
      return NextResponse.json({
        success: true,
        message: 'No authenticated user',
        authUser: null,
        customUser: null
      })
    }

    // Get user from custom User table
    const { data: customUser, error: customError } = await supabase
      .from('User')
      .select('*')
      .eq('id', authUser.id)
      .single()

    return NextResponse.json({
      success: true,
      authUser: {
        id: authUser.id,
        email: authUser.email,
        created_at: authUser.created_at,
        last_sign_in_at: authUser.last_sign_in_at
      },
      customUser: customUser || null,
      customUserError: customError?.message || null,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Server error: ' + (error instanceof Error ? error.message : 'Unknown error'),
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}
