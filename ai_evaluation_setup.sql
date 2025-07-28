-- ============================================================================
-- AI Evaluation System Setup - Execute in Supabase SQL Editor
-- Date: 2025-01-20
-- Purpose: Add Discord auth, AI evaluation tracking, legacy submissions, and complete duplicate detection
-- ============================================================================

-- ============================================================================
-- 1. ADD DISCORD AUTHENTICATION FIELDS TO USER TABLE
-- ============================================================================

-- Add Discord authentication fields to User table (only if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'discordId') THEN
        ALTER TABLE "User" ADD COLUMN "discordId" TEXT;
        RAISE NOTICE 'Added discordId column to User table';
    ELSE
        RAISE NOTICE 'discordId column already exists in User table';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'discordHandle') THEN
        ALTER TABLE "User" ADD COLUMN "discordHandle" TEXT;
        RAISE NOTICE 'Added discordHandle column to User table';
    ELSE
        RAISE NOTICE 'discordHandle column already exists in User table';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'discordAvatarUrl') THEN
        ALTER TABLE "User" ADD COLUMN "discordAvatarUrl" TEXT;
        RAISE NOTICE 'Added discordAvatarUrl column to User table';
    ELSE
        RAISE NOTICE 'discordAvatarUrl column already exists in User table';
    END IF;
END $$;

-- Add unique constraint for Discord ID (only if not null)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'User_discordId_key') THEN
        CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId") WHERE "discordId" IS NOT NULL;
        RAISE NOTICE 'Created unique index for discordId';
    ELSE
        RAISE NOTICE 'Unique index for discordId already exists';
    END IF;
END $$;

-- Add index for Discord handle lookups
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'User_discordHandle_idx') THEN
        CREATE INDEX "User_discordHandle_idx" ON "User"("discordHandle") WHERE "discordHandle" IS NOT NULL;
        RAISE NOTICE 'Created index for discordHandle';
    ELSE
        RAISE NOTICE 'Index for discordHandle already exists';
    END IF;
END $$;

-- ============================================================================
-- 2. AI EVALUATION TRACKING TABLE
-- ============================================================================

