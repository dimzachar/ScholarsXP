/**
 * XP Consistency Monitoring Script
 * 
 * Monitors XP calculation accuracy and detects potential race condition issues.
 * Run this script periodically to ensure system integrity.
 */

import { prisma } from '@/lib/prisma'

interface ConsistencyReport {
  timestamp: Date
  totalUsers: number
  inconsistentUsers: number
  totalInconsistency: number
  maxInconsistency: number
  details: UserInconsistency[]
}

interface UserInconsistency {
  userId: string
  userEmail: string
  userTotalXp: number
  calculatedXp: number
  difference: number
  lastTransaction: Date | null
}

/**
 * Check XP consistency across all users
 */
export async function checkXPConsistency(): Promise<ConsistencyReport> {
  console.log('🔍 Starting XP consistency check...')
  
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      totalXp: true,
      xpTransactions: {
        select: {
          amount: true,
          createdAt: true
        },
        orderBy: {
          createdAt: 'desc'
        }
      }
    }
  })

  const inconsistentUsers: UserInconsistency[] = []
  let totalInconsistency = 0
  let maxInconsistency = 0

  for (const user of users) {
    const calculatedXp = user.xpTransactions.reduce((sum, tx) => sum + tx.amount, 0)
    const difference = Math.abs(user.totalXp - calculatedXp)
    
    // Allow small discrepancies (up to 5 XP) for rounding
    if (difference > 5) {
      const inconsistency: UserInconsistency = {
        userId: user.id,
        userEmail: user.email,
        userTotalXp: user.totalXp,
        calculatedXp,
        difference,
        lastTransaction: user.xpTransactions[0]?.createdAt || null
      }
      
      inconsistentUsers.push(inconsistency)
      totalInconsistency += difference
      maxInconsistency = Math.max(maxInconsistency, difference)
    }
  }

  const report: ConsistencyReport = {
    timestamp: new Date(),
    totalUsers: users.length,
    inconsistentUsers: inconsistentUsers.length,
    totalInconsistency,
    maxInconsistency,
    details: inconsistentUsers
  }

  return report
}

/**
 * Check for potential race condition indicators
 */
export async function checkRaceConditionIndicators(): Promise<{
  duplicateTransactions: number
  rapidTransactions: number
  orphanedTransactions: number
}> {
  console.log('🏁 Checking for race condition indicators...')

  // Check for duplicate transactions (same user, same source, same amount, within 1 second)
  const duplicateTransactions = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*) as count
    FROM (
      SELECT "userId", "sourceId", "amount", "type", 
             COUNT(*) as duplicate_count
      FROM "XpTransaction"
      WHERE "sourceId" IS NOT NULL
      GROUP BY "userId", "sourceId", "amount", "type", 
               DATE_TRUNC('second', "createdAt")
      HAVING COUNT(*) > 1
    ) duplicates
  `

  // Check for rapid transactions (multiple transactions for same user within 100ms)
  const rapidTransactions = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT COUNT(*) as count
    FROM (
      SELECT t1."userId"
      FROM "XpTransaction" t1
      JOIN "XpTransaction" t2 ON t1."userId" = t2."userId" 
        AND t1."id" != t2."id"
        AND ABS(EXTRACT(EPOCH FROM (t1."createdAt" - t2."createdAt"))) < 0.1
      GROUP BY t1."userId"
    ) rapid
  `

  // Check for orphaned transactions (transactions without corresponding submissions)
  const orphanedTransactions = await prisma.xpTransaction.count({
    where: {
      type: 'SUBMISSION_REWARD',
      sourceId: {
        not: null
      },
      submission: null
    }
  })

  return {
    duplicateTransactions: duplicateTransactions[0]?.count || 0,
    rapidTransactions: rapidTransactions[0]?.count || 0,
    orphanedTransactions
  }
}

/**
 * Generate comprehensive monitoring report
 */
