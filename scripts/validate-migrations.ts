#!/usr/bin/env tsx

/**
 * Migration Validation Script
 * 
 * This script validates that the merge system migrations are compatible
 * with the existing database schema and can be applied safely.
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables
config({ path: resolve(process.cwd(), '.env') })

import { createServiceClient } from '../src/lib/supabase-service'

async function checkTableExists(tableName: string): Promise<boolean> {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1)

    return !error || error.code !== '42P01'
  } catch (error) {
    return false
  }
}

async function checkColumnExists(tableName: string, columnName: string): Promise<boolean> {
  try {
    const supabase = createServiceClient()
    
    // Try to select the specific column
    const { error } = await supabase
      .from(tableName)
      .select(columnName)
      .limit(1)

    return !error || error.code !== '42703'
  } catch (error) {
    return false
  }
}

async function checkFunctionExists(functionName: string): Promise<boolean> {
  try {
    const supabase = createServiceClient()
    
    // Try to call the function with empty parameters
    const { error } = await supabase.rpc(functionName, {})
    
    // Function exists if we get any error other than "function does not exist"
    return !error || error.code !== '42883'
  } catch (error) {
    return false
  }
}

async function validateExistingSchema() {
  console.log('🔍 Validating existing database schema...')
  
  const requiredTables = ['User', 'XpTransaction', 'WeeklyStats']
  const requiredUserColumns = ['id', 'email', 'totalXp', 'streakWeeks', 'missedReviews']
  const requiredXpColumns = ['id', 'userId', 'amount', 'type', 'weekNumber']
  
  let allValid = true

  // Check required tables exist
  for (const table of requiredTables) {
    const exists = await checkTableExists(table)
    if (exists) {
      console.log(`   ✅ Table ${table} exists`)
    } else {
      console.log(`   ❌ Table ${table} missing`)
      allValid = false
    }
  }

  // Check User table columns
  console.log('   Checking User table columns...')
  for (const column of requiredUserColumns) {
    const exists = await checkColumnExists('User', column)
    if (exists) {
      console.log(`     ✅ User.${column} exists`)
    } else {
      console.log(`     ❌ User.${column} missing`)
      allValid = false
    }
  }

  // Check XpTransaction table columns
  console.log('   Checking XpTransaction table columns...')
  for (const column of requiredXpColumns) {
    const exists = await checkColumnExists('XpTransaction', column)
    if (exists) {
      console.log(`     ✅ XpTransaction.${column} exists`)
    } else {
      console.log(`     ❌ XpTransaction.${column} missing`)
      allValid = false
    }
  }

  return allValid
}

async function validateDiscordFields() {
  console.log('🔍 Validating Discord fields...')
  
  const discordFields = ['discordId', 'discordHandle', 'discordAvatarUrl']
  let allExist = true

  for (const field of discordFields) {
    const exists = await checkColumnExists('User', field)
    if (exists) {
      console.log(`   ✅ User.${field} exists`)
    } else {
      console.log(`   ⚠️  User.${field} missing - will be added by migration 009`)
      allExist = false
    }
  }

  return allExist
}

async function validateMergeTables() {
  console.log('🔍 Validating merge system tables...')
  
  const mergeTables = ['UserMergeHistory', 'MergeLock', 'TransferBatch', 'RollbackPoint']
  let allExist = true

  for (const table of mergeTables) {
    const exists = await checkTableExists(table)
    if (exists) {
      console.log(`   ✅ Table ${table} exists`)
    } else {
      console.log(`   ⚠️  Table ${table} missing - will be created by migration 010`)
      allExist = false
    }
  }

  return allExist
}

async function validateMergeFunctions() {
  console.log('🔍 Validating merge system functions...')
  
  const mergeFunctions = [
    'atomic_merge_legacy_account',
    'transfer_xp_transactions', 
    'merge_weekly_stats',
    'find_legacy_account_by_handle',
    'get_merge_status'
  ]
  
  let allExist = true

  for (const func of mergeFunctions) {
    const exists = await checkFunctionExists(func)
    if (exists) {
      console.log(`   ✅ Function ${func} exists`)
    } else {
      console.log(`   ⚠️  Function ${func} missing - will be created by migration 011`)
      allExist = false
    }
  }

  return allExist
}

async function checkDataIntegrity() {
  console.log('🔍 Checking data integrity...')
  
  try {
    const supabase = createServiceClient()
    
    // Check for users with inconsistent XP
    const { data: inconsistentUsers, error: xpError } = await supabase.rpc('check_xp_consistency', {})
    
    if (xpError && xpError.code !== '42883') {
      console.log('   ⚠️  Could not check XP consistency:', xpError.message)
    } else if (inconsistentUsers && inconsistentUsers.length > 0) {
      console.log(`   ⚠️  Found ${inconsistentUsers.length} users with XP inconsistencies`)
      console.log('   ℹ️  These will be fixed during the merge process')
    } else {
      console.log('   ✅ XP data appears consistent')
    }

    // Check for legacy accounts
    const { data: legacyAccounts, error: legacyError } = await supabase
      .from('User')
      .select('id, email, totalXp')
      .ilike('email', '%@legacy.import')
      .limit(5)

    if (legacyError) {
      console.log('   ⚠️  Could not check legacy accounts:', legacyError.message)
    } else if (legacyAccounts && legacyAccounts.length > 0) {
      console.log(`   ℹ️  Found ${legacyAccounts.length} legacy accounts (showing first 5)`)
      legacyAccounts.forEach(account => {
        console.log(`     - ${account.email} (${account.totalXp} XP)`)
      })
    } else {
      console.log('   ℹ️  No legacy accounts found')
    }

    return true
  } catch (error) {
    console.log('   ⚠️  Error checking data integrity:', error)
    return false
  }
}

async function generateMigrationPlan() {
  console.log('\n📋 Migration Plan:')
  
  const discordFieldsExist = await validateDiscordFields()
  const mergeTablesExist = await validateMergeTables()
  const mergeFunctionsExist = await validateMergeFunctions()

  console.log('\n   Required migrations:')
  
  if (!discordFieldsExist) {
    console.log('   1. ✅ Apply migration 009_add_discord_fields.sql')
  } else {
    console.log('   1. ⏭️  Skip migration 009 (Discord fields already exist)')
  }

  if (!mergeTablesExist) {
    console.log('   2. ✅ Apply migration 010_merge_system_foundation.sql')
  } else {
    console.log('   2. ⏭️  Skip migration 010 (Merge tables already exist)')
  }

  if (!mergeFunctionsExist) {
    console.log('   3. ✅ Apply migration 011_merge_atomic_functions.sql')
  } else {
    console.log('   3. ⏭️  Skip migration 011 (Merge functions already exist)')
  }

  console.log('\n   After migrations:')
  console.log('   4. ✅ Test the system with: npx tsx scripts/test-merge-system.ts')
  console.log('   5. ✅ Deploy application code')
  console.log('   6. ✅ Monitor initial usage')
}

async function main() {
  console.log('🚀 Validating Legacy Account Merge System Migrations\n')
  
  try {
    // Validate existing schema
    const schemaValid = await validateExistingSchema()
    if (!schemaValid) {
      console.log('\n❌ Existing schema validation failed!')
      console.log('   Please ensure your database has the basic tables (User, XpTransaction, WeeklyStats)')
      process.exit(1)
    }

    console.log('\n✅ Existing schema validation passed!')

    // Check current state of merge system components
    await validateDiscordFields()
    await validateMergeTables()
    await validateMergeFunctions()

    // Check data integrity
    await checkDataIntegrity()

    // Generate migration plan
    await generateMigrationPlan()

    console.log('\n🎉 Migration validation completed!')
    console.log('\nNext steps:')
    console.log('1. Review the migration plan above')
    console.log('2. Apply any missing migrations')
    console.log('3. Run the test script to verify everything works')
    console.log('4. Follow the deployment instructions')

  } catch (error) {
    console.error('💥 Validation failed:', error)
    process.exit(1)
  }
}

// Run the validation
main().catch(error => {
  console.error('💥 Validation script failed:', error)
  process.exit(1)
})
