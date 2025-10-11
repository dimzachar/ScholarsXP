-- Quick fix for transaction isolation issue
-- Run this in your Supabase SQL Editor

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
    v_new_handle TEXT;
    v_old_handle_variants TEXT[];
    v_old_base_handle TEXT;
    v_old_handle_label TEXT;
    v_reassignment_note TEXT;
    v_handles_reassigned INTEGER := 0;
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
    
    -- Reassign legacy submissions to the merged handle
    v_new_handle := NULLIF(TRIM(COALESCE(
        v_real_user."discordHandle",
        p_discord_handle,
        v_real_user."username"
    )), '');

    IF v_new_handle IS NOT NULL THEN
        v_old_handle_variants := ARRAY[]::TEXT[];

        IF v_legacy_user."discordHandle" IS NOT NULL AND TRIM(v_legacy_user."discordHandle") <> '' THEN
            v_old_handle_variants := array_append(v_old_handle_variants, LOWER(TRIM(v_legacy_user."discordHandle")));
            v_old_handle_variants := array_append(v_old_handle_variants, LOWER(TRIM(v_legacy_user."discordHandle" || '#0')));
            v_old_base_handle := TRIM(split_part(v_legacy_user."discordHandle", '#', 1));
            IF v_old_base_handle IS NOT NULL AND v_old_base_handle <> '' THEN
                v_old_handle_variants := array_append(v_old_handle_variants, LOWER(v_old_base_handle));
                v_old_handle_variants := array_append(v_old_handle_variants, LOWER(v_old_base_handle || '#0'));
            END IF;
        END IF;

        IF v_legacy_user."username" IS NOT NULL AND TRIM(v_legacy_user."username") <> '' THEN
            v_old_handle_variants := array_append(v_old_handle_variants, LOWER(TRIM(v_legacy_user."username")));
            v_old_handle_variants := array_append(v_old_handle_variants, LOWER(TRIM(v_legacy_user."username" || '#0')));
        END IF;

        IF v_old_handle_variants IS NOT NULL THEN
            SELECT ARRAY(SELECT DISTINCT h FROM unnest(v_old_handle_variants) AS h WHERE h IS NOT NULL AND h <> '')
            INTO v_old_handle_variants;
        END IF;

        IF v_old_handle_variants IS NOT NULL AND array_length(v_old_handle_variants, 1) > 0 THEN
            v_old_handle_label := COALESCE(
                NULLIF(TRIM(v_legacy_user."discordHandle"), ''),
                NULLIF(TRIM(v_legacy_user."username"), ''),
                'unknown'
            );

            v_reassignment_note := format(
                '%s merge reassigned from %s to %s',
                to_char(NOW(), 'YYYY-MM-DD'),
                v_old_handle_label,
                v_new_handle
            );

            UPDATE "LegacySubmission"
            SET "discordHandle" = v_new_handle,
                "adminNotes" = CASE
                    WHEN "adminNotes" IS NULL OR "adminNotes" = '' THEN v_reassignment_note
                    ELSE "adminNotes" || E'\n' || v_reassignment_note
                END,
                "adminUpdatedAt" = NOW(),
                "adminUpdatedBy" = p_real_user_id
            WHERE LOWER("discordHandle") = ANY (v_old_handle_variants);

            GET DIAGNOSTICS v_handles_reassigned = ROW_COUNT;
        END IF;
    END IF;

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
        'weeklyStatsConflicts', v_weekly_result->>'conflicts_resolved',
        'legacySubmissionsRekeyed', v_handles_reassigned
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
