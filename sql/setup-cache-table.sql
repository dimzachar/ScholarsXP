-- Multi-Layer Cache Table Setup
-- Run this SQL in the Supabase SQL Editor to set up the cache_entries table

-- Create cache_entries table for persistent storage
CREATE TABLE IF NOT EXISTS cache_entries (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  data JSONB NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cache_entries_key ON cache_entries(key);
CREATE INDEX IF NOT EXISTS idx_cache_entries_expires_at ON cache_entries(expires_at);

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

-- Add table and function comments
COMMENT ON TABLE cache_entries IS 'Multi-layer cache storage for persistent L2 cache layer';
COMMENT ON COLUMN cache_entries.key IS 'Unique cache key identifier';
COMMENT ON COLUMN cache_entries.data IS 'Cached data stored as JSONB';
COMMENT ON COLUMN cache_entries.expires_at IS 'Expiration timestamp for automatic cleanup';
COMMENT ON FUNCTION cleanup_expired_cache_entries() IS 'Function to remove expired cache entries';

-- Test the setup with a sample entry (optional)
-- INSERT INTO cache_entries (key, data, expires_at) 
-- VALUES ('test-key', '{"message": "Cache table setup successful"}', NOW() + INTERVAL '1 hour');

-- Verify the table was created
-- SELECT * FROM cache_entries LIMIT 1;
