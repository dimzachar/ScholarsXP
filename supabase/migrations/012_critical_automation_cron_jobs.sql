-- ============================================================================
-- Critical Automation Cron Jobs - Addresses Missing Automation Gaps
-- Date: 2025-01-28
-- Purpose: Implement scheduled automation for weekly operations and XP aggregation
-- 
-- This migration addresses the critical operational gaps identified in the 
-- automation architecture analysis where:
-- 1. Weekly operations (streaks, penalties, leaderboards) are never processed automatically
-- 2. XP aggregation for submissions with 3+ reviews never happens automatically
-- ============================================================================

-- ============================================================================
-- 1. ENABLE REQUIRED EXTENSIONS
-- ============================================================================

-- Ensure pg_cron is enabled (should already be enabled from previous migrations)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable http extension for making API calls to our Next.js endpoints
CREATE EXTENSION IF NOT EXISTS http;

-- ============================================================================
-- 2. CREATE AUTOMATION MONITORING TABLE
-- ============================================================================

-- Table to track automation runs and their success/failure status
CREATE TABLE IF NOT EXISTS "AutomationLog" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "jobName" TEXT NOT NULL,
    "jobType" TEXT NOT NULL, -- 'weekly_operations', 'xp_aggregation', 'manual'
    "triggeredBy" TEXT NOT NULL, -- 'cron', 'admin_user_id'
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "completedAt" TIMESTAMPTZ,
    "status" TEXT NOT NULL DEFAULT 'RUNNING', -- 'RUNNING', 'SUCCESS', 'FAILED'
    "result" JSONB, -- Store detailed results from the operation
    "errorMessage" TEXT,
    "duration" INTEGER, -- Duration in milliseconds
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS "AutomationLog_jobType_startedAt_idx" ON "AutomationLog" ("jobType", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "AutomationLog_status_startedAt_idx" ON "AutomationLog" ("status", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "AutomationLog_jobName_startedAt_idx" ON "AutomationLog" ("jobName", "startedAt" DESC);

-- ============================================================================
-- 3. CREATE AUTOMATION HELPER FUNCTIONS
-- ============================================================================

-- Function to log automation start
CREATE OR REPLACE FUNCTION log_automation_start(
    job_name TEXT,
    job_type TEXT,
    triggered_by TEXT DEFAULT 'cron'
) RETURNS UUID AS $$
DECLARE
    log_id UUID;
BEGIN
    INSERT INTO "AutomationLog" ("jobName", "jobType", "triggeredBy", "status")
    VALUES (job_name, job_type, triggered_by, 'RUNNING')
    RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to log automation completion
CREATE OR REPLACE FUNCTION log_automation_complete(
    log_id UUID,
    success BOOLEAN,
    result_data JSONB DEFAULT NULL,
    error_msg TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    start_time TIMESTAMPTZ;
    duration_ms INTEGER;
BEGIN
    -- Get start time to calculate duration
    SELECT "startedAt" INTO start_time FROM "AutomationLog" WHERE id = log_id;
    duration_ms := EXTRACT(EPOCH FROM (NOW() - start_time)) * 1000;
    
    UPDATE "AutomationLog" 
    SET 
        "completedAt" = NOW(),
        "status" = CASE WHEN success THEN 'SUCCESS' ELSE 'FAILED' END,
        "result" = result_data,
        "errorMessage" = error_msg,
        "duration" = duration_ms,
        "updatedAt" = NOW()
    WHERE id = log_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. CREATE WEEKLY OPERATIONS AUTOMATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION execute_weekly_operations() RETURNS VOID AS $$
DECLARE
    log_id UUID;
    api_response http_response;
    response_data JSONB;
    success BOOLEAN := FALSE;
BEGIN
    -- Log automation start
    log_id := log_automation_start('weekly-operations-cron', 'weekly_operations', 'cron');
    
    BEGIN
        -- Make HTTP POST request to our Next.js API endpoint
        -- Note: Replace 'your-domain.com' with your actual domain
        SELECT * INTO api_response FROM http((
            'POST',
            COALESCE(
                current_setting('app.base_url', true),
                'http://localhost:3000'
            ) || '/api/admin/system/weekly',
            ARRAY[
                http_header('Content-Type', 'application/json'),
                http_header('Authorization', 'Bearer ' || COALESCE(current_setting('app.cron_secret', true), 'cron-secret'))
            ],
            'application/json',
            '{}'
        )::http_request);
        
        -- Parse response
        response_data := api_response.content::JSONB;
        
        -- Check if request was successful
        IF api_response.status = 200 AND (response_data->>'success')::BOOLEAN = TRUE THEN
            success := TRUE;
            PERFORM log_automation_complete(log_id, TRUE, response_data);
            RAISE NOTICE 'Weekly operations completed successfully: %', response_data->>'summary';
        ELSE
            PERFORM log_automation_complete(log_id, FALSE, response_data, 
                'HTTP ' || api_response.status || ': ' || COALESCE(response_data->>'message', 'Unknown error'));
            RAISE WARNING 'Weekly operations failed: HTTP % - %', api_response.status, response_data;
        END IF;
        
    EXCEPTION WHEN OTHERS THEN
        PERFORM log_automation_complete(log_id, FALSE, NULL, SQLERRM);
        RAISE WARNING 'Weekly operations automation failed: %', SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. CREATE XP AGGREGATION AUTOMATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION execute_xp_aggregation() RETURNS VOID AS $$
DECLARE
    log_id UUID;
    api_response http_response;
    response_data JSONB;
    success BOOLEAN := FALSE;
BEGIN
    -- Log automation start
    log_id := log_automation_start('xp-aggregation-cron', 'xp_aggregation', 'cron');
    
    BEGIN
        -- Make HTTP POST request to our Next.js API endpoint
        SELECT * INTO api_response FROM http((
            'POST',
            COALESCE(
                current_setting('app.base_url', true),
                'http://localhost:3000'
            ) || '/api/admin/system/aggregate',
            ARRAY[
                http_header('Content-Type', 'application/json'),
                http_header('Authorization', 'Bearer ' || COALESCE(current_setting('app.cron_secret', true), 'cron-secret'))
            ],
            'application/json',
            '{}'
        )::http_request);
        
        -- Parse response
        response_data := api_response.content::JSONB;
        
        -- Check if request was successful
        IF api_response.status = 200 AND (response_data->>'success')::BOOLEAN = TRUE THEN
            success := TRUE;
            PERFORM log_automation_complete(log_id, TRUE, response_data);
            
            -- Only log if submissions were actually processed
            IF (response_data->'details'->>'submissionsProcessed')::INTEGER > 0 THEN
                RAISE NOTICE 'XP aggregation completed: % submissions processed', 
                    response_data->'details'->>'submissionsProcessed';
            END IF;
        ELSE
            PERFORM log_automation_complete(log_id, FALSE, response_data, 
                'HTTP ' || api_response.status || ': ' || COALESCE(response_data->>'message', 'Unknown error'));
            RAISE WARNING 'XP aggregation failed: HTTP % - %', api_response.status, response_data;
        END IF;
        
    EXCEPTION WHEN OTHERS THEN
        PERFORM log_automation_complete(log_id, FALSE, NULL, SQLERRM);
        RAISE WARNING 'XP aggregation automation failed: %', SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. SCHEDULE THE CRON JOBS
-- ============================================================================

-- Remove existing jobs if they exist (to avoid duplicates)
DO $$
BEGIN
    PERFORM cron.unschedule('weekly-operations-automation');
    PERFORM cron.unschedule('xp-aggregation-automation');
EXCEPTION WHEN OTHERS THEN
    -- Ignore errors if jobs don't exist
    NULL;
END $$;

-- Schedule weekly operations (Monday at 12:01 AM)
-- Cron format: minute hour day_of_month month day_of_week
-- day_of_week: 1 = Monday, 0 = Sunday
SELECT cron.schedule(
    'weekly-operations-automation',
    '1 0 * * 1', -- Monday at 12:01 AM
    'SELECT execute_weekly_operations();'
);

-- Schedule XP aggregation (every 20 minutes)
-- This ensures submissions don't stay stuck for long periods
SELECT cron.schedule(
    'xp-aggregation-automation',
    '*/20 * * * *', -- Every 20 minutes
    'SELECT execute_xp_aggregation();'
);

-- ============================================================================
-- 7. CREATE CLEANUP FUNCTION FOR OLD LOGS
-- ============================================================================

-- Function to clean up old automation logs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_automation_logs() RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM "AutomationLog" 
    WHERE "createdAt" < NOW() - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RAISE NOTICE 'Cleaned up % old automation log entries', deleted_count;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Schedule log cleanup (daily at 3 AM)
SELECT cron.schedule(
    'automation-log-cleanup',
    '0 3 * * *', -- Daily at 3 AM
    'SELECT cleanup_automation_logs();'
);

-- ============================================================================
-- 8. VERIFICATION AND STATUS QUERIES
-- ============================================================================

-- Check that all cron jobs are scheduled
SELECT 
    'Scheduled automation jobs:' as status,
    string_agg(jobname, ', ') as jobs
FROM cron.job 
WHERE jobname IN ('weekly-operations-automation', 'xp-aggregation-automation', 'automation-log-cleanup');

-- Show the schedule for our new jobs
SELECT 
    jobname,
    schedule,
    command,
    active
FROM cron.job 
WHERE jobname IN ('weekly-operations-automation', 'xp-aggregation-automation', 'automation-log-cleanup')
ORDER BY jobname;

-- Create a view for easy monitoring of automation status
CREATE OR REPLACE VIEW automation_status AS
SELECT 
    "jobType",
    "jobName",
    COUNT(*) as total_runs,
    COUNT(*) FILTER (WHERE status = 'SUCCESS') as successful_runs,
    COUNT(*) FILTER (WHERE status = 'FAILED') as failed_runs,
    COUNT(*) FILTER (WHERE status = 'RUNNING') as running_jobs,
    MAX("startedAt") as last_run,
    MAX("startedAt") FILTER (WHERE status = 'SUCCESS') as last_success,
    MAX("startedAt") FILTER (WHERE status = 'FAILED') as last_failure,
    AVG(duration) FILTER (WHERE status = 'SUCCESS') as avg_duration_ms
FROM "AutomationLog"
WHERE "startedAt" > NOW() - INTERVAL '7 days'
GROUP BY "jobType", "jobName"
ORDER BY last_run DESC;

-- Grant necessary permissions
GRANT SELECT ON automation_status TO authenticated;
GRANT SELECT ON "AutomationLog" TO authenticated;

-- ============================================================================
-- 9. INITIAL STATUS MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '🤖 Critical automation cron jobs have been scheduled:';
    RAISE NOTICE '   • Weekly Operations: Monday at 12:01 AM (processes streaks, penalties, leaderboards)';
    RAISE NOTICE '   • XP Aggregation: Every 20 minutes (finalizes submissions with 3+ reviews)';
    RAISE NOTICE '   • Log Cleanup: Daily at 3 AM (removes logs older than 30 days)';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Monitoring:';
    RAISE NOTICE '   • All automation runs are logged in AutomationLog table';
    RAISE NOTICE '   • Use "SELECT * FROM automation_status" to check health';
    RAISE NOTICE '   • Admin dashboard will show automation status';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  Important: Configure app.base_url and app.cron_secret settings for production';
END $$;
