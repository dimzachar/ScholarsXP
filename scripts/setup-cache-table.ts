/**
 * Script to set up the cache_entries table in Supabase
 * Run this script to create the database cache table for the multi-layer caching system
 */

import { createServiceClient } from '@/lib/supabase-server'

async function setupCacheTable() {
  console.log('🗄️ Setting up cache_entries table in Supabase...')
  
  const supabase = createServiceClient()
  
  try {
    // Create the cache_entries table
    const createTableSQL = `
      -- Simple cache table for persistent storage
      CREATE TABLE IF NOT EXISTS cache_entries (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        data JSONB NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `
    
    const { error: tableError } = await supabase.rpc('exec_sql', { sql: createTableSQL })
    if (tableError) {
      console.error('❌ Error creating table:', tableError)
      return
    }
    
    // Create indexes
    const createIndexesSQL = `
      -- Index for fast key lookups
      CREATE INDEX IF NOT EXISTS idx_cache_entries_key ON cache_entries(key);
      CREATE INDEX IF NOT EXISTS idx_cache_entries_expires_at ON cache_entries(expires_at);
    `
    
    const { error: indexError } = await supabase.rpc('exec_sql', { sql: createIndexesSQL })
    if (indexError) {
      console.error('❌ Error creating indexes:', indexError)
      return
    }
    
    // Create cleanup function
    const createFunctionSQL = `
      -- Function to clean up expired entries
      CREATE OR REPLACE FUNCTION cleanup_expired_cache_entries()
      RETURNS INTEGER AS $$
      DECLARE
        deleted_count INTEGER;
      BEGIN
        DELETE FROM cache_entries WHERE expires_at < NOW();
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        RETURN deleted_count;
      END;
      $$ LANGUAGE plpgsql;
    `
    
    const { error: functionError } = await supabase.rpc('exec_sql', { sql: createFunctionSQL })
    if (functionError) {
      console.error('❌ Error creating cleanup function:', functionError)
      return
    }
    
    console.log('✅ Cache table setup completed successfully!')
    console.log('📊 Table: cache_entries')
    console.log('📊 Indexes: idx_cache_entries_key, idx_cache_entries_expires_at')
    console.log('📊 Function: cleanup_expired_cache_entries()')
    
    // Test the table by inserting a test entry
    const testKey = 'setup-test'
    const testData = { message: 'Cache table setup successful', timestamp: new Date().toISOString() }
    const expiresAt = new Date(Date.now() + 60000) // 1 minute from now
    
    const { error: insertError } = await supabase
      .from('cache_entries')
      .insert({
        key: testKey,
        data: testData,
        expires_at: expiresAt.toISOString()
      })
    
    if (insertError) {
      console.error('❌ Error testing table:', insertError)
      return
    }
    
    // Retrieve the test entry
    const { data: testEntry, error: selectError } = await supabase
      .from('cache_entries')
      .select('*')
      .eq('key', testKey)
      .single()
    
    if (selectError) {
      console.error('❌ Error retrieving test entry:', selectError)
      return
    }
    
    console.log('✅ Table test successful:', testEntry)
    
    // Clean up test entry
    await supabase
      .from('cache_entries')
      .delete()
      .eq('key', testKey)
    
    console.log('🧹 Test entry cleaned up')
    
  } catch (error) {
    console.error('❌ Setup failed:', error)
  }
}

// Run if called directly
if (require.main === module) {
  setupCacheTable()
}

export { setupCacheTable }
