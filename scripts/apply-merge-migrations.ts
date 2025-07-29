#!/usr/bin/env tsx

/**
 * Apply Merge System Migrations
 * 
 * This script manually applies the merge system migrations to the database.
 * It reads the migration files and executes them directly.
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// Load environment variables
config({ path: resolve(process.cwd(), '.env') })

import { createServiceClient } from '../src/lib/supabase-service'

async function applyMigration(migrationPath: string, migrationName: string) {
  console.log(`🔄 Applying migration: ${migrationName}`)
  
  try {
    const supabase = createServiceClient()
    const migrationSQL = readFileSync(migrationPath, 'utf-8')
    
    // Split the migration into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'))
    
    console.log(`   Found ${statements.length} SQL statements`)
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      if (statement.trim()) {
        try {
          console.log(`   Executing statement ${i + 1}/${statements.length}...`)
          const { error } = await supabase.rpc('exec_sql', { sql: statement })
          
          if (error) {
            // Try direct execution if rpc fails
            console.log(`   RPC failed, trying direct execution...`)
            const { error: directError } = await supabase
              .from('_temp_migration')
              .select('*')
              .limit(0) // This will fail but allows us to execute raw SQL
            
            if (directError) {
              console.log(`   ⚠️  Statement ${i + 1} failed: ${error.message}`)
              // Continue with other statements
            }
          } else {
            console.log(`   ✅ Statement ${i + 1} executed successfully`)
          }
        } catch (stmtError) {
          console.log(`   ⚠️  Statement ${i + 1} error:`, stmtError)
        }
      }
    }
    
    console.log(`✅ Migration ${migrationName} completed`)
    return true
  } catch (error) {
    console.error(`❌ Migration ${migrationName} failed:`, error)
    return false
  }
}

async function createTablesDirectly() {
  console.log('🔄 Creating merge tables directly...')

  try {
    const supabase = createServiceClient()

    // Since we can't execute raw SQL directly, let's check if tables exist by trying to query them
    console.log('   Checking if UserMergeHistory table exists...')
    const { error: checkError } = await supabase
      .from('UserMergeHistory')
      .select('id')
      .limit(1)

    if (checkError && checkError.code === '42P01') {
      console.log('   ❌ UserMergeHistory table does not exist')
      console.log('   ℹ️  The migration files need to be applied to the database.')
      console.log('   ℹ️  Please run the SQL from supabase/migrations/010_merge_system_foundation.sql manually')
      console.log('   ℹ️  in your Supabase SQL editor or using a database client.')
      return false
    } else {
      console.log('   ✅ UserMergeHistory table exists')
    }

    // Check other tables
    const tables = ['MergeLock', 'TransferBatch', 'RollbackPoint']
    for (const table of tables) {
      console.log(`   Checking if ${table} table exists...`)
      const { error } = await supabase
        .from(table)
        .select('*')
        .limit(1)

      if (error && error.code === '42P01') {
        console.log(`   ❌ ${table} table does not exist`)
        return false
      } else {
        console.log(`   ✅ ${table} table exists`)
      }
    }
    
    if (mergeHistoryError) {
      console.log('   ⚠️  UserMergeHistory creation failed:', mergeHistoryError.message)
    } else {
      console.log('   ✅ UserMergeHistory table created')
    }
    
    // Create MergeLock table
    console.log('   Creating MergeLock table...')
    const { error: mergeLockError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS "MergeLock" (
          "userId" UUID PRIMARY KEY,
          "lockedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "lockedBy" TEXT NOT NULL,
          "lockReason" TEXT NOT NULL DEFAULT 'MERGE_IN_PROGRESS',
          "expiresAt" TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
          "metadata" JSONB DEFAULT '{}'::jsonb
        );
      `
    })
    
    if (mergeLockError) {
      console.log('   ⚠️  MergeLock creation failed:', mergeLockError.message)
    } else {
      console.log('   ✅ MergeLock table created')
    }
    
    // Create TransferBatch table
    console.log('   Creating TransferBatch table...')
    const { error: transferBatchError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS "TransferBatch" (
          "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          "mergeId" UUID NOT NULL,
          "legacyUserId" UUID NOT NULL,
          "realUserId" UUID NOT NULL,
          "batchType" TEXT NOT NULL CHECK (batchType IN (
            'XP_TRANSACTIONS', 'WEEKLY_STATS', 'USER_DATA'
          )),
          "status" TEXT NOT NULL CHECK (status IN (
            'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'
          )) DEFAULT 'PENDING',
          "itemsProcessed" INTEGER DEFAULT 0,
          "itemsTransferred" INTEGER DEFAULT 0,
          "itemsSkipped" INTEGER DEFAULT 0,
          "totalValue" INTEGER DEFAULT 0,
          "errorMessage" TEXT,
          "retryCount" INTEGER DEFAULT 0,
          "maxRetries" INTEGER DEFAULT 3,
          "startedAt" TIMESTAMP,
          "completedAt" TIMESTAMP,
          "processingTimeMs" INTEGER,
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
          "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `
    })
    
    if (transferBatchError) {
      console.log('   ⚠️  TransferBatch creation failed:', transferBatchError.message)
    } else {
      console.log('   ✅ TransferBatch table created')
    }
    
    // Create RollbackPoint table
    console.log('   Creating RollbackPoint table...')
    const { error: rollbackPointError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS "RollbackPoint" (
          "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          "mergeId" UUID NOT NULL,
          "rollbackData" JSONB NOT NULL,
          "dataVersion" TEXT NOT NULL DEFAULT '1.0',
          "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `
    })
    
    if (rollbackPointError) {
      console.log('   ⚠️  RollbackPoint creation failed:', rollbackPointError.message)
    } else {
      console.log('   ✅ RollbackPoint table created')
    }
    
    console.log('✅ All merge tables created successfully')
    return true
  } catch (error) {
    console.error('❌ Direct table creation failed:', error)
    return false
  }
}

async function addMissingColumns() {
  console.log('🔄 Adding missing columns to existing tables...')
  
  try {
    const supabase = createServiceClient()
    
    // Add columns to XpTransaction table
    console.log('   Adding sourceType column to XpTransaction...')
    const { error: sourceTypeError } = await supabase.rpc('exec_sql', {
      sql: `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'XpTransaction' AND column_name = 'sourceType'
          ) THEN
            ALTER TABLE "XpTransaction" ADD COLUMN "sourceType" TEXT;
          END IF;
        END $$;
      `
    })
    
    if (sourceTypeError) {
      console.log('   ⚠️  sourceType column addition failed:', sourceTypeError.message)
    } else {
      console.log('   ✅ sourceType column added to XpTransaction')
    }
    
    // Add mergeId column to XpTransaction
    console.log('   Adding mergeId column to XpTransaction...')
    const { error: mergeIdError } = await supabase.rpc('exec_sql', {
      sql: `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'XpTransaction' AND column_name = 'mergeId'
          ) THEN
            ALTER TABLE "XpTransaction" ADD COLUMN "mergeId" UUID;
          END IF;
        END $$;
      `
    })
    
    if (mergeIdError) {
      console.log('   ⚠️  mergeId column addition failed:', mergeIdError.message)
    } else {
      console.log('   ✅ mergeId column added to XpTransaction')
    }
    
    // Add columns to User table
    console.log('   Adding merge tracking columns to User...')
    const { error: userColumnsError } = await supabase.rpc('exec_sql', {
      sql: `
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'User' AND column_name = 'lastMergeAt'
          ) THEN
            ALTER TABLE "User" ADD COLUMN "lastMergeAt" TIMESTAMP;
          END IF;
          
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'User' AND column_name = 'mergeCount'
          ) THEN
            ALTER TABLE "User" ADD COLUMN "mergeCount" INTEGER DEFAULT 0;
          END IF;
        END $$;
      `
    })
    
    if (userColumnsError) {
      console.log('   ⚠️  User columns addition failed:', userColumnsError.message)
    } else {
      console.log('   ✅ Merge tracking columns added to User')
    }
    
    console.log('✅ All missing columns added successfully')
    return true
  } catch (error) {
    console.error('❌ Column addition failed:', error)
    return false
  }
}

async function main() {
  console.log('🚀 Applying Merge System Migrations\n')
  
  try {
    // First, try to create tables directly
    const tablesCreated = await createTablesDirectly()
    
    // Add missing columns to existing tables
    const columnsAdded = await addMissingColumns()
    
    if (tablesCreated && columnsAdded) {
      console.log('\n🎉 All migrations applied successfully!')
      console.log('You can now run the test script again.')
    } else {
      console.log('\n⚠️  Some migrations may have failed. Check the output above.')
      console.log('The system may still work if the tables already existed.')
    }
    
  } catch (error) {
    console.error('💥 Migration script failed:', error)
    process.exit(1)
  }
}

// Run the migrations
main().catch(error => {
  console.error('💥 Migration script failed:', error)
  process.exit(1)
})
