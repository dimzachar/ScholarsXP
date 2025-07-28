import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase-server'

/**
 * Manual merge endpoint for a specific user's legacy account
 * This can be used to trigger merging for users who are already signed in
 */
export const POST = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    const { userId, discordHandle } = await request.json()
    
    if (!userId) {
      return NextResponse.json({
        error: 'User ID is required'
      }, { status: 400 })
    }

    console.log(`🔄 Manual legacy account merge requested for user ${userId} with handle ${discordHandle}`)

    const supabase = createServiceClient()

    // Get the current user
    const { data: currentUser, error: userError } = await supabase
      .from('User')
      .select('*')
      .eq('id', userId)
      .single()

    if (userError || !currentUser) {
      return NextResponse.json({
        error: 'User not found'
      }, { status: 404 })
    }

    // Determine the Discord handle to search for
    const searchHandle = discordHandle || currentUser.discordHandle
    if (!searchHandle) {
      return NextResponse.json({
        error: 'No Discord handle available for merging'
      }, { status: 400 })
    }

    // Extract base handle without discriminator (e.g., "raki5629#0" -> "raki5629")
    const baseHandle = searchHandle.split('#')[0]

    // Look for legacy account
    let existingLegacyUser = null
    
    try {
      // First try exact match with full Discord handle
      const { data: legacyUser, error: legacyError } = await supabase
        .from('User')
        .select('*')
        .eq('discordHandle', searchHandle)
        .eq('email', `${searchHandle}@legacy.import`)
        .maybeSingle()

      if (!legacyError && legacyUser) {
        existingLegacyUser = legacyUser
        console.log(`Legacy account found: exact match for ${searchHandle}`)
      } else {
        // Try with base handle (without discriminator)
        const { data: legacyUserBase, error: baseError } = await supabase
          .from('User')
          .select('*')
          .eq('discordHandle', baseHandle)
          .eq('email', `${baseHandle}@legacy.import`)
          .maybeSingle()

        if (!baseError && legacyUserBase) {
          existingLegacyUser = legacyUserBase
          console.log(`Legacy account found: base handle match for ${baseHandle}`)
        }
      }
    } catch (error) {
      console.error('Error looking up legacy account:', error)
      return NextResponse.json({
        error: 'Error looking up legacy account'
      }, { status: 500 })
    }

    if (!existingLegacyUser) {
      return NextResponse.json({
        error: `No legacy account found for handle ${baseHandle}`
      }, { status: 404 })
    }

    console.log(`🔄 Merging legacy account data for ${baseHandle}`)

    try {
      // Transfer XP transactions from legacy account to real account
      const { error: transactionError } = await supabase
        .from('XpTransaction')
        .update({ userId: currentUser.id })
        .eq('userId', existingLegacyUser.id)

      if (transactionError) {
        console.error('Error transferring XP transactions:', transactionError)
        return NextResponse.json({
          error: 'Error transferring XP transactions'
        }, { status: 500 })
      } else {
        console.log('✅ Transferred XP transactions')
      }

      // Transfer WeeklyStats from legacy account to real account
      const { error: weeklyStatsError } = await supabase
        .from('WeeklyStats')
        .update({ userId: currentUser.id })
        .eq('userId', existingLegacyUser.id)

      if (weeklyStatsError) {
        console.error('Error transferring WeeklyStats:', weeklyStatsError)
        return NextResponse.json({
          error: 'Error transferring WeeklyStats'
        }, { status: 500 })
      } else {
        console.log('✅ Transferred WeeklyStats')
      }

      // Recalculate totalXp from transferred transactions to avoid duplicate XP
      const { data: userTransactions } = await supabase
        .from('XpTransaction')
        .select('amount')
        .eq('userId', currentUser.id)

      const calculatedTotalXp = userTransactions?.reduce((sum, tx) => sum + tx.amount, 0) || 0

      // Update user's totalXp with calculated value
      await supabase
        .from('User')
        .update({ 
          totalXp: calculatedTotalXp,
          discordHandle: baseHandle // Update to base handle for consistency
        })
        .eq('id', currentUser.id)

      console.log(`✅ Recalculated totalXp: ${calculatedTotalXp} from ${userTransactions?.length || 0} transactions`)

      // Now clean up the legacy account
      console.log(`Cleaning up legacy account for ${baseHandle}`)
      const { error: deleteError } = await supabase
        .from('User')
        .delete()
        .eq('id', existingLegacyUser.id)

      if (deleteError) {
        console.error('Error deleting legacy account:', deleteError)
        return NextResponse.json({
          error: 'Error cleaning up legacy account'
        }, { status: 500 })
      } else {
        console.log('✅ Legacy account cleaned up successfully')
      }

      return NextResponse.json({
        success: true,
        message: `Successfully merged legacy account for ${baseHandle}`,
        mergedXp: calculatedTotalXp,
        transactionsTransferred: userTransactions?.length || 0,
        legacyAccountId: existingLegacyUser.id
      })

    } catch (mergeError) {
      console.error('Error during account merge:', mergeError)
      return NextResponse.json({
        error: 'Error during account merge'
      }, { status: 500 })
    }

  } catch (error) {
    console.error('Manual merge error:', error)
    return NextResponse.json({
      error: 'Internal server error during merge'
    }, { status: 500 })
  }
})
