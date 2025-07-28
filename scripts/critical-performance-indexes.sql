-- Critical Performance Indexes for API Response Optimization
-- These indexes target the slowest queries identified in the performance analysis
-- Run this in Supabase SQL Editor for immediate performance improvement

-- ============================================================================
-- ANALYTICS ENDPOINT OPTIMIZATION (Biggest Impact)
-- Target: /api/admin/analytics (4.2s → 1s, 150KB → 45KB)
-- ============================================================================

-- 1. User totalXp ordering (for leaderboard queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_totalxp_desc 
ON "User"("totalXp" DESC) 
WHERE role != 'ADMIN';

-- 2. User role filtering with XP ordering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_role_totalxp 
ON "User"("role", "totalXp" DESC);

-- 3. User last active filtering for analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_lastactive_analytics 
ON "User"("lastActiveAt") 
WHERE "lastActiveAt" > NOW() - INTERVAL '90 days';

-- ============================================================================
-- SUBMISSION QUERIES OPTIMIZATION
-- Target: /api/admin/submissions (6.1s → 1.5s)
-- ============================================================================

-- 4. Submission status with creation date (admin dashboard)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submission_status_created_admin 
ON "Submission"("status", "createdAt" DESC);

-- 5. Submission user with status (user-specific queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submission_user_status_created 
ON "Submission"("userId", "status", "createdAt" DESC);

-- 6. Submission platform analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submission_platform_status 
ON "Submission"("platform", "status");

-- 7. Submission final XP for analytics aggregation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submission_finalxp_status 
ON "Submission"("finalXp" DESC, "status") 
WHERE "finalXp" IS NOT NULL;

-- ============================================================================
-- LEADERBOARD OPTIMIZATION  
-- Target: /api/leaderboard/detailed (10.5s → 2s, 45KB → 10KB)
-- ============================================================================

-- 8. Week number with XP for weekly leaderboards
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submission_week_finalxp 
ON "Submission"("weekNumber", "finalXp" DESC) 
WHERE "finalXp" IS NOT NULL;

-- 9. User submissions count optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submission_userid_count 
ON "Submission"("userId") 
WHERE "status" IN ('FINALIZED', 'UNDER_PEER_REVIEW');

-- ============================================================================
-- PEER REVIEW OPTIMIZATION
-- ============================================================================

-- 10. Peer review submission lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_peerreview_submission_reviewer 
ON "PeerReview"("submissionId", "reviewerId");

-- 11. Reviewer performance analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_peerreview_reviewer_xpscore 
ON "PeerReview"("reviewerId", "xpScore") 
WHERE "xpScore" IS NOT NULL;

-- ============================================================================
-- XP TRANSACTION OPTIMIZATION
-- ============================================================================

-- 12. XP transactions by user and type
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_xptransaction_user_type_amount 
ON "XpTransaction"("userId", "type", "amount" DESC);

-- 13. XP transactions for analytics aggregation
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_xptransaction_amount_created 
ON "XpTransaction"("amount", "createdAt" DESC) 
WHERE "amount" > 0;

-- ============================================================================
-- COMPOSITE INDEXES FOR COMPLEX QUERIES
-- ============================================================================

-- 14. Analytics time-based filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submission_created_status_platform 
ON "Submission"("createdAt" DESC, "status", "platform");

-- 15. User activity with role filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_role_lastactive_totalxp 
ON "User"("role", "lastActiveAt", "totalXp" DESC) 
WHERE role != 'ADMIN';

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check if indexes were created successfully
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Check index sizes
SELECT 
    schemaname||'.'||tablename as table_name,
    indexname,
    pg_size_pretty(pg_relation_size(indexname::regclass)) as index_size
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND indexname LIKE 'idx_%'
ORDER BY pg_relation_size(indexname::regclass) DESC;

-- Performance impact verification
EXPLAIN (ANALYZE, BUFFERS) 
SELECT COUNT(*) FROM "User" WHERE role != 'ADMIN' ORDER BY "totalXp" DESC LIMIT 50;

EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*) FROM "Submission" WHERE "status" = 'FINALIZED' AND "createdAt" > NOW() - INTERVAL '30 days';
