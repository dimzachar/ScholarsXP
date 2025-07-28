-- ============================================================================
-- MIGRATION 004: AI Evaluation System & Complete Duplicate Detection
-- Date: 2025-01-20
-- Purpose: Add Discord auth, AI evaluation tracking, legacy submissions, and complete duplicate detection
-- ============================================================================

-- ============================================================================
-- 1. ADD DISCORD AUTHENTICATION FIELDS TO USER TABLE
-- ============================================================================

-- Add Discord authentication fields to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "discordId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "discordHandle" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "discordAvatarUrl" TEXT;

-- Add unique constraint for Discord ID (only if not null)
CREATE UNIQUE INDEX IF NOT EXISTS "User_discordId_key" ON "User"("discordId") WHERE "discordId" IS NOT NULL;

-- Add index for Discord handle lookups
CREATE INDEX IF NOT EXISTS "User_discordHandle_idx" ON "User"("discordHandle") WHERE "discordHandle" IS NOT NULL;

-- ============================================================================
-- 2. AI EVALUATION TRACKING TABLE
-- ============================================================================

-- Create AI evaluation tracking table
CREATE TABLE IF NOT EXISTS "AiEvaluation" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "submissionId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, PROCESSING, COMPLETED, FAILED
    "taskTypes" TEXT[],
    "baseXp" INTEGER,
    "originalityScore" DOUBLE PRECISION,
    "qualityScore" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "reasoning" TEXT,
    "processingStartedAt" TIMESTAMP(3),
    "processingCompletedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEvaluation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AiEvaluation_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE
);

-- Add unique constraint to prevent duplicate evaluations
CREATE UNIQUE INDEX IF NOT EXISTS "AiEvaluation_submissionId_key" ON "AiEvaluation"("submissionId");

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "AiEvaluation_status_idx" ON "AiEvaluation"("status");
CREATE INDEX IF NOT EXISTS "AiEvaluation_createdAt_idx" ON "AiEvaluation"("createdAt");
CREATE INDEX IF NOT EXISTS "AiEvaluation_retryCount_idx" ON "AiEvaluation"("retryCount");

-- ============================================================================
-- 3. LEGACY SUBMISSIONS TABLE (FOR GOOGLE FORMS DATA)
-- ============================================================================

-- Create legacy submissions tracking table for duplicate detection
CREATE TABLE IF NOT EXISTS "LegacySubmission" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "url" TEXT NOT NULL,
    "discordHandle" TEXT,
    "submittedAt" TIMESTAMP(3),
    "role" TEXT, -- Original role from Google Forms
    "notes" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed" BOOLEAN DEFAULT FALSE,

    CONSTRAINT "LegacySubmission_pkey" PRIMARY KEY ("id")
);

-- Add unique constraint and indexes for duplicate detection
CREATE UNIQUE INDEX IF NOT EXISTS "LegacySubmission_url_key" ON "LegacySubmission"("url");
CREATE INDEX IF NOT EXISTS "LegacySubmission_discordHandle_idx" ON "LegacySubmission"("discordHandle");
CREATE INDEX IF NOT EXISTS "LegacySubmission_processed_idx" ON "LegacySubmission"("processed");
CREATE INDEX IF NOT EXISTS "LegacySubmission_submittedAt_idx" ON "LegacySubmission"("submittedAt");

-- ============================================================================
-- 4. CONTENT FINGERPRINT TABLE (FOR COMPLETE DUPLICATE DETECTION)
-- ============================================================================

-- Create content fingerprint table for duplicate detection
CREATE TABLE IF NOT EXISTS "ContentFingerprint" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "submissionId" UUID,
    "legacySubmissionId" UUID,
    "hash" TEXT NOT NULL,
    "normalizedContent" TEXT,
    "keyPhrases" TEXT[],
    "contentLength" INTEGER NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentFingerprint_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContentFingerprint_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE,
    CONSTRAINT "ContentFingerprint_legacySubmissionId_fkey" FOREIGN KEY ("legacySubmissionId") REFERENCES "LegacySubmission"("id") ON DELETE CASCADE,
    CONSTRAINT "ContentFingerprint_check" CHECK (
        ("submissionId" IS NOT NULL AND "legacySubmissionId" IS NULL) OR
        ("submissionId" IS NULL AND "legacySubmissionId" IS NOT NULL)
    )
);

-- Add indexes for duplicate detection performance
CREATE INDEX IF NOT EXISTS "ContentFingerprint_hash_idx" ON "ContentFingerprint"("hash");
CREATE INDEX IF NOT EXISTS "ContentFingerprint_url_idx" ON "ContentFingerprint"("url");
CREATE INDEX IF NOT EXISTS "ContentFingerprint_submissionId_idx" ON "ContentFingerprint"("submissionId");
CREATE INDEX IF NOT EXISTS "ContentFingerprint_legacySubmissionId_idx" ON "ContentFingerprint"("legacySubmissionId");
CREATE INDEX IF NOT EXISTS "ContentFingerprint_keyPhrases_idx" ON "ContentFingerprint" USING GIN ("keyPhrases");

