-- ============================================================================
-- MIGRATION 006: AI Evaluation System & Complete Duplicate Detection (Incremental)
-- Date: 2025-01-20
-- Purpose: Add only new tables and columns that don't already exist
-- ============================================================================

-- ============================================================================
-- 1. ADD DISCORD AUTHENTICATION FIELDS TO USER TABLE (IF NOT EXISTS)
-- ============================================================================

-- Add Discord authentication fields to User table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'discordId') THEN
        ALTER TABLE "User" ADD COLUMN "discordId" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'discordHandle') THEN
        ALTER TABLE "User" ADD COLUMN "discordHandle" TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'discordAvatarUrl') THEN
        ALTER TABLE "User" ADD COLUMN "discordAvatarUrl" TEXT;
    END IF;
END $$;

-- Add unique constraint for Discord ID (only if not null)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'User_discordId_key') THEN
        CREATE UNIQUE INDEX "User_discordId_key" ON "User"("discordId") WHERE "discordId" IS NOT NULL;
    END IF;
END $$;

-- Add index for Discord handle lookups
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'User_discordHandle_idx') THEN
        CREATE INDEX "User_discordHandle_idx" ON "User"("discordHandle") WHERE "discordHandle" IS NOT NULL;
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
    END IF;
END $$;

-- ============================================================================
-- 3. LEGACY SUBMISSIONS TABLE (FOR GOOGLE FORMS DATA)
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
    END IF;
END $$;

-- ============================================================================
-- 4. CONTENT FINGERPRINT TABLE (FOR COMPLETE DUPLICATE DETECTION)
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
    END IF;
END $$;

-- ============================================================================
-- 6. SYSTEM LOGGING TABLE (FOR MONITORING CRON JOBS)
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
    END IF;
END $$;

-- ============================================================================
-- 7. UPDATE TRIGGERS FOR NEW TABLES
-- ============================================================================

-- Create triggers for updatedAt columns
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'AiEvaluation') THEN
        DROP TRIGGER IF EXISTS update_ai_evaluation_updated_at ON "AiEvaluation";
        CREATE TRIGGER update_ai_evaluation_updated_at 
            BEFORE UPDATE ON "AiEvaluation" 
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================================================
-- 8. ENABLE ROW LEVEL SECURITY ON NEW TABLES
-- ============================================================================

-- Enable RLS on new tables
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'AiEvaluation') THEN
        ALTER TABLE "AiEvaluation" ENABLE ROW LEVEL SECURITY;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'LegacySubmission') THEN
        ALTER TABLE "LegacySubmission" ENABLE ROW LEVEL SECURITY;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ContentFingerprint') THEN
        ALTER TABLE "ContentFingerprint" ENABLE ROW LEVEL SECURITY;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'RolePromotionNotification') THEN
        ALTER TABLE "RolePromotionNotification" ENABLE ROW LEVEL SECURITY;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'SystemLog') THEN
        ALTER TABLE "SystemLog" ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;
