-- ============================================================================
-- LEGACY ACCOUNT MERGE SYSTEM - FOUNDATION MIGRATION (FIXED VERSION)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. USER MERGE HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "UserMergeHistory" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "realUserId" UUID NOT NULL,
    "legacyUserId" UUID,
    "legacyDiscordHandle" TEXT NOT NULL,
    "legacyEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL CHECK ("status" IN (
        'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'ROLLED_BACK', 'CANCELLED'
    )),
    "startedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "completedAt" TIMESTAMP,
    "errorMessage" TEXT,
    "errorDetails" JSONB,
    "transactionsTransferred" INTEGER DEFAULT 0,
    "xpTransferred" INTEGER DEFAULT 0,
    "weeklyStatsTransferred" INTEGER DEFAULT 0,
    "weeklyStatsConflicts" INTEGER DEFAULT 0,
    "rollbackData" JSONB,
    "initiatedBy" TEXT DEFAULT 'SYSTEM',
    "mergeVersion" TEXT DEFAULT '2.0',
    "processingTimeMs" INTEGER,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. MERGE LOCK TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "MergeLock" (
    "userId" UUID PRIMARY KEY,
    "lockedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "lockedBy" TEXT NOT NULL,
    "lockReason" TEXT NOT NULL DEFAULT 'MERGE_IN_PROGRESS',
    "expiresAt" TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
    "metadata" JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- 3. TRANSFER BATCH TABLE (FIXED)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "TransferBatch" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "mergeId" UUID NOT NULL,
    "legacyUserId" UUID NOT NULL,
    "realUserId" UUID NOT NULL,
    "batchType" TEXT NOT NULL CHECK ("batchType" IN (
        'XP_TRANSACTIONS',
        'WEEKLY_STATS', 
        'USER_DATA'
    )),
    "status" TEXT NOT NULL CHECK ("status" IN (
        'PENDING',
        'IN_PROGRESS',
        'COMPLETED', 
        'FAILED'
    )) DEFAULT 'PENDING',
    "itemsProcessed" INTEGER DEFAULT 0,
    "itemsTransferred" INTEGER DEFAULT 0,
    "itemsSkipped" INTEGER DEFAULT 0,
    "totalValue" INTEGER DEFAULT 0,
    "errorMessage" TEXT,
    "retryCount" INTEGER DEFAULT 0,
    "maxRetries" INTEGER DEFAULT 3,
    "startedAt" TIMESTAMP,
    "completedAt" TIMESTAMP,
    "processingTimeMs" INTEGER,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. ROLLBACK POINT TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "RollbackPoint" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "mergeId" UUID NOT NULL,
    "rollbackData" JSONB NOT NULL,
    "dataVersion" TEXT NOT NULL DEFAULT '1.0',
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. ADD COLUMNS TO EXISTING TABLES
-- ============================================================================

-- Add sourceType column to XpTransaction if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'XpTransaction' AND column_name = 'sourceType'
    ) THEN
        ALTER TABLE "XpTransaction" ADD COLUMN "sourceType" TEXT;
    END IF;
END $$;

-- Add mergeId column to XpTransaction if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'XpTransaction' AND column_name = 'mergeId'
    ) THEN
        ALTER TABLE "XpTransaction" ADD COLUMN "mergeId" UUID;
    END IF;
END $$;

-- Add merge tracking columns to User table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'User' AND column_name = 'lastMergeAt'
    ) THEN
        ALTER TABLE "User" ADD COLUMN "lastMergeAt" TIMESTAMP;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'User' AND column_name = 'mergeCount'
    ) THEN
        ALTER TABLE "User" ADD COLUMN "mergeCount" INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add merge tracking columns to WeeklyStats table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'WeeklyStats' AND column_name = 'mergedFromLegacy'
    ) THEN
        ALTER TABLE "WeeklyStats" ADD COLUMN "mergedFromLegacy" BOOLEAN DEFAULT FALSE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'WeeklyStats' AND column_name = 'originalLegacyUserId'
    ) THEN
        ALTER TABLE "WeeklyStats" ADD COLUMN "originalLegacyUserId" UUID;
    END IF;
END $$;

-- ============================================================================
-- 6. CREATE INDEXES
-- ============================================================================

-- UserMergeHistory indexes
CREATE INDEX IF NOT EXISTS "UserMergeHistory_realUserId_idx" ON "UserMergeHistory"("realUserId");
CREATE INDEX IF NOT EXISTS "UserMergeHistory_status_idx" ON "UserMergeHistory"("status");
CREATE INDEX IF NOT EXISTS "UserMergeHistory_startedAt_idx" ON "UserMergeHistory"("startedAt");

-- MergeLock indexes
CREATE INDEX IF NOT EXISTS "MergeLock_expiresAt_idx" ON "MergeLock"("expiresAt");