-- Create AI evaluation tracking table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'AiEvaluation') THEN
        CREATE TABLE "AiEvaluation" (
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
        CREATE UNIQUE INDEX "AiEvaluation_submissionId_key" ON "AiEvaluation"("submissionId");

        -- Add indexes for performance
        CREATE INDEX "AiEvaluation_status_idx" ON "AiEvaluation"("status");
        CREATE INDEX "AiEvaluation_createdAt_idx" ON "AiEvaluation"("createdAt");
        CREATE INDEX "AiEvaluation_retryCount_idx" ON "AiEvaluation"("retryCount");

        -- Enable RLS
        ALTER TABLE "AiEvaluation" ENABLE ROW LEVEL SECURITY;

        -- Create trigger for updatedAt
        CREATE TRIGGER update_ai_evaluation_updated_at 
            BEFORE UPDATE ON "AiEvaluation" 
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

        RAISE NOTICE 'Created AiEvaluation table with indexes and RLS';
    ELSE
        RAISE NOTICE 'AiEvaluation table already exists';
    END IF;
END $$;

-- ============================================================================
-- 3. LEGACY SUBMISSIONS TABLE
-- ============================================================================

-- Create legacy submissions tracking table for duplicate detection
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'LegacySubmission') THEN
        CREATE TABLE "LegacySubmission" (
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
        CREATE UNIQUE INDEX "LegacySubmission_url_key" ON "LegacySubmission"("url");
        CREATE INDEX "LegacySubmission_discordHandle_idx" ON "LegacySubmission"("discordHandle");
        CREATE INDEX "LegacySubmission_processed_idx" ON "LegacySubmission"("processed");
        CREATE INDEX "LegacySubmission_submittedAt_idx" ON "LegacySubmission"("submittedAt");

        -- Enable RLS
        ALTER TABLE "LegacySubmission" ENABLE ROW LEVEL SECURITY;

        RAISE NOTICE 'Created LegacySubmission table with indexes and RLS';
    ELSE
        RAISE NOTICE 'LegacySubmission table already exists';
    END IF;
END $$;

-- ============================================================================
-- 4. CONTENT FINGERPRINT TABLE
-- ============================================================================

-- Create content fingerprint table for duplicate detection
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ContentFingerprint') THEN
        CREATE TABLE "ContentFingerprint" (
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
        CREATE INDEX "ContentFingerprint_hash_idx" ON "ContentFingerprint"("hash");
        CREATE INDEX "ContentFingerprint_url_idx" ON "ContentFingerprint"("url");
        CREATE INDEX "ContentFingerprint_submissionId_idx" ON "ContentFingerprint"("submissionId");
        CREATE INDEX "ContentFingerprint_legacySubmissionId_idx" ON "ContentFingerprint"("legacySubmissionId");
        CREATE INDEX "ContentFingerprint_keyPhrases_idx" ON "ContentFingerprint" USING GIN ("keyPhrases");

        -- Enable RLS
        ALTER TABLE "ContentFingerprint" ENABLE ROW LEVEL SECURITY;

        RAISE NOTICE 'Created ContentFingerprint table with indexes and RLS';
    ELSE
        RAISE NOTICE 'ContentFingerprint table already exists';
    END IF;
END $$;

-- ============================================================================
-- 5. ROLE PROMOTION NOTIFICATIONS TABLE
-- ============================================================================

-- Create role promotion notifications table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'RolePromotionNotification') THEN
        CREATE TABLE "RolePromotionNotification" (
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
        CREATE INDEX "RolePromotionNotification_userId_idx" ON "RolePromotionNotification"("userId");
        CREATE INDEX "RolePromotionNotification_notificationSent_idx" ON "RolePromotionNotification"("notificationSent");
        CREATE INDEX "RolePromotionNotification_createdAt_idx" ON "RolePromotionNotification"("createdAt");

        -- Enable RLS
        ALTER TABLE "RolePromotionNotification" ENABLE ROW LEVEL SECURITY;

        RAISE NOTICE 'Created RolePromotionNotification table with indexes and RLS';
    ELSE
        RAISE NOTICE 'RolePromotionNotification table already exists';
    END IF;
END $$;

-- ============================================================================
-- 6. SYSTEM LOGGING TABLE
-- ============================================================================

-- Create system logging table for monitoring cron jobs
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'SystemLog') THEN
        CREATE TABLE "SystemLog" (
            "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
            "level" TEXT NOT NULL, -- INFO, WARN, ERROR
            "message" TEXT NOT NULL,
            "metadata" JSONB,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

            CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
        );

        -- Add indexes for performance
        CREATE INDEX "SystemLog_level_idx" ON "SystemLog"("level");
        CREATE INDEX "SystemLog_createdAt_idx" ON "SystemLog"("createdAt");

        -- Enable RLS
        ALTER TABLE "SystemLog" ENABLE ROW LEVEL SECURITY;

        RAISE NOTICE 'Created SystemLog table with indexes and RLS';
    ELSE
        RAISE NOTICE 'SystemLog table already exists';
    END IF;
END $$;

-- ============================================================================
-- 7. RLS POLICIES FOR NEW TABLES
-- ============================================================================

-- AI Evaluation Policies
DO $$
BEGIN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "admin_view_ai_evaluations" ON "AiEvaluation";
    DROP POLICY IF EXISTS "system_manage_ai_evaluations" ON "AiEvaluation";

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

    RAISE NOTICE 'Created RLS policies for AiEvaluation table';
END $$;

-- Legacy Submission Policies
DO $$
BEGIN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "admin_view_legacy_submissions" ON "LegacySubmission";
    DROP POLICY IF EXISTS "system_manage_legacy_submissions" ON "LegacySubmission";

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

    RAISE NOTICE 'Created RLS policies for LegacySubmission table';
END $$;

-- Content Fingerprint Policies
DO $$
BEGIN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "system_manage_content_fingerprints" ON "ContentFingerprint";

    -- System can manage content fingerprints (for duplicate detection)
    CREATE POLICY "system_manage_content_fingerprints" ON "ContentFingerprint"
        FOR ALL USING (true);

    RAISE NOTICE 'Created RLS policies for ContentFingerprint table';
END $$;

-- Role Promotion Notification Policies
DO $$
BEGIN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "admin_view_role_promotions" ON "RolePromotionNotification";
    DROP POLICY IF EXISTS "system_manage_role_promotions" ON "RolePromotionNotification";

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

    RAISE NOTICE 'Created RLS policies for RolePromotionNotification table';
END $$;

-- System Log Policies
DO $$
BEGIN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "admin_view_system_logs" ON "SystemLog";
    DROP POLICY IF EXISTS "system_manage_system_logs" ON "SystemLog";

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

    RAISE NOTICE 'Created RLS policies for SystemLog table';
END $$;

-- ============================================================================
-- 8. VERIFICATION QUERIES
-- ============================================================================

-- Verify new tables were created
SELECT
    'Tables created:' as status,
    string_agg(table_name, ', ') as tables
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('AiEvaluation', 'LegacySubmission', 'ContentFingerprint', 'RolePromotionNotification', 'SystemLog');

-- Verify Discord fields were added to User table
SELECT
    'Discord fields added:' as status,
    string_agg(column_name, ', ') as columns
FROM information_schema.columns
WHERE table_name = 'User'
AND column_name IN ('discordId', 'discordHandle', 'discordAvatarUrl');

-- Verify RLS is enabled on new tables
SELECT
    'RLS enabled on:' as status,
    string_agg(tablename, ', ') as tables
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('AiEvaluation', 'LegacySubmission', 'ContentFingerprint', 'RolePromotionNotification', 'SystemLog')
AND rowsecurity = true;
