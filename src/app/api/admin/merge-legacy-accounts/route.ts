import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase-server'

/**
 * One-time migration to merge existing Discord users with their legacy accounts
 * This handles users who signed in before the automatic merging was implemented
 */
export const POST = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    console.log('🔄 Starting legacy account merge for existing Discord users...')

    const supabase = createServiceClient()

    // Find Discord users who might have legacy accounts to merge
    const { data: discordUsers, error: discordError } = await supabase
      .from('User')
      .select('*')
      .not('discordId', 'is', null)
      .not('email', 'like', '%@legacy.import')

    if (discordError) {
      console.error('Error fetching Discord users:', discordError)
      return NextResponse.json({ error: 'Failed to fetch Discord users' }, { status: 500 })
    }

    console.log(`📊 Found ${discordUsers?.length || 0} Discord users to check`)

    let mergedCount = 0
    let skippedCount = 0
    const results = []

    for (const discordUser of discordUsers || []) {
      try {
        // Skip if user doesn't have a username that could match a legacy account
        if (!discordUser.username) {
          skippedCount++
          continue
        }

        // Look for legacy account with matching username
        const { data: legacyUser, error: legacyError } = await supabase
          .from('User')
          .select('*')
          .eq('discordHandle', discordUser.username)
          .eq('email', `${discordUser.username}@legacy.import`)
          .single()

        if (legacyError || !legacyUser) {
          // No legacy account found, skip
          skippedCount++
          continue
        }

        console.log(`🔄 Merging legacy account for ${discordUser.username}`)

        // Transfer XP data to Discord user
        const { error: updateError } = await supabase
          .from('User')
          .update({
            totalXp: legacyUser.totalXp,
            currentWeekXp: legacyUser.currentWeekXp,
            streakWeeks: legacyUser.streakWeeks,
            missedReviews: legacyUser.missedReviews,
            discordHandle: discordUser.username // Ensure discordHandle is set
          })
          .eq('id', discordUser.id)

        if (updateError) {
          console.error(`❌ Error updating Discord user ${discordUser.username}:`, updateError)
          results.push({
            username: discordUser.username,
            status: 'error',
            message: `Failed to update user: ${updateError.message}`
          })
          continue
        }

        // Transfer XP transactions
        const { error: transactionError } = await supabase
          .from('XpTransaction')
          .update({ userId: discordUser.id })
          .eq('userId', legacyUser.id)

        if (transactionError) {
          console.error(`❌ Error transferring XP transactions for ${discordUser.username}:`, transactionError)
        }

        // Transfer WeeklyStats
        const { error: weeklyStatsError } = await supabase
          .from('WeeklyStats')
          .update({ userId: discordUser.id })
          .eq('userId', legacyUser.id)

        if (weeklyStatsError) {
          console.error(`❌ Error transferring WeeklyStats for ${discordUser.username}:`, weeklyStatsError)
        }

        // Delete legacy account
        const { error: deleteError } = await supabase
          .from('User')
          .delete()
          .eq('id', legacyUser.id)

        if (deleteError) {
          console.error(`❌ Error deleting legacy account for ${discordUser.username}:`, deleteError)
        }

        mergedCount++
        results.push({
          username: discordUser.username,
          status: 'merged',
          message: `Successfully merged ${legacyUser.totalXp} XP from legacy account`
        })

        console.log(`✅ Successfully merged legacy account for ${discordUser.username}`)

      } catch (error) {
        console.error(`❌ Error processing ${discordUser.username}:`, error)
        results.push({
          username: discordUser.username,
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    const summary = {
      message: 'Legacy account merge completed',
      totalDiscordUsers: discordUsers?.length || 0,
      mergedAccounts: mergedCount,
      skippedAccounts: skippedCount,
      results
    }

    console.log('📈 Merge Summary:', summary)

    return NextResponse.json(summary)

  } catch (error) {
    console.error('❌ Error in legacy account merge:', error)
    return NextResponse.json(
      { 
        error: 'Failed to merge legacy accounts',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
})
