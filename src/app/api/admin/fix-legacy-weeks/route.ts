import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getWeekNumber } from '@/lib/utils'

/**
 * Fix legacy data week numbers by calculating correct week numbers from submission timestamps
 * This corrects the issue where all legacy data was assigned to the current week instead of historical weeks
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Fixing legacy data week numbers based on actual submission timestamps...')

    // First, clear existing WeeklyStats entries that were created with wrong week numbers
    console.log('🗑️ Clearing existing WeeklyStats entries for legacy data...')
    await prisma.weeklyStats.deleteMany({
      where: {
        weekNumber: {
          in: [30, 2898] // Remove both current week and the incorrect week number
        }
      }
    })

    // Get all legacy submissions with their timestamps and associated users
    const legacySubmissions = await prisma.legacySubmission.findMany({
      where: {
        submittedAt: { not: null }
      },
      select: {
        id: true,
        discordHandle: true,
        submittedAt: true,
        url: true
      }
    })

    console.log(`📊 Found ${legacySubmissions.length} legacy submissions with timestamps`)

    // Get all XP transactions for legacy imports
    const xpTransactions = await prisma.xpTransaction.findMany({
      where: {
        type: 'ADMIN_ADJUSTMENT'
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            discordHandle: true
          }
        }
      }
    })

    console.log(`💰 Found ${xpTransactions.length} legacy XP transactions`)

    // Create a map of discordHandle -> XP amount
    const xpByDiscordHandle = new Map<string, { userId: string; username: string; totalXp: number }>()
    
    for (const transaction of xpTransactions) {
      const discordHandle = transaction.user.discordHandle
      if (discordHandle) {
        if (xpByDiscordHandle.has(discordHandle)) {
          const existing = xpByDiscordHandle.get(discordHandle)!
          existing.totalXp += transaction.amount
        } else {
          xpByDiscordHandle.set(discordHandle, {
            userId: transaction.user.id,
            username: transaction.user.username,
            totalXp: transaction.amount
          })
        }
      }
    }

    // Calculate correct week numbers and group by user and week
    const weeklyStatsToCreate = new Map<string, {
      userId: string
      username: string
      weekNumber: number
      xpTotal: number
      submissionCount: number
    }>()

    let processedSubmissions = 0
    let skippedSubmissions = 0

    for (const submission of legacySubmissions) {
      if (!submission.submittedAt || !submission.discordHandle) {
        skippedSubmissions++
        continue
      }

      // Calculate correct week number from submission timestamp
      const correctWeekNumber = getWeekNumber(new Date(submission.submittedAt))
      
      // Find the user's XP data
      const userXpData = xpByDiscordHandle.get(submission.discordHandle)
      if (!userXpData) {
        console.log(`⚠️ No XP data found for ${submission.discordHandle}`)
        skippedSubmissions++
        continue
      }

      // Create a key for user-week combination
      const key = `${userXpData.userId}-${correctWeekNumber}`
      
      if (weeklyStatsToCreate.has(key)) {
        // Add to existing week entry (this handles multiple submissions in same week)
        const existing = weeklyStatsToCreate.get(key)!
        existing.submissionCount += 1
        // XP is already calculated per user total, so we don't add it again
      } else {
        // Create new week entry
        weeklyStatsToCreate.set(key, {
          userId: userXpData.userId,
          username: userXpData.username,
          weekNumber: correctWeekNumber,
          xpTotal: 0, // Will be calculated based on submissions per week
          submissionCount: 1
        })
      }

      processedSubmissions++
    }

    console.log(`📈 Processed ${processedSubmissions} submissions, skipped ${skippedSubmissions}`)
    console.log(`📅 Creating WeeklyStats for ${weeklyStatsToCreate.size} user-week combinations`)

    // Now we need to distribute the total XP across the weeks based on submission count
    // First, count total submissions per user
    const submissionCountPerUser = new Map<string, number>()
    for (const [key, data] of weeklyStatsToCreate) {
      const userId = data.userId
      submissionCountPerUser.set(userId, (submissionCountPerUser.get(userId) || 0) + data.submissionCount)
    }

    // Calculate XP per week based on proportion of submissions
    for (const [key, data] of weeklyStatsToCreate) {
      const userXpData = xpByDiscordHandle.get(data.username) || 
                        Array.from(xpByDiscordHandle.values()).find(u => u.userId === data.userId)
      
      if (userXpData) {
        const totalUserSubmissions = submissionCountPerUser.get(data.userId) || 1
        const weekXpProportion = data.submissionCount / totalUserSubmissions
        data.xpTotal = Math.round(userXpData.totalXp * weekXpProportion)
      }
    }

    // Create WeeklyStats entries
    let created = 0
    let errors = 0

    for (const [key, data] of weeklyStatsToCreate) {
      try {
        await prisma.weeklyStats.create({
          data: {
            userId: data.userId,
            weekNumber: data.weekNumber,
            xpTotal: data.xpTotal,
            reviewsDone: 0,
            reviewsMissed: 0,
            earnedStreak: data.xpTotal >= 100
          }
        })
        created++
        console.log(`✅ Created WeeklyStats for ${data.username} week ${data.weekNumber}: ${data.xpTotal} XP (${data.submissionCount} submissions)`)
      } catch (error) {
        console.error(`❌ Error creating WeeklyStats for ${data.username} week ${data.weekNumber}:`, error)
        errors++
      }
    }

    // Update XP transactions with correct week numbers
    console.log('🔄 Updating XP transaction week numbers...')
    let updatedTransactions = 0

    for (const transaction of xpTransactions) {
      if (!transaction.user.discordHandle) continue

      // Find a legacy submission for this user to get the week number
      const userSubmission = legacySubmissions.find(s => s.discordHandle === transaction.user.discordHandle)
      if (userSubmission && userSubmission.submittedAt) {
        const correctWeekNumber = getWeekNumber(new Date(userSubmission.submittedAt))
        
        try {
          await prisma.xpTransaction.update({
            where: { id: transaction.id },
            data: { weekNumber: correctWeekNumber }
          })
          updatedTransactions++
        } catch (error) {
          console.error(`❌ Error updating transaction ${transaction.id}:`, error)
        }
      }
    }

    const summary = {
      message: 'Legacy week numbers fixed successfully',
      legacySubmissionsProcessed: processedSubmissions,
      legacySubmissionsSkipped: skippedSubmissions,
      weeklyStatsCreated: created,
      xpTransactionsUpdated: updatedTransactions,
      errors: errors,
      weekRangeInfo: {
        earliestWeek: Math.min(...Array.from(weeklyStatsToCreate.values()).map(w => w.weekNumber)),
        latestWeek: Math.max(...Array.from(weeklyStatsToCreate.values()).map(w => w.weekNumber)),
        totalWeeks: new Set(Array.from(weeklyStatsToCreate.values()).map(w => w.weekNumber)).size
      }
    }

    console.log('📊 Fix Summary:', summary)
    return NextResponse.json(summary)

  } catch (error) {
    console.error('❌ Error fixing legacy week numbers:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fix legacy week numbers',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
