import { NextRequest, NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { prisma } from '@/lib/prisma'

/**
 * Clean up legacy data and users
 * This will delete all legacy submissions, legacy users, and related data
 */
export const POST = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    console.log('🧹 Starting legacy data cleanup...')

    const results = {
      legacySubmissions: 0,
      legacyUsers: 0,
      xpTransactions: 0,
      weeklyStats: 0,
      errors: [] as string[]
    }

    // 1. Delete all legacy submissions
    try {
      const deletedSubmissions = await prisma.legacySubmission.deleteMany({})
      results.legacySubmissions = deletedSubmissions.count
      console.log(`✅ Deleted ${deletedSubmissions.count} legacy submissions`)
    } catch (error) {
      const errorMsg = `Error deleting legacy submissions: ${error}`
      console.error(errorMsg)
      results.errors.push(errorMsg)
    }

    // 2. Find and delete legacy users (users with @legacy.import emails)
    try {
      // First get the legacy users to see what we're deleting
      const legacyUsers = await prisma.user.findMany({
        where: {
          email: {
            endsWith: '@legacy.import'
          }
        },
        select: {
          id: true,
          username: true,
          email: true,
          totalXp: true
        }
      })

      console.log(`Found ${legacyUsers.length} legacy users to delete:`)
      legacyUsers.forEach(user => {
        console.log(`  - ${user.username} (${user.email}) - ${user.totalXp} XP`)
      })

      if (legacyUsers.length > 0) {
        const legacyUserIds = legacyUsers.map(u => u.id)

        // Delete related XP transactions first
        const deletedTransactions = await prisma.xpTransaction.deleteMany({
          where: {
            userId: {
              in: legacyUserIds
            }
          }
        })
        results.xpTransactions = deletedTransactions.count
        console.log(`✅ Deleted ${deletedTransactions.count} XP transactions for legacy users`)

        // Delete related weekly stats
        const deletedWeeklyStats = await prisma.weeklyStats.deleteMany({
          where: {
            userId: {
              in: legacyUserIds
            }
          }
        })
        results.weeklyStats = deletedWeeklyStats.count
        console.log(`✅ Deleted ${deletedWeeklyStats.count} weekly stats for legacy users`)

        // Finally delete the legacy users
        const deletedUsers = await prisma.user.deleteMany({
          where: {
            email: {
              endsWith: '@legacy.import'
            }
          }
        })
        results.legacyUsers = deletedUsers.count
        console.log(`✅ Deleted ${deletedUsers.count} legacy users`)
      }
    } catch (error) {
      const errorMsg = `Error deleting legacy users: ${error}`
      console.error(errorMsg)
      results.errors.push(errorMsg)
    }

    // 3. Clean up any orphaned XP transactions with PEER_REVIEW type that might be from legacy imports
    try {
      const orphanedTransactions = await prisma.xpTransaction.deleteMany({
        where: {
          description: {
            contains: 'Legacy'
          },
          type: 'PEER_REVIEW'
        }
      })
      console.log(`✅ Cleaned up ${orphanedTransactions.count} orphaned legacy XP transactions`)
    } catch (error) {
      console.log(`Note: Could not clean orphaned transactions: ${error}`)
    }

    console.log('🎉 Legacy data cleanup completed!')
    console.log('Summary:', results)

    return NextResponse.json({
      success: true,
      message: 'Legacy data cleanup completed successfully',
      results
    })

  } catch (error) {
    console.error('❌ Error during legacy cleanup:', error)
    return NextResponse.json({
      success: false,
      message: 'Failed to cleanup legacy data',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
})

/**
 * Get preview of what will be deleted
 */
export const GET = withPermission('admin_access')(async (request: AuthenticatedRequest) => {
  try {
    // Count legacy submissions
    const legacySubmissionCount = await prisma.legacySubmission.count()

    // Find legacy users
    const legacyUsers = await prisma.user.findMany({
      where: {
        email: {
          endsWith: '@legacy.import'
        }
      },
      select: {
        id: true,
        username: true,
        email: true,
        totalXp: true,
        _count: {
          select: {
            xpTransactions: true,
            weeklyStats: true
          }
        }
      }
    })

    const totalXpTransactions = legacyUsers.reduce((sum, user) => sum + user._count.xpTransactions, 0)
    const totalWeeklyStats = legacyUsers.reduce((sum, user) => sum + user._count.weeklyStats, 0)

    return NextResponse.json({
      preview: {
        legacySubmissions: legacySubmissionCount,
        legacyUsers: legacyUsers.length,
        xpTransactions: totalXpTransactions,
        weeklyStats: totalWeeklyStats
      },
      legacyUsers: legacyUsers.map(user => ({
        username: user.username,
        email: user.email,
        totalXp: user.totalXp,
        xpTransactions: user._count.xpTransactions,
        weeklyStats: user._count.weeklyStats
      }))
    })

  } catch (error) {
    console.error('Error getting cleanup preview:', error)
    return NextResponse.json({
      success: false,
      message: 'Failed to get cleanup preview',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
})
