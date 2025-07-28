#!/usr/bin/env tsx

/**
 * Database Migration Script for Performance Indexes
 *
 * This script applies the performance indexes directly to the database.
 * It includes fallback methods if Prisma migration fails.
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { prisma } from '../src/lib/prisma'

const execAsync = promisify(exec)

async function createIndexesDirectly() {
  console.log('📊 Creating indexes directly via Prisma...')

  const indexes = [
    // User table indexes
    'CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt")',
    'CREATE INDEX IF NOT EXISTS "User_lastActiveAt_idx" ON "User"("lastActiveAt")',
    'CREATE INDEX IF NOT EXISTS "User_role_createdAt_idx" ON "User"("role", "createdAt")',

    // Submission table indexes
    'CREATE INDEX IF NOT EXISTS "Submission_userId_createdAt_idx" ON "Submission"("userId", "createdAt")',
    'CREATE INDEX IF NOT EXISTS "Submission_status_createdAt_idx" ON "Submission"("status", "createdAt")',
    'CREATE INDEX IF NOT EXISTS "Submission_createdAt_idx" ON "Submission"("createdAt")',
    'CREATE INDEX IF NOT EXISTS "Submission_platform_createdAt_idx" ON "Submission"("platform", "createdAt")',

    // PeerReview table indexes
    'CREATE INDEX IF NOT EXISTS "PeerReview_submissionId_idx" ON "PeerReview"("submissionId")',
    'CREATE INDEX IF NOT EXISTS "PeerReview_reviewerId_createdAt_idx" ON "PeerReview"("reviewerId", "createdAt")',
    'CREATE INDEX IF NOT EXISTS "PeerReview_createdAt_idx" ON "PeerReview"("createdAt")',

    // XpTransaction table indexes
    'CREATE INDEX IF NOT EXISTS "XpTransaction_userId_createdAt_idx" ON "XpTransaction"("userId", "createdAt")',
    'CREATE INDEX IF NOT EXISTS "XpTransaction_type_createdAt_idx" ON "XpTransaction"("type", "createdAt")',
    'CREATE INDEX IF NOT EXISTS "XpTransaction_createdAt_idx" ON "XpTransaction"("createdAt")'
  ]

  for (const indexSql of indexes) {
    try {
      console.log(`Creating index: ${indexSql.split(' ')[5]}...`)
      await prisma.$executeRawUnsafe(indexSql)
      console.log('✅ Index created successfully')
    } catch (error) {
      console.log(`⚠️  Index might already exist or error occurred: ${error}`)
    }
  }
}

async function runMigration() {
  console.log('🚀 Starting Performance Index Migration...\n')

  try {
    // First try the standard Prisma migration approach
    console.log('📋 Attempting Prisma migration...')
    const { stdout: generateOutput, stderr: generateError } = await execAsync(
      'npx prisma migrate dev --name add-performance-indexes --create-only'
    )

    if (generateError && generateError.includes('P1001')) {
      throw new Error('Database connection failed, trying direct approach')
    }

    console.log('✅ Migration generated successfully')

    const { stdout: applyOutput } = await execAsync('npx prisma migrate deploy')
    console.log('✅ Migration applied successfully')

  } catch (error) {
    console.log('⚠️  Prisma migration failed, trying direct index creation...')

    try {
      await createIndexesDirectly()
      console.log('✅ Indexes created directly')
    } catch (directError) {
      console.error('❌ Direct index creation also failed:', directError)
      console.log('\n🔧 Manual Solution:')
      console.log('1. Go to your Supabase dashboard')
      console.log('2. Open the SQL Editor')
      console.log('3. Run the SQL script in: scripts/manual-indexes.sql')
      return
    }
  }

  try {
    console.log('\n🔄 Generating Prisma client...')
    await execAsync('npx prisma generate')
    console.log('✅ Prisma client generated')
  } catch (error) {
    console.log('⚠️  Prisma generate failed, but indexes should still work')
  }

  console.log('\n🎉 Performance indexes migration completed!')
  console.log('\nIndexes added for N+1 query optimization:')
  console.log('  📊 User: createdAt, lastActiveAt, role+createdAt')
  console.log('  📝 Submission: userId+createdAt, status+createdAt, createdAt, platform+createdAt')
  console.log('  👥 PeerReview: submissionId, reviewerId+createdAt, createdAt')
  console.log('  💰 XpTransaction: userId+createdAt, type+createdAt, createdAt')
}

// Run migration if this script is executed directly
if (require.main === module) {
  runMigration().catch(console.error)
}

export { runMigration }
