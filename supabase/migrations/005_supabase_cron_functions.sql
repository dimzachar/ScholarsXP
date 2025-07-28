-- ============================================================================
-- MIGRATION 005: Supabase pg_cron Functions for Background Processing
-- Date: 2025-01-20
-- Purpose: Create database-native cron functions for AI evaluation and role promotions
-- ============================================================================

-- ============================================================================
-- 1. ENABLE PG_CRON EXTENSION
-- ============================================================================

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================================
-- 2. AI EVALUATION PROCESSING FUNCTION
-- ============================================================================

-- Create AI evaluation processing function
CREATE OR REPLACE FUNCTION process_ai_evaluations()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    evaluation_record RECORD;
    content_data TEXT;
    ai_result JSONB;
    processed_count INTEGER := 0;
BEGIN
    -- Log start of processing
    INSERT INTO "SystemLog" ("level", "message", "metadata", "createdAt")
    VALUES (
        'INFO',
        'AI evaluation processing started',
        jsonb_build_object('timestamp', NOW()),
        NOW()
    );

    -- Process pending AI evaluations (limit to 10 per run to avoid timeouts)
    FOR evaluation_record IN 
        SELECT ae.*, s.url, s.id as submission_id, s."userId", s.platform
        FROM "AiEvaluation" ae
        JOIN "Submission" s ON ae."submissionId" = s.id
        WHERE ae.status = 'PENDING' 
        AND ae."retryCount" < 3
        ORDER BY ae."createdAt" ASC
        LIMIT 10
    LOOP
        BEGIN
            -- Mark as processing
            UPDATE "AiEvaluation" 
            SET status = 'PROCESSING', 
                "processingStartedAt" = NOW(),
                "updatedAt" = NOW()
            WHERE id = evaluation_record.id;

            -- Log the processing attempt
            INSERT INTO "SystemLog" ("level", "message", "metadata", "createdAt")
            VALUES (
                'INFO',
                'AI evaluation processing started for submission',
                jsonb_build_object(
                    'evaluationId', evaluation_record.id,
                    'submissionId', evaluation_record.submission_id,
                    'url', evaluation_record.url,
                    'platform', evaluation_record.platform
                ),
                NOW()
            );

            -- Note: Actual AI evaluation will be handled by the application layer
            -- This function marks items for processing and logs the attempts
            -- The application will poll for PROCESSING status items and handle them

            processed_count := processed_count + 1;

        EXCEPTION WHEN OTHERS THEN
            -- Handle errors
            UPDATE "AiEvaluation" 
            SET status = 'FAILED',
                "errorMessage" = SQLERRM,
                "retryCount" = "retryCount" + 1,
                "updatedAt" = NOW()
            WHERE id = evaluation_record.id;
            
            INSERT INTO "SystemLog" ("level", "message", "metadata", "createdAt")
            VALUES (
                'ERROR',
                'AI evaluation processing failed',
                jsonb_build_object(
                    'evaluationId', evaluation_record.id,
                    'submissionId', evaluation_record.submission_id,
                    'error', SQLERRM
                ),
                NOW()
            );
        END;
    END LOOP;

    -- Log completion
    INSERT INTO "SystemLog" ("level", "message", "metadata", "createdAt")
    VALUES (
        'INFO',
        'AI evaluation processing completed',
        jsonb_build_object(
            'processedCount', processed_count,
            'timestamp', NOW()
        ),
        NOW()
    );
END;
$$;

-- ============================================================================
-- 3. ROLE PROMOTION CHECKING FUNCTION
-- ============================================================================

-- Create role promotion checking function
CREATE OR REPLACE FUNCTION check_role_promotions()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    user_record RECORD;
    old_role TEXT;
    new_role TEXT;
    promotion_count INTEGER := 0;
