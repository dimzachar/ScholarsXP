-- ============================================================================
-- LEGACY ACCOUNT MERGE SYSTEM - ATOMIC FUNCTIONS
-- ============================================================================
-- This migration creates the database functions for atomic merge operations,
-- ensuring data consistency and proper error handling.

-- ============================================================================
-- 1. CORE MERGE ORCHESTRATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION atomic_merge_legacy_account(
    p_real_user_id UUID,
    p_legacy_user_id UUID,
    p_discord_handle TEXT,
    p_initiated_by TEXT DEFAULT 'SYSTEM'
) RETURNS JSONB AS $$
DECLARE
    v_merge_id UUID;
    v_lock_acquired BOOLEAN := FALSE;
    v_result JSONB;
    v_start_time TIMESTAMP := NOW();
    v_legacy_user RECORD;
    v_real_user RECORD;
    v_transfer_result JSONB;
    v_weekly_result JSONB;
    v_processing_time INTEGER;
BEGIN
    -- Validate input parameters
    IF p_real_user_id IS NULL OR p_legacy_user_id IS NULL THEN
        RAISE EXCEPTION 'User IDs cannot be null';
    END IF;
    
    IF p_real_user_id = p_legacy_user_id THEN
        RAISE EXCEPTION 'Cannot merge user with themselves';
    END IF;
    
    -- Get user records and validate they exist
    SELECT * INTO v_real_user FROM "User" WHERE "id" = p_real_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Real user not found: %', p_real_user_id;
    END IF;
    
    SELECT * INTO v_legacy_user FROM "User" WHERE "id" = p_legacy_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Legacy user not found: %', p_legacy_user_id;
    END IF;
    
    -- Validate legacy user is actually a legacy account
    IF NOT (v_legacy_user."email" LIKE '%@legacy.import') THEN
        RAISE EXCEPTION 'Target user is not a legacy account: %', v_legacy_user."email";
    END IF;
    
    -- Acquire merge lock to prevent concurrent operations
    BEGIN
        INSERT INTO "MergeLock" ("userId", "lockedBy", "lockReason") 
        VALUES (p_real_user_id, 'atomic_merge_function', 'MERGE_IN_PROGRESS');
        v_lock_acquired := TRUE;
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'User % already has an active merge in progress', p_real_user_id;
    END;
    
    -- Check for existing completed merge
    IF EXISTS (
        SELECT 1 FROM "UserMergeHistory" 
        WHERE "realUserId" = p_real_user_id 
        AND "legacyUserId" = p_legacy_user_id 
        AND "status" = 'COMPLETED'
    ) THEN
        -- Clean up lock and return success
        DELETE FROM "MergeLock" WHERE "userId" = p_real_user_id;
        RETURN jsonb_build_object(
            'status', 'already_completed',
            'message', 'Merge already completed for this user pair'
        );
    END IF;
    
    -- Create merge history record
    INSERT INTO "UserMergeHistory" (
        "realUserId", "legacyUserId", "legacyDiscordHandle", "legacyEmail",
        "status", "initiatedBy", "startedAt"
    ) VALUES (
        p_real_user_id, p_legacy_user_id, p_discord_handle, v_legacy_user."email",
        'IN_PROGRESS', p_initiated_by, v_start_time
    ) RETURNING "id" INTO v_merge_id;
    
    -- Create rollback point
    PERFORM create_merge_rollback_point(v_merge_id, p_real_user_id, p_legacy_user_id);
    
    -- Transfer XP transactions
    v_transfer_result := transfer_xp_transactions(p_legacy_user_id, p_real_user_id, v_merge_id);
    
    -- Transfer/merge weekly stats
    v_weekly_result := merge_weekly_stats(p_legacy_user_id, p_real_user_id, v_merge_id);
    
    -- Update user metadata
    UPDATE "User" SET
        "streakWeeks" = GREATEST("streakWeeks", v_legacy_user."streakWeeks"),
        "missedReviews" = "missedReviews" + v_legacy_user."missedReviews",
        "lastMergeAt" = NOW(),
        "mergeCount" = "mergeCount" + 1,
        "updatedAt" = NOW()
    WHERE "id" = p_real_user_id;
    
    -- Recalculate total XP from all transactions
    UPDATE "User" SET "totalXp" = (
        SELECT COALESCE(SUM("amount"), 0) 
        FROM "XpTransaction" 
        WHERE "userId" = p_real_user_id
    ) WHERE "id" = p_real_user_id;
    
    -- Delete legacy account (cascading deletes will clean up related data)
    DELETE FROM "User" WHERE "id" = p_legacy_user_id;
    
    -- Calculate processing time
    v_processing_time := EXTRACT(EPOCH FROM (NOW() - v_start_time)) * 1000;
    
    -- Update merge history with success
    UPDATE "UserMergeHistory" SET
        "status" = 'COMPLETED',
        "completedAt" = NOW(),
        "transactionsTransferred" = (v_transfer_result->>'transferred')::INTEGER,
        "xpTransferred" = (v_transfer_result->>'totalXp')::INTEGER,
        "weeklyStatsTransferred" = (v_weekly_result->>'merged')::INTEGER,
        "weeklyStatsConflicts" = (v_weekly_result->>'conflicts_resolved')::INTEGER,
        "processingTimeMs" = v_processing_time
    WHERE "id" = v_merge_id;
    
    -- Release lock
    DELETE FROM "MergeLock" WHERE "userId" = p_real_user_id;
    
    -- Build success result
    v_result := jsonb_build_object(
        'status', 'success',
        'mergeId', v_merge_id,
        'processingTimeMs', v_processing_time,
        'transactionsTransferred', v_transfer_result->>'transferred',
        'totalXpTransferred', v_transfer_result->>'totalXp',
        'weeklyStatsTransferred', v_weekly_result->>'merged',
        'weeklyStatsConflicts', v_weekly_result->>'conflicts_resolved'
    );
    
    RETURN v_result;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Calculate processing time for error case
        v_processing_time := EXTRACT(EPOCH FROM (NOW() - v_start_time)) * 1000;
        
        -- Update merge history with failure
        IF v_merge_id IS NOT NULL THEN
            UPDATE "UserMergeHistory" SET
                "status" = 'FAILED',
                "completedAt" = NOW(),
                "errorMessage" = SQLERRM,
                "errorDetails" = jsonb_build_object(
                    'sqlstate', SQLSTATE,
                    'context', 'atomic_merge_legacy_account',
                    'processingTimeMs', v_processing_time
                ),
                "processingTimeMs" = v_processing_time
            WHERE "id" = v_merge_id;
        END IF;
        
        -- Release lock if acquired
        IF v_lock_acquired THEN
            DELETE FROM "MergeLock" WHERE "userId" = p_real_user_id;
        END IF;
        
        -- Re-raise the exception
        RAISE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. XP TRANSACTION TRANSFER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION transfer_xp_transactions(
    p_legacy_user_id UUID,
    p_real_user_id UUID,
    p_merge_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_batch_id UUID;
    v_transaction RECORD;
    v_transferred_count INTEGER := 0;
    v_total_xp INTEGER := 0;
    v_duplicate_count INTEGER := 0;
    v_error_count INTEGER := 0;
    v_result JSONB;
BEGIN
    -- Create transfer batch record
    INSERT INTO "TransferBatch" (
        "mergeId", "legacyUserId", "realUserId", "batchType", "status", "startedAt"
    ) VALUES (
        p_merge_id, p_legacy_user_id, p_real_user_id, 'XP_TRANSACTIONS', 'IN_PROGRESS', NOW()
    ) RETURNING "id" INTO v_batch_id;
    
    -- Transfer each transaction with duplicate detection
    FOR v_transaction IN 
        SELECT * FROM "XpTransaction" 
        WHERE "userId" = p_legacy_user_id
        ORDER BY "createdAt"
    LOOP
        BEGIN
            -- Check for existing transfer (comprehensive duplicate detection)
            IF NOT EXISTS (
                SELECT 1 FROM "XpTransaction" 
                WHERE "userId" = p_real_user_id 
                AND "sourceId" = v_transaction."sourceId"
                AND "amount" = v_transaction."amount"
                AND "weekNumber" = v_transaction."weekNumber"
                AND "sourceType" = 'LEGACY_TRANSFER'
                AND ("description" LIKE '%Legacy transfer:%' OR "mergeId" IS NOT NULL)
            ) THEN
                -- Insert transferred transaction
                INSERT INTO "XpTransaction" (
                    "userId", "amount", "type", "description", "sourceId", 
                    "weekNumber", "createdAt", "sourceType", "mergeId"
                ) VALUES (
                    p_real_user_id,
                    v_transaction."amount",
                    v_transaction."type",
                    CASE 
                        WHEN v_transaction."description" LIKE 'Legacy import:%' THEN
                            REPLACE(v_transaction."description", 'Legacy import:', 'Legacy transfer:')
                        ELSE
                            'Legacy transfer: ' || v_transaction."description"
                    END,
                    v_transaction."sourceId",
                    v_transaction."weekNumber",
                    v_transaction."createdAt",
                    'LEGACY_TRANSFER',
                    p_merge_id
                );
                
                v_transferred_count := v_transferred_count + 1;
                v_total_xp := v_total_xp + v_transaction."amount";
            ELSE
                v_duplicate_count := v_duplicate_count + 1;
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                v_error_count := v_error_count + 1;
                -- Log error but continue processing
                RAISE WARNING 'Error transferring transaction %: %', v_transaction."id", SQLERRM;
        END;
    END LOOP;
    
    -- Update batch status
    UPDATE "TransferBatch" SET 
        "status" = CASE WHEN v_error_count = 0 THEN 'COMPLETED' ELSE 'FAILED' END,
        "itemsProcessed" = v_transferred_count + v_duplicate_count + v_error_count,
        "itemsTransferred" = v_transferred_count,
        "itemsSkipped" = v_duplicate_count,
        "totalValue" = v_total_xp,
        "completedAt" = NOW(),
        "errorMessage" = CASE WHEN v_error_count > 0 THEN 
            format('%s errors occurred during transfer', v_error_count) 
            ELSE NULL END
    WHERE "id" = v_batch_id;
    
    -- Build result
    v_result := jsonb_build_object(
        'status', CASE WHEN v_error_count = 0 THEN 'success' ELSE 'partial_success' END,
        'batchId', v_batch_id,
        'transferred', v_transferred_count,
        'totalXp', v_total_xp,
        'duplicates', v_duplicate_count,
        'errors', v_error_count
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. WEEKLY STATS MERGE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION merge_weekly_stats(
    p_legacy_user_id UUID,
    p_real_user_id UUID,
    p_merge_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_batch_id UUID;
    v_legacy_stat RECORD;
    v_merged_count INTEGER := 0;
    v_conflict_count INTEGER := 0;
    v_error_count INTEGER := 0;
BEGIN
    -- Create transfer batch record
    INSERT INTO "TransferBatch" (
        "mergeId", "legacyUserId", "realUserId", "batchType", "status", "startedAt"
    ) VALUES (
        p_merge_id, p_legacy_user_id, p_real_user_id, 'WEEKLY_STATS', 'IN_PROGRESS', NOW()
    ) RETURNING "id" INTO v_batch_id;

    -- Process each legacy weekly stat
    FOR v_legacy_stat IN
        SELECT * FROM "WeeklyStats"
        WHERE "userId" = p_legacy_user_id
        ORDER BY "weekNumber"
    LOOP
        BEGIN
            -- Check for existing stats for same week
            IF EXISTS (
                SELECT 1 FROM "WeeklyStats"
                WHERE "userId" = p_real_user_id
                AND "weekNumber" = v_legacy_stat."weekNumber"
            ) THEN
                -- Merge stats (sum values, preserve streak if either earned it)
                UPDATE "WeeklyStats" SET
                    "xpTotal" = "xpTotal" + v_legacy_stat."xpTotal",
                    "reviewsDone" = "reviewsDone" + v_legacy_stat."reviewsDone",
                    "reviewsMissed" = "reviewsMissed" + v_legacy_stat."reviewsMissed",
                    "earnedStreak" = "earnedStreak" OR v_legacy_stat."earnedStreak",
                    "mergedFromLegacy" = TRUE,
                    "originalLegacyUserId" = p_legacy_user_id,
                    "updatedAt" = NOW()
                WHERE "userId" = p_real_user_id
                AND "weekNumber" = v_legacy_stat."weekNumber";

                v_conflict_count := v_conflict_count + 1;
            ELSE
                -- Transfer stats directly
                UPDATE "WeeklyStats" SET
                    "userId" = p_real_user_id,
                    "mergedFromLegacy" = TRUE,
                    "originalLegacyUserId" = p_legacy_user_id,
                    "updatedAt" = NOW()
                WHERE "id" = v_legacy_stat."id";

                v_merged_count := v_merged_count + 1;
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                v_error_count := v_error_count + 1;
                RAISE WARNING 'Error merging weekly stat %: %', v_legacy_stat."id", SQLERRM;
        END;
    END LOOP;

    -- Update batch status
    UPDATE "TransferBatch" SET
        "status" = CASE WHEN v_error_count = 0 THEN 'COMPLETED' ELSE 'FAILED' END,
        "itemsProcessed" = v_merged_count + v_conflict_count + v_error_count,
        "itemsTransferred" = v_merged_count,
        "itemsSkipped" = v_conflict_count,
        "completedAt" = NOW(),
        "errorMessage" = CASE WHEN v_error_count > 0 THEN
            format('%s errors occurred during weekly stats merge', v_error_count)
            ELSE NULL END
    WHERE "id" = v_batch_id;

    RETURN jsonb_build_object(
        'status', CASE WHEN v_error_count = 0 THEN 'success' ELSE 'partial_success' END,
        'batchId', v_batch_id,
        'merged', v_merged_count,
        'conflicts_resolved', v_conflict_count,
        'errors', v_error_count
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. ROLLBACK FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION create_merge_rollback_point(
    p_merge_id UUID,
    p_real_user_id UUID,
    p_legacy_user_id UUID
) RETURNS UUID AS $$
DECLARE
    v_rollback_id UUID;
    v_rollback_data JSONB;
BEGIN
    -- Capture current state for rollback
    SELECT jsonb_build_object(
        'realUser', row_to_json(ru.*),
        'legacyUser', row_to_json(lu.*),
        'realUserTransactions', (
            SELECT jsonb_agg(row_to_json(t.*))
            FROM "XpTransaction" t
            WHERE t."userId" = p_real_user_id
        ),
        'realUserWeeklyStats', (
            SELECT jsonb_agg(row_to_json(w.*))
            FROM "WeeklyStats" w
            WHERE w."userId" = p_real_user_id
        ),
        'legacyUserTransactions', (
            SELECT jsonb_agg(row_to_json(t.*))
            FROM "XpTransaction" t
            WHERE t."userId" = p_legacy_user_id
        ),
        'legacyUserWeeklyStats', (
            SELECT jsonb_agg(row_to_json(w.*))
            FROM "WeeklyStats" w
            WHERE w."userId" = p_legacy_user_id
        ),
        'timestamp', NOW()
    ) INTO v_rollback_data
    FROM "User" ru, "User" lu
    WHERE ru."id" = p_real_user_id AND lu."id" = p_legacy_user_id;

    -- Store rollback point
    INSERT INTO "RollbackPoint" ("mergeId", "rollbackData")
    VALUES (p_merge_id, v_rollback_data)
    RETURNING "id" INTO v_rollback_id;

    RETURN v_rollback_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. UTILITY FUNCTIONS
-- ============================================================================

-- Function to find legacy account by Discord handle
CREATE OR REPLACE FUNCTION find_legacy_account_by_handle(
    p_discord_handle TEXT
) RETURNS TABLE (
    user_id UUID,
    email TEXT,
    username TEXT,
    discord_handle TEXT,
    total_xp INTEGER,
    created_at TIMESTAMP
) AS $$
BEGIN
    -- Try exact match first
    RETURN QUERY
    SELECT u."id", u."email", u."username", u."discordHandle", u."totalXp", u."createdAt"
    FROM "User" u
    WHERE u."discordHandle" = p_discord_handle
    AND u."email" LIKE '%@legacy.import'
    LIMIT 1;

    -- If no exact match, try base handle (without discriminator)
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT u."id", u."email", u."username", u."discordHandle", u."totalXp", u."createdAt"
        FROM "User" u
        WHERE u."discordHandle" = split_part(p_discord_handle, '#', 1)
        AND u."email" LIKE '%@legacy.import'
        LIMIT 1;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to get merge status
CREATE OR REPLACE FUNCTION get_merge_status(p_user_id UUID)
RETURNS TABLE (
    merge_id UUID,
    status TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    transactions_transferred INTEGER,
    xp_transferred INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        h."id",
        h."status",
        h."startedAt",
        h."completedAt",
        h."errorMessage",
        h."transactionsTransferred",
        h."xpTransferred"
    FROM "UserMergeHistory" h
    WHERE h."realUserId" = p_user_id
    ORDER BY h."startedAt" DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. MAINTENANCE FUNCTIONS
-- ============================================================================

-- Function to clean up old merge data
CREATE OR REPLACE FUNCTION cleanup_old_merge_data(p_days_old INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    -- Clean up completed merges older than specified days
    DELETE FROM "UserMergeHistory"
    WHERE "status" = 'COMPLETED'
    AND "completedAt" < (NOW() - (p_days_old || ' days')::INTERVAL);

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Clean up expired locks
    PERFORM cleanup_expired_merge_locks();

    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON FUNCTION atomic_merge_legacy_account IS 'Main function for atomic legacy account merging with full rollback support';
COMMENT ON FUNCTION transfer_xp_transactions IS 'Transfers XP transactions from legacy to real user with duplicate detection';
COMMENT ON FUNCTION merge_weekly_stats IS 'Merges weekly statistics with conflict resolution';
COMMENT ON FUNCTION create_merge_rollback_point IS 'Creates rollback point before merge operations';
COMMENT ON FUNCTION find_legacy_account_by_handle IS 'Finds legacy account using deterministic matching algorithm';
COMMENT ON FUNCTION get_merge_status IS 'Returns current merge status for a user';
COMMENT ON FUNCTION cleanup_old_merge_data IS 'Maintenance function to clean up old merge records';
