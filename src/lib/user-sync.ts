import { supabase } from './supabase-client'
import type { User } from '@supabase/supabase-js'

export async function syncUserToDatabase(authUser: User) {
  try {
    // Check if user already exists in our custom User table
    const { data: existingUser, error: fetchError } = await supabase
      .from('User')
      .select('*')
      .eq('id', authUser.id)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 is "not found" error, which is expected for new users
      console.error('Error checking existing user:', fetchError)
      return null
    }

    if (existingUser) {
      // User already exists, optionally update their info
      const { data: updatedUser, error: updateError } = await supabase
        .from('User')
        .update({
          email: authUser.email || existingUser.email,
          username: authUser.user_metadata?.full_name || authUser.user_metadata?.name || existingUser.username
        })
        .eq('id', authUser.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating user:', updateError)
        return existingUser
      }

      return updatedUser
    } else {
      // Create new user in our custom table
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

      const { data: createdUser, error: createError } = await supabase
        .from('User')
        .insert(newUser)
        .select()
        .single()

      if (createError) {
        console.error('Error creating user:', createError)
        return null
      }

      console.log('✅ New user created:', createdUser)
      return createdUser
    }
  } catch (error) {
    console.error('Error syncing user to database:', error)
    return null
  }
}

export async function getCurrentUser() {
  try {
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !authUser) {
      return null
    }

    // Get user from our custom table
    const { data: customUser, error: fetchError } = await supabase
      .from('User')
      .select('*')
      .eq('id', authUser.id)
      .single()

    if (fetchError) {
      // If user doesn't exist in custom table, create them
      if (fetchError.code === 'PGRST116') {
        return await syncUserToDatabase(authUser)
      }
      console.error('Error fetching user:', fetchError)
      return null
    }

    return customUser
  } catch (error) {
    console.error('Error getting current user:', error)
    return null
  }
}
