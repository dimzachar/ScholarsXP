#!/usr/bin/env ts-node

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkIndexes() {
  console.log('🔍 Checking Database Indexes...\n')

  try {
    // Check if our performance indexes exist
    const indexes = await prisma.$queryRaw<Array<{
      schemaname: string
      tablename: string
      indexname: string
      indexdef: string
    }>>`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND indexname LIKE 'idx_%'
      ORDER BY tablename, indexname;
    `

    console.log('📊 Found Performance Indexes:')
    console.log('=' .repeat(80))
    
    const indexesByTable = new Map<string, Array<any>>()
    
    indexes.forEach(index => {
      if (!indexesByTable.has(index.tablename)) {
        indexesByTable.set(index.tablename, [])
      }
      indexesByTable.get(index.tablename)!.push(index)
    })
    
    indexesByTable.forEach((tableIndexes, tableName) => {
      console.log(`\n📋 Table: ${tableName}`)
      tableIndexes.forEach(index => {
        console.log(`  ✅ ${index.indexname}`)
        console.log(`     ${index.indexdef}`)
      })
    })
    
    // Check for our critical indexes
    const criticalIndexes = [
      'idx_user_totalxp_desc',
      'idx_user_role_totalxp',
      'idx_submission_status_created_admin',
      'idx_submission_user_status_created',
      'idx_submission_finalxp_status',
      'idx_peerreview_submission_reviewer',
      'idx_xptransaction_user_type_amount'
    ]
    
    console.log('\n🎯 Critical Index Status:')
    console.log('=' .repeat(50))
    
    const foundIndexNames = indexes.map(idx => idx.indexname)
    
    criticalIndexes.forEach(indexName => {
      const exists = foundIndexNames.includes(indexName)
      console.log(`${exists ? '✅' : '❌'} ${indexName}`)
    })
    
    const missingIndexes = criticalIndexes.filter(name => !foundIndexNames.includes(name))
    
    if (missingIndexes.length > 0) {
      console.log('\n⚠️ Missing Critical Indexes:')
      missingIndexes.forEach(name => {
        console.log(`  ❌ ${name}`)
      })
      
      console.log('\n💡 To create missing indexes, run:')
      console.log('   npx ts-node scripts/create-critical-indexes.ts')
    } else {
      console.log('\n🎉 All critical indexes are present!')
    }
    
    // Check index sizes
    console.log('\n📏 Index Sizes:')
    console.log('=' .repeat(40))
    
    const indexSizes = await prisma.$queryRaw<Array<{
      indexname: string
      size_mb: number
    }>>`
      SELECT 
        indexname,
        ROUND(pg_relation_size(indexname::regclass) / 1024.0 / 1024.0, 2) as size_mb
      FROM pg_indexes 
      WHERE schemaname = 'public' 
        AND indexname LIKE 'idx_%'
      ORDER BY pg_relation_size(indexname::regclass) DESC;
    `
    
    indexSizes.forEach(index => {
      console.log(`  📊 ${index.indexname}: ${index.size_mb} MB`)
    })
    
    // Test query performance with EXPLAIN
    console.log('\n🔍 Query Performance Analysis:')
    console.log('=' .repeat(50))
    
    const explainResult = await prisma.$queryRaw<Array<{
      'QUERY PLAN': string
    }>>`
      EXPLAIN (ANALYZE, BUFFERS) 
      SELECT COUNT(*) FROM "User" WHERE role != 'ADMIN' ORDER BY "totalXp" DESC LIMIT 50;
    `
    
    console.log('📊 User Query Plan:')
    explainResult.forEach(row => {
      console.log(`  ${row['QUERY PLAN']}`)
    })
    
  } catch (error) {
    console.error('❌ Error checking indexes:', error)
    
    if (error instanceof Error) {
      console.error('Error details:', error.message)
    }
  } finally {
    await prisma.$disconnect()
  }
}

// Run the check
console.log('🚀 Starting Database Index Check...')
console.log('=' .repeat(60))

checkIndexes()
  .then(() => {
    console.log('\n✨ Index check completed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Index check failed:', error)
    process.exit(1)
  })

export { checkIndexes }
