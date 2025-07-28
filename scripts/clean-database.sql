-- Supabase Database Cleanup Script
-- WARNING: This will delete ALL data in your database
-- Run with: supabase db shell < scripts/clean-database.sql

-- Disable foreign key checks temporarily for faster cleanup
SET session_replication_role = replica;

-- Clean up tables in proper order to respect foreign key constraints
-- 1. Delete dependent records first
TRUNCATE TABLE "PeerReview" CASCADE;
TRUNCATE TABLE "ReviewAssignment" CASCADE;
TRUNCATE TABLE "AiEvaluation" CASCADE;
TRUNCATE TABLE "ContentFingerprint" CASCADE;
TRUNCATE TABLE "XpTransaction" CASCADE;
TRUNCATE TABLE "WeeklyStats" CASCADE;
TRUNCATE TABLE "UserAchievement" CASCADE;

-- 2. Delete main content tables
TRUNCATE TABLE "Submission" CASCADE;
TRUNCATE TABLE "LegacySubmission" CASCADE;

-- 3. Delete achievement definitions
TRUNCATE TABLE "Achievement" CASCADE;

-- 4. Delete admin actions
TRUNCATE TABLE "AdminAction" CASCADE;

-- 5. Finally delete users (this will cascade to any remaining related records)
TRUNCATE TABLE "User" CASCADE;

-- Re-enable foreign key checks
SET session_replication_role = DEFAULT;

-- Reset sequences to start from 1 (optional)
-- Note: UUID fields don't use sequences, but if you have any auto-increment fields:
-- ALTER SEQUENCE IF EXISTS some_sequence_name RESTART WITH 1;

-- Verify cleanup - show row counts for all tables
SELECT 
  schemaname,
  tablename,
  n_tup_ins - n_tup_del as estimated_row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Show exact counts (slower but accurate)
SELECT 'User' as table_name, COUNT(*) as row_count FROM "User"
UNION ALL
SELECT 'Submission', COUNT(*) FROM "Submission"
UNION ALL
SELECT 'PeerReview', COUNT(*) FROM "PeerReview"
UNION ALL
SELECT 'WeeklyStats', COUNT(*) FROM "WeeklyStats"
UNION ALL
SELECT 'XpTransaction', COUNT(*) FROM "XpTransaction"
UNION ALL
SELECT 'LegacySubmission', COUNT(*) FROM "LegacySubmission"
UNION ALL
SELECT 'Achievement', COUNT(*) FROM "Achievement"
UNION ALL
SELECT 'UserAchievement', COUNT(*) FROM "UserAchievement"
UNION ALL
SELECT 'ReviewAssignment', COUNT(*) FROM "ReviewAssignment"
UNION ALL
SELECT 'AiEvaluation', COUNT(*) FROM "AiEvaluation"
UNION ALL
SELECT 'ContentFingerprint', COUNT(*) FROM "ContentFingerprint"
UNION ALL
SELECT 'AdminAction', COUNT(*) FROM "AdminAction"
ORDER BY table_name;

-- Success message
SELECT 'Database cleanup completed successfully!' as status;
