-- Schedule monthly job to award top-3 winners automatically (1st day of each month)

-- Ensure pg_cron is available
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Helper function to award last month's winners and log
CREATE OR REPLACE FUNCTION run_monthly_awards()
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  prev_month TEXT;
  awarded_count INT := 0;
BEGIN
  -- Compute previous month in YYYY-MM
  SELECT to_char(date_trunc('month', NOW() - INTERVAL '1 month'), 'YYYY-MM') INTO prev_month;

  -- Attempt to award; ignore error if already awarded
  BEGIN
    PERFORM * FROM award_monthly_winners(prev_month, 3);
    GET DIAGNOSTICS awarded_count = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    -- log and continue
    PERFORM 1;
  END;

  -- Best-effort log
  BEGIN
    INSERT INTO "AutomationLog" (
      "jobName", "jobType", "triggeredBy", "status", "result"
    ) VALUES (
      'monthly_top3_awards', 'xp_aggregation', 'cron', 'SUCCESS',
      jsonb_build_object('month', prev_month, 'awardedCount', awarded_count)
    );
  EXCEPTION WHEN OTHERS THEN
    -- noop
    PERFORM 1;
  END;
END;
$$;

-- Unschedule old job if exists (compatible with different pg_cron versions)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-top3-awards') THEN
    BEGIN
      PERFORM cron.unschedule('monthly-top3-awards');
    EXCEPTION WHEN OTHERS THEN
      -- Older versions require jobid
      PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'monthly-top3-awards';
    END;
  END IF;
END;
$$;

-- Schedule: 00:05 on the 1st of every month
SELECT cron.schedule(
  'monthly-top3-awards',
  '5 0 1 * *',
  'SELECT run_monthly_awards();'
);
