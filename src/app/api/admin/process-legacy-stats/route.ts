import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * Process legacy XP transactions and create WeeklyStats entries
 * This fixes the empty leaderboard issue after legacy data import
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Processing legacy XP transactions to create WeeklyStats entries...')

    // Get all ADMIN_ADJUSTMENT transactions (legacy imports)
    const legacyTransactions = await prisma.xpTransaction.findMany({
      where: {
        type: 'ADMIN_ADJUSTMENT'
      },
      include: {
        user: {
          select: {
            id: true,
            username: true
          }
        }
      }
    })

    console.log(`📊 Found ${legacyTransactions.length} legacy XP transactions`)

    if (legacyTransactions.length === 0) {
      return NextResponse.json({
        message: 'No legacy transactions found to process',
        processed: 0
      })
    }

    // Group transactions by userId and weekNumber
    const groupedTransactions = new Map<string, { userId: string; weekNumber: number; totalXp: number; username: string }>()

    for (const transaction of legacyTransactions) {
      const key = `${transaction.userId}-${transaction.weekNumber}`
      
      if (groupedTransactions.has(key)) {
        const existing = groupedTransactions.get(key)!
        existing.totalXp += transaction.amount
      } else {
        groupedTransactions.set(key, {
          userId: transaction.userId,
          weekNumber: transaction.weekNumber,
          totalXp: transaction.amount,
          username: transaction.user.username
        })
      }
    }

    console.log(`👥 Grouped into ${groupedTransactions.size} user-week combinations`)

    let created = 0
    let updated = 0
    let errors = 0

    // Create or update WeeklyStats entries
    for (const [key, data] of groupedTransactions) {
      try {
        // Check if WeeklyStats entry already exists
        const existingStats = await prisma.weeklyStats.findFirst({
          where: {
            userId: data.userId,
            weekNumber: data.weekNumber
          }
        })

        if (existingStats) {
          // Update existing entry
          await prisma.weeklyStats.update({
            where: { id: existingStats.id },
            data: {
              xpTotal: data.totalXp,
              reviewsDone: 0,
              reviewsMissed: 0,
              earnedStreak: data.totalXp >= 100 // Award streak if 100+ XP
            }
          })
          updated++
          console.log(`✅ Updated WeeklyStats for ${data.username} week ${data.weekNumber}: ${data.totalXp} XP`)
        } else {
          // Create new entry
          await prisma.weeklyStats.create({
            data: {
              userId: data.userId,
              weekNumber: data.weekNumber,
              xpTotal: data.totalXp,
              reviewsDone: 0,
              reviewsMissed: 0,
              earnedStreak: data.totalXp >= 100 // Award streak if 100+ XP
            }
          })
          created++
          console.log(`🆕 Created WeeklyStats for ${data.username} week ${data.weekNumber}: ${data.totalXp} XP`)
        }
      } catch (error) {
        console.error(`❌ Error processing ${data.username} week ${data.weekNumber}:`, error)
        errors++
      }
    }

    const summary = {
      message: 'Legacy stats processing completed',
      transactionsProcessed: legacyTransactions.length,
      weeklyStatsCreated: created,
      weeklyStatsUpdated: updated,
      errors: errors,
      totalProcessed: created + updated
    }

    console.log('📈 Processing Summary:', summary)

    return NextResponse.json(summary)

  } catch (error) {
    console.error('❌ Error processing legacy stats:', error)
    return NextResponse.json(
      { 
        error: 'Failed to process legacy stats',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
