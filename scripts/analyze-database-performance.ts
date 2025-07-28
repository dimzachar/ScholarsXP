#!/usr/bin/env tsx

/**
 * Database Performance Analysis Script
 * 
 * This script analyzes database performance by:
 * 1. Checking index usage for common queries
 * 2. Identifying slow queries
 * 3. Analyzing table statistics
 * 4. Recommending index optimizations
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'info' },
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
  ],
})

interface QueryAnalysis {
  query: string
  description: string
  executionTime?: number
  indexUsage?: string
}

interface IndexRecommendation {
  table: string
  columns: string[]
  reason: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
}

class DatabaseAnalyzer {
  private queryLog: QueryAnalysis[] = []
  private recommendations: IndexRecommendation[] = []

  constructor() {
    // Log all queries for analysis
    prisma.$on('query', (e) => {
      this.queryLog.push({
        query: e.query,
        description: 'Logged query',
        executionTime: e.duration
      })
    })
  }

  async analyzeCommonQueries() {
    console.log('🔍 Analyzing common query patterns...\n')

    // Test analytics queries (from our optimized admin analytics)
    await this.analyzeAnalyticsQueries()
    
    // Test user activity queries
    await this.analyzeUserActivityQueries()
    
    // Test submission queries
    await this.analyzeSubmissionQueries()
    
    // Test leaderboard queries
    await this.analyzeLeaderboardQueries()
  }

  private async analyzeAnalyticsQueries() {
    console.log('📊 Analytics Queries Analysis:')
    
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    try {
      // Test the optimized analytics query
      const start = performance.now()
      const result = await prisma.$queryRaw`
        SELECT
          (SELECT COUNT(*) FROM "User") as total_users,
          (SELECT COUNT(*) FROM "User" WHERE "lastActiveAt" >= ${weekAgo}) as active_users,
          (SELECT COUNT(*) FROM "Submission" WHERE "createdAt" >= ${startDate}) as total_submissions,
          (SELECT COUNT(*) FROM "Submission" WHERE "status" = 'FINALIZED' AND "createdAt" >= ${startDate}) as completed_submissions,
          (SELECT COUNT(*) FROM "PeerReview" WHERE "createdAt" >= ${startDate}) as total_reviews
      `
      const duration = performance.now() - start

      console.log(`  ✅ Core metrics query: ${duration.toFixed(2)}ms`)
      
      if (duration > 100) {
        this.recommendations.push({
          table: 'User',
          columns: ['lastActiveAt', 'createdAt'],
          reason: 'Analytics queries are slow - composite index needed',
          priority: 'HIGH'
        })
      }

    } catch (error) {
      console.log(`  ❌ Analytics query failed: ${error.message}`)
    }
  }

  private async analyzeUserActivityQueries() {
    console.log('\n👤 User Activity Queries Analysis:')

    try {
      // Test user profile query
      const start = performance.now()
      const users = await prisma.user.findMany({
        take: 10,
        include: {
          submissions: {
            take: 5,
            orderBy: { createdAt: 'desc' }
          },
          peerReviews: {
            take: 5,
            orderBy: { createdAt: 'desc' }
          }
        }
      })
      const duration = performance.now() - start

      console.log(`  ✅ User profile with relations: ${duration.toFixed(2)}ms`)

      if (duration > 50) {
        this.recommendations.push({
          table: 'Submission',
          columns: ['userId', 'createdAt'],
          reason: 'User activity queries could benefit from composite index',
          priority: 'MEDIUM'
        })
      }

    } catch (error) {
      console.log(`  ❌ User activity query failed: ${error.message}`)
    }
  }

  private async analyzeSubmissionQueries() {
    console.log('\n📝 Submission Queries Analysis:')

    try {
      // Test submission filtering by status and date
      const start = performance.now()
      const submissions = await prisma.submission.findMany({
        where: {
          status: 'FINALIZED',
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        },
        take: 100,
        orderBy: { createdAt: 'desc' }
      })
      const duration = performance.now() - start

      console.log(`  ✅ Status + date filtering: ${duration.toFixed(2)}ms`)

      // Test platform analytics
      const platformStart = performance.now()
      const platformStats = await prisma.submission.groupBy({
        by: ['platform'],
        _count: true,
        where: {
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        }
      })
      const platformDuration = performance.now() - platformStart

      console.log(`  ✅ Platform grouping: ${platformDuration.toFixed(2)}ms`)

    } catch (error) {
      console.log(`  ❌ Submission query failed: ${error.message}`)
    }
  }

  private async analyzeLeaderboardQueries() {
    console.log('\n🏆 Leaderboard Queries Analysis:')

    try {
      // Test top users by XP
      const start = performance.now()
      const topUsers = await prisma.user.findMany({
        select: {
          id: true,
          username: true,
          totalXp: true,
          _count: {
            select: {
              submissions: true,
              peerReviews: true
            }
          }
        },
        orderBy: { totalXp: 'desc' },
        take: 10
      })
      const duration = performance.now() - start

      console.log(`  ✅ Top users leaderboard: ${duration.toFixed(2)}ms`)

      if (duration > 30) {
        this.recommendations.push({
          table: 'User',
          columns: ['totalXp'],
          reason: 'Leaderboard queries need totalXp index',
          priority: 'MEDIUM'
        })
      }

    } catch (error) {
      console.log(`  ❌ Leaderboard query failed: ${error.message}`)
    }
  }

  async analyzeTableStatistics() {
    console.log('\n📈 Table Statistics Analysis:')

    try {
      // Get table sizes and row counts
      const tableStats = await prisma.$queryRaw<Array<{
        table_name: string
        row_count: bigint
        table_size: string
        index_size: string
      }>>`
        SELECT 
          schemaname||'.'||tablename as table_name,
          n_tup_ins - n_tup_del as row_count,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as table_size,
          pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as index_size
        FROM pg_stat_user_tables 
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
      `

      console.log('  Table Statistics:')
      tableStats.forEach(stat => {
        console.log(`    ${stat.table_name}: ${Number(stat.row_count)} rows, ${stat.table_size} total, ${stat.index_size} indexes`)
      })

    } catch (error) {
      console.log(`  ❌ Table statistics query failed: ${error.message}`)
    }
  }

  async checkIndexUsage() {
    console.log('\n🔍 Index Usage Analysis:')

    try {
      // Check index usage statistics
      const indexStats = await prisma.$queryRaw<Array<{
        table_name: string
        index_name: string
        index_scans: bigint
        tuples_read: bigint
        tuples_fetched: bigint
      }>>`
        SELECT 
          schemaname||'.'||tablename as table_name,
          indexname as index_name,
          idx_scan as index_scans,
          idx_tup_read as tuples_read,
          idx_tup_fetch as tuples_fetched
        FROM pg_stat_user_indexes 
        WHERE schemaname = 'public'
        ORDER BY idx_scan DESC
      `

      console.log('  Most Used Indexes:')
      indexStats.slice(0, 10).forEach(stat => {
        console.log(`    ${stat.index_name} (${stat.table_name}): ${Number(stat.index_scans)} scans`)
      })

      // Find unused indexes
      const unusedIndexes = indexStats.filter(stat => Number(stat.index_scans) === 0)
      if (unusedIndexes.length > 0) {
        console.log('\n  ⚠️  Unused Indexes:')
        unusedIndexes.forEach(stat => {
          console.log(`    ${stat.index_name} (${stat.table_name}): Never used`)
        })
      }

    } catch (error) {
      console.log(`  ❌ Index usage query failed: ${error.message}`)
    }
  }

  generateRecommendations() {
    console.log('\n💡 Index Optimization Recommendations:')
    
    if (this.recommendations.length === 0) {
      console.log('  ✅ No additional indexes recommended - current schema is well optimized!')
      return
    }

    this.recommendations.forEach((rec, index) => {
      const priority = rec.priority === 'HIGH' ? '🔴' : rec.priority === 'MEDIUM' ? '🟡' : '🟢'
      console.log(`  ${priority} ${index + 1}. ${rec.table} table:`)
      console.log(`     Add index on: [${rec.columns.join(', ')}]`)
      console.log(`     Reason: ${rec.reason}`)
      console.log(`     Priority: ${rec.priority}\n`)
    })
  }

  async generateMigrationScript() {
    if (this.recommendations.length === 0) return

    console.log('\n📝 Suggested Migration Script:')
    console.log('```sql')
    
    this.recommendations.forEach((rec, index) => {
      const indexName = `idx_${rec.table.toLowerCase()}_${rec.columns.join('_').toLowerCase()}`
      console.log(`-- ${rec.reason}`)
      console.log(`CREATE INDEX CONCURRENTLY ${indexName} ON "${rec.table}" (${rec.columns.map(col => `"${col}"`).join(', ')});`)
      console.log('')
    })
    
    console.log('```')
  }
}

async function main() {
  console.log('🚀 Starting Database Performance Analysis...\n')
  
  const analyzer = new DatabaseAnalyzer()
  
  try {
    await analyzer.analyzeCommonQueries()
    await analyzer.analyzeTableStatistics()
    await analyzer.checkIndexUsage()
    analyzer.generateRecommendations()
    await analyzer.generateMigrationScript()
    
    console.log('\n✅ Database analysis completed!')
    
  } catch (error) {
    console.error('❌ Analysis failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  main().catch(console.error)
}

export { DatabaseAnalyzer }