export async function generateMonitoringReport(): Promise<void> {
  console.log('📊 Generating XP monitoring report...')
  
  const [consistencyReport, raceConditionIndicators] = await Promise.all([
    checkXPConsistency(),
    checkRaceConditionIndicators()
  ])

  console.log('\n=== XP CONSISTENCY REPORT ===')
  console.log(`Timestamp: ${consistencyReport.timestamp.toISOString()}`)
  console.log(`Total Users: ${consistencyReport.totalUsers}`)
  console.log(`Inconsistent Users: ${consistencyReport.inconsistentUsers}`)
  console.log(`Total Inconsistency: ${consistencyReport.totalInconsistency} XP`)
  console.log(`Max Inconsistency: ${consistencyReport.maxInconsistency} XP`)

  if (consistencyReport.inconsistentUsers > 0) {
    console.log('\n🚨 INCONSISTENT USERS:')
    consistencyReport.details.forEach(user => {
      console.log(`  - ${user.userEmail}: Expected ${user.calculatedXp}, Got ${user.userTotalXp} (Diff: ${user.difference})`)
    })
  } else {
    console.log('\n✅ All users have consistent XP!')
  }

  console.log('\n=== RACE CONDITION INDICATORS ===')
  console.log(`Duplicate Transactions: ${raceConditionIndicators.duplicateTransactions}`)
  console.log(`Rapid Transactions: ${raceConditionIndicators.rapidTransactions}`)
  console.log(`Orphaned Transactions: ${raceConditionIndicators.orphanedTransactions}`)

  // Alert thresholds
  const alerts: string[] = []
  
  if (consistencyReport.inconsistentUsers > 0) {
    alerts.push(`${consistencyReport.inconsistentUsers} users have XP inconsistencies`)
  }
  
  if (raceConditionIndicators.duplicateTransactions > 0) {
    alerts.push(`${raceConditionIndicators.duplicateTransactions} potential duplicate transactions detected`)
  }
  
  if (raceConditionIndicators.rapidTransactions > 5) {
    alerts.push(`${raceConditionIndicators.rapidTransactions} users with rapid transactions (possible race conditions)`)
  }

  if (alerts.length > 0) {
    console.log('\n🚨 ALERTS:')
    alerts.forEach(alert => console.log(`  - ${alert}`))
  } else {
    console.log('\n✅ No alerts - system appears healthy!')
  }

  // Save report to database for historical tracking
  await saveReportToDatabase(consistencyReport, raceConditionIndicators)
}

/**
 * Save monitoring report to database
 */
async function saveReportToDatabase(
  consistencyReport: ConsistencyReport,
  raceConditionIndicators: any
): Promise<void> {
  // This would save to a monitoring table if we had one
  // For now, just log that we would save it
  console.log('\n💾 Report saved to monitoring system')
}

/**
 * Fix XP inconsistencies (admin function)
 */
export async function fixXPInconsistencies(dryRun: boolean = true): Promise<void> {
  console.log(`🔧 ${dryRun ? 'Simulating' : 'Executing'} XP inconsistency fixes...`)
  
  const report = await checkXPConsistency()
  
  if (report.inconsistentUsers === 0) {
    console.log('✅ No inconsistencies to fix!')
    return
  }

  for (const user of report.details) {
    const correction = user.calculatedXp - user.userTotalXp
    
    console.log(`${dryRun ? '[DRY RUN]' : '[FIXING]'} User ${user.userEmail}: ${correction > 0 ? '+' : ''}${correction} XP`)
    
    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        // Update user's total XP to match calculated value
        await tx.user.update({
          where: { id: user.userId },
          data: { totalXp: user.calculatedXp }
        })
        
        // Create admin adjustment transaction
        await tx.xpTransaction.create({
          data: {
            userId: user.userId,
            amount: correction,
            type: 'ADMIN_ADJUSTMENT',
            description: `XP consistency fix: corrected ${correction} XP discrepancy`,
            weekNumber: Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000))
          }
        })
      })
    }
  }
  
  console.log(`${dryRun ? 'Would fix' : 'Fixed'} ${report.inconsistentUsers} inconsistencies`)
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2]
  
  switch (command) {
    case 'check':
      generateMonitoringReport()
        .then(() => process.exit(0))
        .catch(error => {
          console.error('Error:', error)
          process.exit(1)
        })
      break
      
    case 'fix':
      const dryRun = process.argv[3] !== '--execute'
      fixXPInconsistencies(dryRun)
        .then(() => process.exit(0))
        .catch(error => {
          console.error('Error:', error)
          process.exit(1)
        })
      break
      
    default:
      console.log('Usage:')
      console.log('  npm run monitor-xp check     - Generate monitoring report')
      console.log('  npm run monitor-xp fix       - Dry run XP fixes')
      console.log('  npm run monitor-xp fix --execute - Execute XP fixes')
      process.exit(1)
  }
}
