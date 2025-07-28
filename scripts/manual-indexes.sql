-- Manual Performance Indexes Creation Script
-- Run this in Supabase SQL Editor if Prisma migration fails

-- Performance indexes for N+1 query optimization
-- These indexes support the optimized queries we implemented

-- User table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_createdAt_idx" 
ON "User"("createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_lastActiveAt_idx" 
ON "User"("lastActiveAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_role_createdAt_idx" 
ON "User"("role", "createdAt");

-- Submission table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Submission_userId_createdAt_idx" 
ON "Submission"("userId", "createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Submission_status_createdAt_idx" 
ON "Submission"("status", "createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Submission_createdAt_idx" 
ON "Submission"("createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Submission_platform_createdAt_idx" 
ON "Submission"("platform", "createdAt");

-- PeerReview table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PeerReview_submissionId_idx" 
ON "PeerReview"("submissionId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "PeerReview_reviewerId_createdAt_idx" 
ON "PeerReview"("reviewerId", "createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "PeerReview_createdAt_idx" 
ON "PeerReview"("createdAt");

-- XpTransaction table indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "XpTransaction_userId_createdAt_idx" 
ON "XpTransaction"("userId", "createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "XpTransaction_type_createdAt_idx" 
ON "XpTransaction"("type", "createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "XpTransaction_createdAt_idx" 
ON "XpTransaction"("createdAt");

-- Verify indexes were created
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND (
        indexname LIKE '%_createdAt_idx' 
        OR indexname LIKE '%_lastActiveAt_idx'
        OR indexname LIKE '%_role_createdAt_idx'
        OR indexname LIKE '%_userId_createdAt_idx'
        OR indexname LIKE '%_status_createdAt_idx'
        OR indexname LIKE '%_platform_createdAt_idx'
        OR indexname LIKE '%_submissionId_idx'
        OR indexname LIKE '%_reviewerId_createdAt_idx'
        OR indexname LIKE '%_type_createdAt_idx'
    )
ORDER BY tablename, indexname;