-- ============================================================================
-- 5. ROLE PROMOTION NOTIFICATIONS TABLE
-- ============================================================================

-- Create role promotion notifications table
CREATE TABLE IF NOT EXISTS "RolePromotionNotification" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL,
    "oldRole" TEXT NOT NULL,
    "newRole" TEXT NOT NULL,
    "xpAtPromotion" INTEGER NOT NULL,
    "notificationSent" BOOLEAN DEFAULT FALSE,
    "discordHandle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePromotionNotification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RolePromotionNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Add indexes for role promotion notifications
CREATE INDEX IF NOT EXISTS "RolePromotionNotification_userId_idx" ON "RolePromotionNotification"("userId");
CREATE INDEX IF NOT EXISTS "RolePromotionNotification_notificationSent_idx" ON "RolePromotionNotification"("notificationSent");
CREATE INDEX IF NOT EXISTS "RolePromotionNotification_createdAt_idx" ON "RolePromotionNotification"("createdAt");

-- ============================================================================
-- 6. SYSTEM LOGGING TABLE (FOR MONITORING CRON JOBS)
-- ============================================================================

-- Create system logging table for monitoring cron jobs
CREATE TABLE IF NOT EXISTS "SystemLog" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "level" TEXT NOT NULL, -- INFO, WARN, ERROR
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "SystemLog_level_idx" ON "SystemLog"("level");
CREATE INDEX IF NOT EXISTS "SystemLog_createdAt_idx" ON "SystemLog"("createdAt");

-- ============================================================================
-- 7. UPDATE TRIGGERS FOR NEW TABLES
-- ============================================================================

-- Create triggers for updatedAt columns
CREATE TRIGGER IF NOT EXISTS update_ai_evaluation_updated_at 
    BEFORE UPDATE ON "AiEvaluation" 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 8. ENABLE ROW LEVEL SECURITY ON NEW TABLES
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE "AiEvaluation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LegacySubmission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentFingerprint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RolePromotionNotification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SystemLog" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 9. ROW LEVEL SECURITY POLICIES FOR NEW TABLES
-- ============================================================================

-- AI Evaluation Policies
-- Only admins can view AI evaluation details
CREATE POLICY "admin_view_ai_evaluations" ON "AiEvaluation"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "User"
            WHERE "User".id = auth.uid()
            AND "User".role = 'ADMIN'
        )
    );

-- System can insert/update AI evaluations (for background processing)
CREATE POLICY "system_manage_ai_evaluations" ON "AiEvaluation"
    FOR ALL USING (true);

-- Legacy Submission Policies
-- Only admins can view legacy submissions
CREATE POLICY "admin_view_legacy_submissions" ON "LegacySubmission"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "User"
            WHERE "User".id = auth.uid()
            AND "User".role = 'ADMIN'
        )
    );

-- System can manage legacy submissions (for import/duplicate checking)
CREATE POLICY "system_manage_legacy_submissions" ON "LegacySubmission"
    FOR ALL USING (true);

-- Content Fingerprint Policies
-- System can manage content fingerprints (for duplicate detection)
CREATE POLICY "system_manage_content_fingerprints" ON "ContentFingerprint"
    FOR ALL USING (true);

-- Role Promotion Notification Policies
-- Only admins can view role promotion notifications
CREATE POLICY "admin_view_role_promotions" ON "RolePromotionNotification"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "User"
            WHERE "User".id = auth.uid()
            AND "User".role = 'ADMIN'
        )
    );

-- System can manage role promotion notifications
CREATE POLICY "system_manage_role_promotions" ON "RolePromotionNotification"
    FOR ALL USING (true);

-- System Log Policies
-- Only admins can view system logs
CREATE POLICY "admin_view_system_logs" ON "SystemLog"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "User"
            WHERE "User".id = auth.uid()
            AND "User".role = 'ADMIN'
        )
    );

-- System can manage system logs
CREATE POLICY "system_manage_system_logs" ON "SystemLog"
    FOR ALL USING (true);

-- ============================================================================
-- 10. VERIFICATION QUERIES
-- ============================================================================

-- Verify new tables were created
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('AiEvaluation', 'LegacySubmission', 'ContentFingerprint', 'RolePromotionNotification', 'SystemLog')
ORDER BY table_name;

-- Verify Discord fields were added to User table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'User'
AND column_name IN ('discordId', 'discordHandle', 'discordAvatarUrl')
ORDER BY column_name;

-- Verify RLS is enabled on new tables
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('AiEvaluation', 'LegacySubmission', 'ContentFingerprint', 'RolePromotionNotification', 'SystemLog')
ORDER BY tablename;
