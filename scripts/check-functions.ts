#!/usr/bin/env tsx

/**
 * Check Database Functions
 * 
 * This script checks what functions actually exist in the database
 * and helps debug the schema cache issue.
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables
config({ path: resolve(process.cwd(), '.env') })

import { createServiceClient } from '../src/lib/supabase-service'

async function checkFunctionExists(functionName: string, params: any = {}) {
  try {
    const supabase = createServiceClient()
    console.log(`🔍 Testing function: ${functionName}`)
    
    const { data, error } = await supabase.rpc(functionName, params)
    
    if (error) {
      console.log(`   ❌ Error: ${error.message}`)
      console.log(`   Code: ${error.code}`)
      if (error.details) {
        console.log(`   Details: ${error.details}`)
      }
      return false
    } else {
      console.log(`   ✅ Function exists and is callable`)
      return true
    }
  } catch (error) {
    console.log(`   ❌ Exception: ${error}`)
    return false
  }
}

async function listAllFunctions() {
  try {
    const supabase = createServiceClient()
    console.log('🔍 Querying database for all functions...')
    
    // Try to query the information schema for functions
    const { data, error } = await supabase
      .from('information_schema.routines')
      .select('routine_name, routine_type')
      .eq('routine_schema', 'public')
      .ilike('routine_name', '%merge%')
    
    if (error) {
      console.log('   ❌ Could not query information_schema:', error.message)
    } else if (data && data.length > 0) {
      console.log('   ✅ Found merge-related functions:')
      data.forEach(func => {
        console.log(`     - ${func.routine_name} (${func.routine_type})`)
      })
    } else {
      console.log('   ⚠️  No merge-related functions found')
    }
  } catch (error) {
    console.log('   ❌ Error querying functions:', error)
  }
}

async function testSpecificFunctions() {
  console.log('\n🧪 Testing specific function calls...')
  
  // Test with different parameter combinations
  const functions = [
    {
      name: 'atomic_merge_legacy_account',
      params: {
        p_real_user_id: '123e4567-e89b-12d3-a456-426614174000',
        p_legacy_user_id: '123e4567-e89b-12d3-a456-426614174001', 
        p_discord_handle: 'test#1234',
        p_initiated_by: 'SYSTEM'
      }
    },
    {
      name: 'get_merge_status',
      params: {
        p_user_id: '123e4567-e89b-12d3-a456-426614174000'
      }
    },
    {
      name: 'transfer_xp_transactions',
      params: {
        p_legacy_user_id: '123e4567-e89b-12d3-a456-426614174001',
        p_real_user_id: '123e4567-e89b-12d3-a456-426614174000',
        p_merge_id: '123e4567-e89b-12d3-a456-426614174002'
      }
    },
    {
      name: 'merge_weekly_stats',
      params: {
        p_legacy_user_id: '123e4567-e89b-12d3-a456-426614174001',
        p_real_user_id: '123e4567-e89b-12d3-a456-426614174000',
        p_merge_id: '123e4567-e89b-12d3-a456-426614174002'
      }
    },
    {
      name: 'find_legacy_account_by_handle',
      params: {
        p_discord_handle: 'test#1234'
      }
    }
  ]
  
  for (const func of functions) {
    await checkFunctionExists(func.name, func.params)
  }
}

async function main() {
  console.log('🚀 Checking Database Functions\n')
  
  try {
    // List all functions
    await listAllFunctions()
    
    // Test specific functions
    await testSpecificFunctions()
    
    console.log('\n💡 Possible solutions:')
    console.log('1. The functions may not exist - apply migration 011_merge_atomic_functions.sql')
    console.log('2. Schema cache may be stale - restart your Supabase instance or wait a few minutes')
    console.log('3. Function signatures may be different - check the actual function definitions')
    
  } catch (error) {
    console.error('💥 Function check failed:', error)
    process.exit(1)
  }
}

// Run the check
main().catch(error => {
  console.error('💥 Function check script failed:', error)
  process.exit(1)
})