BEGIN
    -- Log start of role promotion check
    INSERT INTO "SystemLog" ("level", "message", "metadata", "createdAt")
    VALUES (
        'INFO',
        'Role promotion check started',
        jsonb_build_object('timestamp', NOW()),
        NOW()
    );

    -- Check users eligible for REVIEWER promotion (1000+ XP)
    FOR user_record IN 
        SELECT id, role, "totalXp", "discordHandle", username, email
        FROM "User"
        WHERE role = 'USER' 
        AND "totalXp" >= 1000
        LIMIT 50
    LOOP
        old_role := user_record.role;
        new_role := 'REVIEWER';
        
        -- Update user role
        UPDATE "User" 
        SET role = new_role,
            "updatedAt" = NOW()
        WHERE id = user_record.id;
        
        -- Create promotion notification
        INSERT INTO "RolePromotionNotification" (
            "userId", 
            "oldRole", 
            "newRole", 
            "xpAtPromotion", 
            "discordHandle",
            "notificationSent"
        ) VALUES (
            user_record.id,
            old_role,
            new_role,
            user_record."totalXp",
            user_record."discordHandle",
            false
        );
        
        -- Log the promotion in XP transactions
        INSERT INTO "XpTransaction" (
            "userId",
            "amount",
            "type",
            "description",
            "weekNumber"
        ) VALUES (
            user_record.id,
            0,
            'ROLE_PROMOTION',
            'Role promoted from ' || old_role || ' to ' || new_role || ' at ' || user_record."totalXp" || ' XP',
            EXTRACT(WEEK FROM NOW())
        );
        
        -- Log the promotion in system logs
        INSERT INTO "SystemLog" ("level", "message", "metadata", "createdAt")
        VALUES (
            'INFO',
            'User role promoted',
            jsonb_build_object(
                'userId', user_record.id,
                'username', user_record.username,
                'email', user_record.email,
                'oldRole', old_role,
                'newRole', new_role,
                'xp', user_record."totalXp",
                'discordHandle', user_record."discordHandle"
            ),
            NOW()
        );

        promotion_count := promotion_count + 1;
    END LOOP;

    -- Log completion
    INSERT INTO "SystemLog" ("level", "message", "metadata", "createdAt")
    VALUES (
        'INFO',
        'Role promotion check completed',
        jsonb_build_object(
            'promotionCount', promotion_count,
            'timestamp', NOW()
        ),
        NOW()
    );
END;
$$;

-- ============================================================================
-- 4. SYSTEM LOG CLEANUP FUNCTION
-- ============================================================================

-- Create cleanup function to prevent log table from growing too large
CREATE OR REPLACE FUNCTION cleanup_system_logs()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Keep only last 30 days of logs
    DELETE FROM "SystemLog" 
    WHERE "createdAt" < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log the cleanup
    INSERT INTO "SystemLog" ("level", "message", "metadata", "createdAt")
    VALUES (
        'INFO',
        'System log cleanup completed',
        jsonb_build_object(
            'deletedCount', deleted_count,
            'timestamp', NOW()
        ),
        NOW()
    );
END;
$$;

-- ============================================================================
-- 5. SCHEDULE CRON JOBS
-- ============================================================================

-- Schedule AI evaluation processing (every hour)
SELECT cron.schedule(
    'ai-evaluation-processing',
    '0 * * * *', -- Every hour at minute 0
    'SELECT process_ai_evaluations();'
);

-- Schedule role promotion check (every 6 hours)
SELECT cron.schedule(
    'role-promotion-check',
    '0 */6 * * *', -- Every 6 hours at minute 0
    'SELECT check_role_promotions();'
);

-- Schedule system log cleanup (weekly on Sunday at 2 AM)
SELECT cron.schedule(
    'system-log-cleanup',
    '0 2 * * 0', -- Every Sunday at 2 AM
    'SELECT cleanup_system_logs();'
);

-- ============================================================================
-- 6. VERIFICATION QUERIES
-- ============================================================================

-- Check that pg_cron extension is enabled
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- List all scheduled cron jobs
SELECT * FROM cron.job ORDER BY jobname;

-- Verify functions were created
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('process_ai_evaluations', 'check_role_promotions', 'cleanup_system_logs')
ORDER BY routine_name;
