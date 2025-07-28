-- Migration: Add API Rate Limits Table
-- Description: Creates table for database-backed rate limiting for Twitter and Reddit APIs
-- Date: 2025-01-23

-- Create api_rate_limits table
CREATE TABLE IF NOT EXISTS api_rate_limits (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(50) NOT NULL,
    endpoint VARCHAR(100) NOT NULL,
    requests_made INTEGER DEFAULT 0,
    window_start TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create unique constraint to prevent duplicate records for same platform/endpoint/window
CREATE UNIQUE INDEX IF NOT EXISTS api_rate_limits_unique_window 
ON api_rate_limits (platform, endpoint, window_start);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS api_rate_limits_lookup 
ON api_rate_limits (platform, endpoint, window_start);

-- Create index for cleanup operations
CREATE INDEX IF NOT EXISTS api_rate_limits_cleanup 
ON api_rate_limits (created_at);

-- Insert comment for documentation
COMMENT ON TABLE api_rate_limits IS 'Stores API rate limiting data for Twitter, Reddit, and other platform APIs';
COMMENT ON COLUMN api_rate_limits.platform IS 'API platform name (e.g., twitter, reddit)';
COMMENT ON COLUMN api_rate_limits.endpoint IS 'API endpoint identifier (e.g., tweet_lookup, post_fetch)';
COMMENT ON COLUMN api_rate_limits.requests_made IS 'Number of requests made in current window';
COMMENT ON COLUMN api_rate_limits.window_start IS 'Start time of the rate limiting window';
COMMENT ON COLUMN api_rate_limits.created_at IS 'Record creation timestamp for cleanup purposes';

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON api_rate_limits TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE api_rate_limits_id_seq TO your_app_user;
