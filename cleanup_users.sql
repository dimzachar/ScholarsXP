-- ============================================================================
-- Clean Up Existing Users - Execute in Supabase SQL Editor
-- Purpose: Remove existing Google OAuth users and start fresh with Discord-only
-- ============================================================================

-- First, let's see what users we have
SELECT 
    id, 
    email, 
    username, 
    "discordId", 
    "discordHandle", 
    "totalXp", 
    role,
    "createdAt"
FROM "User" 
ORDER BY "createdAt" DESC;

-- Delete all existing users and their related data
-- This will cascade delete submissions, XP transactions, etc.
DELETE FROM "User";

-- Verify cleanup
SELECT COUNT(*) as remaining_users FROM "User";

-- Also clean up any orphaned data (if any)
DELETE FROM "Submission" WHERE "userId" NOT IN (SELECT id FROM "User");
DELETE FROM "XpTransaction" WHERE "userId" NOT IN (SELECT id FROM "User");
DELETE FROM "PeerReview" WHERE "reviewerId" NOT IN (SELECT id FROM "User");
DELETE FROM "LegacySubmission";

-- Reset any sequences if needed (PostgreSQL auto-increment counters)
-- This ensures clean IDs for new users
SELECT setval(pg_get_serial_sequence('"User"', 'id'), 1, false);

-- Verification queries
SELECT 'Users:' as table_name, COUNT(*) as count FROM "User"
UNION ALL
SELECT 'Submissions:', COUNT(*) FROM "Submission"
UNION ALL
SELECT 'XP Transactions:', COUNT(*) FROM "XpTransaction"
UNION ALL
SELECT 'Peer Reviews:', COUNT(*) FROM "PeerReview"
UNION ALL
SELECT 'Legacy Submissions:', COUNT(*) FROM "LegacySubmission";

-- Success message
SELECT 'Database cleaned successfully! Ready for Discord-only authentication.' as status;
