-- ============================================================================
-- 20251016: Lean Reviewer Reshuffle MVP
-- Introduces release metadata, shared reshuffle RPCs, and automation cron job
-- ============================================================================

-- Ensure ReviewAssignmentStatus enum contains required states
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReviewAssignmentStatus') THEN
        CREATE TYPE "ReviewAssignmentStatus" AS ENUM (
            'PENDING',
            'IN_PROGRESS',
            'COMPLETED',
            'MISSED',
            'REASSIGNED'
        );
    END IF;

    BEGIN
        ALTER TYPE "ReviewAssignmentStatus" ADD VALUE IF NOT EXISTS 'PENDING';
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TYPE "ReviewAssignmentStatus" ADD VALUE IF NOT EXISTS 'IN_PROGRESS';
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TYPE "ReviewAssignmentStatus" ADD VALUE IF NOT EXISTS 'MISSED';
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TYPE "ReviewAssignmentStatus" ADD VALUE IF NOT EXISTS 'REASSIGNED';
    EXCEPTION WHEN duplicate_object THEN NULL; END;

    BEGIN
        ALTER TYPE "ReviewAssignmentStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
    EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- Add release metadata to ReviewAssignment
ALTER TABLE "ReviewAssignment"
    ADD COLUMN IF NOT EXISTS "releasedAt" TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS "releaseReason" TEXT;

CREATE INDEX IF NOT EXISTS review_assignment_status_released_at_idx
    ON "ReviewAssignment" ("status", "releasedAt");

-- Backfill legacy reassigned rows
UPDATE "ReviewAssignment"
SET
    "releasedAt" = COALESCE("releasedAt", COALESCE("updatedAt", "createdAt", NOW())),
    "releaseReason" = COALESCE("releaseReason", 'backfill:legacy')
WHERE "status" = 'REASSIGNED'
  AND "releasedAt" IS NULL;

-- Ensure pg_cron is available for scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- --------------------------------------------------------------------------
-- Reviewer selection helper
-- --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.select_reviewer_for_submission(UUID, UUID[]);