-- TransferBatch indexes
CREATE INDEX IF NOT EXISTS "TransferBatch_mergeId_idx" ON "TransferBatch"("mergeId");
CREATE INDEX IF NOT EXISTS "TransferBatch_status_idx" ON "TransferBatch"("status");

-- RollbackPoint indexes
CREATE INDEX IF NOT EXISTS "RollbackPoint_mergeId_idx" ON "RollbackPoint"("mergeId");

-- XpTransaction indexes
CREATE INDEX IF NOT EXISTS "XpTransaction_mergeId_idx" ON "XpTransaction"("mergeId");
CREATE INDEX IF NOT EXISTS "XpTransaction_sourceType_idx" ON "XpTransaction"("sourceType");

-- User indexes
CREATE INDEX IF NOT EXISTS "User_lastMergeAt_idx" ON "User"("lastMergeAt");

-- ============================================================================
-- 7. CREATE UNIQUE CONSTRAINTS
-- ============================================================================

-- Only one active merge per real user
CREATE UNIQUE INDEX IF NOT EXISTS "UserMergeHistory_active_merge_unique" 
ON "UserMergeHistory"("realUserId") 
WHERE "status" IN ('PENDING', 'IN_PROGRESS');

-- One batch per merge per type
CREATE UNIQUE INDEX IF NOT EXISTS "TransferBatch_merge_type_unique" 
ON "TransferBatch"("mergeId", "batchType");

-- Prevent duplicate legacy transfers
CREATE UNIQUE INDEX IF NOT EXISTS "XpTransaction_legacy_transfer_unique"
ON "XpTransaction"("userId", "sourceId", "amount", "weekNumber")
WHERE "sourceType" = 'LEGACY_TRANSFER';

-- ============================================================================
-- 8. ADD FOREIGN KEY CONSTRAINTS (AFTER TABLES EXIST)
-- ============================================================================

-- Add foreign key constraints that reference the new tables
DO $$
BEGIN
    -- UserMergeHistory foreign keys
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'UserMergeHistory_realUserId_fkey'
    ) THEN
        ALTER TABLE "UserMergeHistory" 
        ADD CONSTRAINT "UserMergeHistory_realUserId_fkey" 
        FOREIGN KEY ("realUserId") REFERENCES "User"("id") ON DELETE CASCADE;
    END IF;
    
    -- TransferBatch foreign keys
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'TransferBatch_mergeId_fkey'
    ) THEN
        ALTER TABLE "TransferBatch" 
        ADD CONSTRAINT "TransferBatch_mergeId_fkey" 
        FOREIGN KEY ("mergeId") REFERENCES "UserMergeHistory"("id") ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'TransferBatch_realUserId_fkey'
    ) THEN
        ALTER TABLE "TransferBatch" 
        ADD CONSTRAINT "TransferBatch_realUserId_fkey" 
        FOREIGN KEY ("realUserId") REFERENCES "User"("id") ON DELETE CASCADE;
    END IF;
    
    -- RollbackPoint foreign keys
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'RollbackPoint_mergeId_fkey'
    ) THEN
        ALTER TABLE "RollbackPoint" 
        ADD CONSTRAINT "RollbackPoint_mergeId_fkey" 
        FOREIGN KEY ("mergeId") REFERENCES "UserMergeHistory"("id") ON DELETE CASCADE;
    END IF;
    
    -- XpTransaction foreign key for mergeId
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'XpTransaction_mergeId_fkey'
    ) THEN
        ALTER TABLE "XpTransaction" 
        ADD CONSTRAINT "XpTransaction_mergeId_fkey" 
        FOREIGN KEY ("mergeId") REFERENCES "UserMergeHistory"("id");
    END IF;
    
    -- MergeLock foreign key
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'MergeLock_userId_fkey'
    ) THEN
        ALTER TABLE "MergeLock" 
        ADD CONSTRAINT "MergeLock_userId_fkey" 
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
    END IF;
END $$;

-- ============================================================================
-- 9. SUCCESS MESSAGE
-- ============================================================================

DO $$
DECLARE
    legacy_count INTEGER;
    real_count INTEGER;
BEGIN
    -- Count legacy accounts
    SELECT COUNT(*) INTO legacy_count 
    FROM "User" 
    WHERE "email" LIKE '%@legacy.import';
    
    -- Count real Discord accounts  
    SELECT COUNT(*) INTO real_count 
    FROM "User" 
    WHERE "discordId" IS NOT NULL AND "email" NOT LIKE '%@legacy.import';
    
    RAISE NOTICE '✅ MERGE SYSTEM MIGRATION COMPLETED SUCCESSFULLY!';
    RAISE NOTICE 'Found % legacy accounts and % real Discord accounts', legacy_count, real_count;
    RAISE NOTICE 'All tables, indexes, and constraints created successfully.';
    RAISE NOTICE 'You can now run: npx tsx scripts/test-merge-system.ts';
END $$;
