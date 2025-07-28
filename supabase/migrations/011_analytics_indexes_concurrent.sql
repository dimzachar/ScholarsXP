-- Analytics Optimization - Concurrent Indexes
-- This file creates indexes concurrently for better performance
-- Run this AFTER the main migration (010_analytics_optimization.sql)
-- These must be run separately because CONCURRENTLY cannot run in a transaction block

-- Create indexes for analytics optimization with CONCURRENTLY for zero downtime
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_last_active_at_concurrent ON "User"("lastActiveAt") WHERE "lastActiveAt" IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submission_created_at_status_concurrent ON "Submission"("createdAt", "status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_peer_review_created_at_concurrent ON "PeerReview"("createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_xp_transaction_created_at_amount_concurrent ON "XpTransaction"("createdAt", "amount") WHERE "amount" > 0;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_achievement_earned_at_concurrent ON "UserAchievement"("earnedAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_flag_status_concurrent ON "ContentFlag"("status") WHERE "status" = 'PENDING';

-- Create composite indexes for better join performance with CONCURRENTLY
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_submission_user_created_status_concurrent ON "Submission"("userId", "createdAt", "status");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_peer_review_reviewer_created_concurrent ON "PeerReview"("reviewerId", "createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_xp_transaction_user_created_amount_concurrent ON "XpTransaction"("userId", "createdAt", "amount");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_achievement_user_earned_concurrent ON "UserAchievement"("userId", "earnedAt");

-- Add comments for documentation
COMMENT ON INDEX idx_user_last_active_at_concurrent IS 'Optimizes active user queries for analytics';
COMMENT ON INDEX idx_submission_created_at_status_concurrent IS 'Optimizes submission filtering by date and status';
COMMENT ON INDEX idx_peer_review_created_at_concurrent IS 'Optimizes peer review date filtering';
COMMENT ON INDEX idx_xp_transaction_created_at_amount_concurrent IS 'Optimizes XP transaction queries for positive amounts';
COMMENT ON INDEX idx_user_achievement_earned_at_concurrent IS 'Optimizes achievement date filtering';
COMMENT ON INDEX idx_content_flag_status_concurrent IS 'Optimizes pending flag queries';
COMMENT ON INDEX idx_submission_user_created_status_concurrent IS 'Optimizes submission joins and filtering';
COMMENT ON INDEX idx_peer_review_reviewer_created_concurrent IS 'Optimizes peer review joins';
COMMENT ON INDEX idx_xp_transaction_user_created_amount_concurrent IS 'Optimizes XP transaction joins';
COMMENT ON INDEX idx_user_achievement_user_earned_concurrent IS 'Optimizes user achievement joins';