CREATE OR REPLACE FUNCTION public.select_reviewer_for_submission(
    p_submission_id UUID,
    p_excluded_reviewers UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS TABLE ("reviewerId" UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    WITH submission_owner AS (
        SELECT "userId" AS owner_id
        FROM "Submission"
        WHERE id = p_submission_id
    ),
    exclusions AS (
        SELECT COALESCE(p_excluded_reviewers, ARRAY[]::UUID[]) AS ids
    ),
    workload AS (
        SELECT ra."reviewerId", COUNT(*)::INT AS active_assignments
        FROM "ReviewAssignment" ra
        WHERE ra."releasedAt" IS NULL
          AND ra."status" IN ('PENDING', 'IN_PROGRESS', 'ASSIGNED')
        GROUP BY ra."reviewerId"
    ),
    workload_cap AS (
        SELECT COALESCE(NULLIF(current_setting('app.max_reviewer_active_assignments', true), '')::INT, 5) AS max_active
    )
    SELECT u.id
    FROM "User" u
    CROSS JOIN exclusions e
    CROSS JOIN workload_cap cap
    LEFT JOIN submission_owner so ON TRUE
    LEFT JOIN workload w ON w."reviewerId" = u.id
    WHERE u.role IN ('REVIEWER', 'ADMIN')
      AND (so.owner_id IS NULL OR u.id <> so.owner_id)
      AND NOT (u.id = ANY(e.ids))
      AND u."missedReviews" <= 3
      AND COALESCE((COALESCE(u.preferences::jsonb, '{}'::jsonb)->>'reviewerOptOutActive')::BOOLEAN, false) = false
      AND COALESCE(w.active_assignments, 0) < cap.max_active
    ORDER BY
      COALESCE(w.active_assignments, 0),
      u."missedReviews",
      u."totalXp" DESC,
      u."lastActiveAt" DESC NULLS LAST,
      u."createdAt" ASC;
$$;

-- --------------------------------------------------------------------------
-- Shared reshuffle RPC
-- --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.reshuffle_single_assignment(UUID, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION public.reshuffle_single_assignment(
    p_assignment_id UUID,
    p_reason TEXT,
    p_dry_run BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_assignment "ReviewAssignment";
    v_released "ReviewAssignment";
    v_new_assignment "ReviewAssignment";
    v_new_reviewer UUID;
    v_existing_reviewers UUID[];
    v_log_status TEXT := 'SUCCESS';
    v_log_result JSONB;
BEGIN
    SELECT * INTO v_assignment
    FROM "ReviewAssignment"
    WHERE id = p_assignment_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_found');
    END IF;

    IF v_assignment."releasedAt" IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'already_processed');
    END IF;

    IF v_assignment.status NOT IN ('PENDING', 'IN_PROGRESS', 'ASSIGNED') THEN
        RETURN jsonb_build_object('success', false, 'reason', 'already_processed');
    END IF;

    SELECT ARRAY_AGG(DISTINCT ra."reviewerId")
    INTO v_existing_reviewers
    FROM "ReviewAssignment" ra
    WHERE ra."submissionId" = v_assignment."submissionId";

    v_existing_reviewers := COALESCE(v_existing_reviewers, ARRAY[]::UUID[]);

    SELECT sr."reviewerId"
    INTO v_new_reviewer
    FROM public.select_reviewer_for_submission(
        v_assignment."submissionId",
        v_existing_reviewers
    ) sr
    LIMIT 1;

    IF p_dry_run THEN
        RETURN jsonb_build_object(
            'success', true,
            'dryRun', true,
            'releasedAssignment', to_jsonb(v_assignment),
            'candidateReviewerId', v_new_reviewer
        );
    END IF;

    UPDATE "ReviewAssignment"
    SET status = 'REASSIGNED',
        "releasedAt" = NOW(),
        "releaseReason" = p_reason,
        "updatedAt" = NOW()
    WHERE id = p_assignment_id
      AND "releasedAt" IS NULL
      AND status IN ('PENDING', 'IN_PROGRESS', 'ASSIGNED')
    RETURNING * INTO v_released;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'already_processed');
    END IF;

    IF v_new_reviewer IS NULL THEN
        v_log_status := 'FAILED';
        v_log_result := jsonb_build_object(
            'assignmentId', p_assignment_id,
            'reason', 'no_replacement_available'
        );

        BEGIN
            INSERT INTO "AutomationLog" (
                "jobName",
                "jobType",
                "triggeredBy",
                "status",
                "result",
                "startedAt",
                "completedAt",
                "duration"
            ) VALUES (
                'reviewer-reshuffle-single',
                'reshuffle',
                LEFT(COALESCE(p_reason, 'manual:admin'), 120),
                v_log_status,
                v_log_result,
                NOW(),
                NOW(),
                0
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Failed to log reviewer reshuffle (no replacement): %', SQLERRM;
        END;

        RETURN jsonb_build_object(
            'success', false,
            'reason', 'no_replacement_available',
            'releasedAssignment', to_jsonb(v_released)
        );
    END IF;

    INSERT INTO "ReviewAssignment" (
        id,
        "submissionId",
        "reviewerId",
        "assignedAt",
        deadline,
        status,
        "createdAt",
        "updatedAt"
    )
    VALUES (
        gen_random_uuid(),
        v_assignment."submissionId",
        v_new_reviewer,
        NOW(),
        v_assignment.deadline,
        'PENDING',
        NOW(),
        NOW()
    )
    RETURNING * INTO v_new_assignment;

    v_log_result := jsonb_build_object(
        'assignmentId', p_assignment_id,
        'newReviewerId', v_new_reviewer
    );

    BEGIN
        INSERT INTO "AutomationLog" (
            "jobName",
            "jobType",
            "triggeredBy",
            "status",
            "result",
            "startedAt",
            "completedAt",
            "duration"
        ) VALUES (
            'reviewer-reshuffle-single',
            'reshuffle',
            LEFT(COALESCE(p_reason, 'manual:admin'), 120),
            v_log_status,
            v_log_result,
            NOW(),
            NOW(),
            0
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Failed to log reviewer reshuffle: %', SQLERRM;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'releasedAssignment', to_jsonb(v_released),
        'newAssignment', to_jsonb(v_new_assignment)
    );
END;
$$;

-- --------------------------------------------------------------------------
-- Hourly automation function
-- --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.auto_reshuffle_stale_reviewers(INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.auto_reshuffle_stale_reviewers(
    p_pending_cutoff_hours INTEGER DEFAULT 50,
    p_in_progress_cutoff_hours INTEGER DEFAULT 72,
    p_limit INTEGER DEFAULT 25
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row "ReviewAssignment";
    v_payload JSONB;
    v_results JSONB;
    v_errors JSONB := jsonb_build_array();
    v_processed INTEGER := 0;
    v_reassigned INTEGER := 0;
    v_no_replacement INTEGER := 0;
BEGIN
    FOR v_row IN
        SELECT ra.*
        FROM "ReviewAssignment" ra
        WHERE ra."completedAt" IS NULL
          AND ra."releasedAt" IS NULL
          AND (
            (ra.status IN ('PENDING', 'ASSIGNED')
             AND ra."assignedAt" < NOW() - (p_pending_cutoff_hours || ' hours')::INTERVAL)
            OR
            (ra.status = 'IN_PROGRESS'
             AND ra."assignedAt" < NOW() - (p_in_progress_cutoff_hours || ' hours')::INTERVAL)
          )
        ORDER BY ra."assignedAt"
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    LOOP
        v_processed := v_processed + 1;

        BEGIN
            v_payload := public.reshuffle_single_assignment(v_row.id, 'auto:stale', FALSE);
        EXCEPTION WHEN OTHERS THEN
            v_payload := jsonb_build_object(
                'success', false,
                'reason', 'error',
                'message', SQLERRM,
                'assignmentId', v_row.id
            );
        END;

        IF COALESCE((v_payload->>'success')::BOOLEAN, false) THEN
            v_reassigned := v_reassigned + 1;
        ELSIF v_payload->>'reason' = 'no_replacement_available' THEN
            v_no_replacement := v_no_replacement + 1;
        ELSE
            v_errors := v_errors || jsonb_build_array(v_payload);
        END IF;
    END LOOP;

    v_results := jsonb_build_object(
        'processed', v_processed,
        'reassigned', v_reassigned,
        'noReplacement', v_no_replacement,
        'errors', v_errors
    );

    BEGIN
        INSERT INTO "AutomationLog" (
            "jobName",
            "jobType",
            "triggeredBy",
            "status",
            "result",
            "startedAt",
            "completedAt",
            "duration"
        ) VALUES (
            'reviewer-reshuffle-cron',
            'reshuffle',
            'system',
            CASE WHEN jsonb_array_length(v_errors) > 0 THEN 'FAILED' ELSE 'SUCCESS' END,
            v_results,
            NOW(),
            NOW(),
            0
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Failed to log reviewer reshuffle cron run: %', SQLERRM;
    END;

    RETURN v_results;
END;
$$;

-- --------------------------------------------------------------------------
-- Cron registration (idempotent)
-- --------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_namespace
        WHERE nspname = 'cron'
    ) THEN
        PERFORM cron.unschedule(jobid)
        FROM cron.job
        WHERE jobname = 'reviewer-reshuffle-lean';

        PERFORM cron.schedule(
            'reviewer-reshuffle-lean',
            '0 * * * *',
            $$SELECT public.auto_reshuffle_stale_reviewers();$$
        );
    END IF;
END;
$$;

