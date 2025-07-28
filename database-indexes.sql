-- Database indexes for improved legacy submission query performance
-- These indexes optimize the LEFT JOIN operations in legacy submission queries

-- Add index on User.discordHandle for faster legacy linking
-- This index will speed up the JOIN condition: u."discordHandle" = ls."discordHandle"
CREATE INDEX IF NOT EXISTS idx_user_discord_handle
ON "User" ("discordHandle")
WHERE "discordHandle" IS NOT NULL;

-- Add index on User.username for alternative matching
-- This index will speed up the JOIN condition: u.username = ls."discordHandle"
CREATE INDEX IF NOT EXISTS idx_user_username
ON "User" (username)
WHERE username IS NOT NULL;

-- Add composite index for better performance on email filtering
-- This index will speed up the condition: u.email NOT LIKE '%@legacy.import'
CREATE INDEX IF NOT EXISTS idx_user_email_not_legacy
ON "User" (email)
WHERE email IS NOT NULL AND email NOT LIKE '%@legacy.import';

-- Add index on LegacySubmission.discordHandle for faster filtering
-- This index will speed up WHERE clauses on legacy submissions
CREATE INDEX IF NOT EXISTS idx_legacy_submission_discord_handle
ON "LegacySubmission" ("discordHandle")
WHERE "discordHandle" IS NOT NULL;

-- Add composite index on LegacySubmission for ordering and pagination
-- This index will speed up ORDER BY "importedAt" DESC with LIMIT/OFFSET
CREATE INDEX IF NOT EXISTS idx_legacy_submission_imported_at_desc
ON "LegacySubmission" ("importedAt" DESC);

-- Performance monitoring queries to verify index usage
-- Run these after creating indexes to ensure they are being used

-- Check if indexes exist
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename IN ('User', 'LegacySubmission')
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Analyze query performance (run EXPLAIN ANALYZE on your queries)
-- Example for the main legacy query:
/*
EXPLAIN ANALYZE
SELECT DISTINCT
  ls.id, ls.url, ls."discordHandle", ls."submittedAt", ls.role, ls.notes, ls."importedAt",
  ls."aiXp", ls."peerXp", ls."finalXp",
  u.id as "userId", u.username, u.email, u.role as "userRole", u."totalXp"
FROM "LegacySubmission" ls
LEFT JOIN "User" u ON (
  u."discordHandle" = ls."discordHandle" OR
  u."discordHandle" = ls."discordHandle" || '#0' OR
  u.username = ls."discordHandle"
) AND u.email NOT LIKE '%@legacy.import'
ORDER BY ls."importedAt" DESC
LIMIT 20;
*/
