-- Create cache_entries table for multi-layer caching system
-- This table provides persistent storage for the L2 database cache layer

-- Simple cache table for persistent storage
CREATE TABLE IF NOT EXISTS cache_entries (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  data JSONB NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast key lookups
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

-- Create a scheduled job to clean up expired entries every hour
-- Note: This requires the pg_cron extension to be enabled
-- You can run this manually or set up a cron job externally
-- SELECT cron.schedule('cleanup-cache', '0 * * * *', 'SELECT cleanup_expired_cache_entries();');

-- Grant necessary permissions for the cache operations
-- These will be handled by RLS policies and service role access

-- Add comment for documentation
COMMENT ON TABLE cache_entries IS 'Multi-layer cache storage for persistent L2 cache layer';
COMMENT ON COLUMN cache_entries.key IS 'Unique cache key identifier';
COMMENT ON COLUMN cache_entries.data IS 'Cached data stored as JSONB';
COMMENT ON COLUMN cache_entries.expires_at IS 'Expiration timestamp for automatic cleanup';
COMMENT ON FUNCTION cleanup_expired_cache_entries() IS 'Function to remove expired cache entries';
