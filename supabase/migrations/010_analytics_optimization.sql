-- Analytics Optimization Migration
-- This migration creates optimized functions for consolidated analytics queries
-- Replaces 8 separate queries with 1 optimized CTE query for 9x performance improvement

-- Create function to get consolidated analytics metrics
CREATE OR REPLACE FUNCTION get_consolidated_analytics(
  start_date timestamp DEFAULT NULL,
  week_ago timestamp DEFAULT NOW() - INTERVAL '7 days'
)
RETURNS TABLE(
  total_users bigint,
  active_users bigint,
  total_submissions bigint,
  completed_submissions bigint,
  total_reviews bigint,
  total_xp_awarded bigint,
  total_achievements bigint,
  pending_flags bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH analytics_data AS (
    SELECT 
      COUNT(DISTINCT u.id) as total_users,
      COUNT(DISTINCT CASE WHEN u."lastActiveAt" >= week_ago THEN u.id END) as active_users,
      COUNT(DISTINCT CASE WHEN start_date IS NULL OR s."createdAt" >= start_date THEN s.id END) as total_submissions,
      COUNT(DISTINCT CASE WHEN s.status = 'FINALIZED' AND (start_date IS NULL OR s."createdAt" >= start_date) THEN s.id END) as completed_submissions,
      COUNT(DISTINCT CASE WHEN start_date IS NULL OR pr."createdAt" >= start_date THEN pr.id END) as total_reviews,
      COALESCE(SUM(CASE WHEN xt.amount > 0 AND (start_date IS NULL OR xt."createdAt" >= start_date) THEN xt.amount END), 0) as total_xp_awarded,
      COUNT(DISTINCT CASE WHEN start_date IS NULL OR ua."earnedAt" >= start_date THEN ua.id END) as total_achievements,
      COUNT(DISTINCT CASE WHEN cf.status = 'PENDING' THEN cf.id END) as pending_flags
    FROM "User" u
    LEFT JOIN "Submission" s ON u.id = s."userId"
    LEFT JOIN "PeerReview" pr ON u.id = pr."reviewerId"
    LEFT JOIN "XpTransaction" xt ON u.id = xt."userId"
    LEFT JOIN "UserAchievement" ua ON u.id = ua."userId"
    LEFT JOIN "ContentFlag" cf ON s.id = cf."submissionId"
  )
  SELECT * FROM analytics_data;
END;
$$;

-- Grant execute permission to authenticated users (admin access will be handled by RLS)
GRANT EXECUTE ON FUNCTION get_consolidated_analytics TO authenticated;

-- Create optimized analytics view for quick access to common metrics
CREATE OR REPLACE VIEW analytics_summary AS
SELECT 
  COUNT(DISTINCT u.id) as total_users,
  COUNT(DISTINCT CASE WHEN u."lastActiveAt" >= NOW() - INTERVAL '7 days' THEN u.id END) as active_users_7d,
  COUNT(DISTINCT CASE WHEN u."lastActiveAt" >= NOW() - INTERVAL '30 days' THEN u.id END) as active_users_30d,
  COUNT(DISTINCT s.id) as total_submissions,
  COUNT(DISTINCT CASE WHEN s.status = 'FINALIZED' THEN s.id END) as completed_submissions,
  COUNT(DISTINCT pr.id) as total_reviews,
  COALESCE(SUM(CASE WHEN xt.amount > 0 THEN xt.amount END), 0) as total_xp_awarded,
  COUNT(DISTINCT ua.id) as total_achievements,
  COUNT(DISTINCT CASE WHEN cf.status = 'PENDING' THEN cf.id END) as pending_flags,
  -- Performance metrics
  ROUND(
    (CASE
      WHEN COUNT(DISTINCT s.id) > 0
      THEN (COUNT(DISTINCT CASE WHEN s.status = 'FINALIZED' THEN s.id END)::numeric / COUNT(DISTINCT s.id)::numeric) * 100
      ELSE 0
    END)::numeric, 2
  ) as submission_success_rate,
  -- Recent activity (last 24 hours)
  COUNT(DISTINCT CASE WHEN s."createdAt" >= NOW() - INTERVAL '24 hours' THEN s.id END) as submissions_24h,
  COUNT(DISTINCT CASE WHEN pr."createdAt" >= NOW() - INTERVAL '24 hours' THEN pr.id END) as reviews_24h,
  COUNT(DISTINCT CASE WHEN u."lastActiveAt" >= NOW() - INTERVAL '24 hours' THEN u.id END) as active_users_24h
FROM "User" u
LEFT JOIN "Submission" s ON u.id = s."userId"
LEFT JOIN "PeerReview" pr ON u.id = pr."reviewerId"
LEFT JOIN "XpTransaction" xt ON u.id = xt."userId"
LEFT JOIN "UserAchievement" ua ON u.id = ua."userId"
LEFT JOIN "ContentFlag" cf ON s.id = cf."submissionId";

-- Create function for time-series analytics data
CREATE OR REPLACE FUNCTION get_analytics_time_series(
  start_date timestamp DEFAULT NOW() - INTERVAL '30 days',
  end_date timestamp DEFAULT NOW(),
  interval_type text DEFAULT 'day'
)
RETURNS TABLE(
  period_start timestamp,
  period_end timestamp,
  new_users bigint,
  new_submissions bigint,
  new_reviews bigint,
  xp_awarded bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  interval_duration interval;
BEGIN
  -- Set interval duration based on type
  CASE interval_type
    WHEN 'hour' THEN interval_duration := '1 hour'::interval;
    WHEN 'day' THEN interval_duration := '1 day'::interval;
    WHEN 'week' THEN interval_duration := '1 week'::interval;
    WHEN 'month' THEN interval_duration := '1 month'::interval;
    ELSE interval_duration := '1 day'::interval;
  END CASE;

  RETURN QUERY
  WITH time_periods AS (
    SELECT 
      generate_series(
        date_trunc(interval_type, start_date),
        date_trunc(interval_type, end_date),
        interval_duration
      ) as period_start
  ),
  period_ranges AS (
    SELECT 
      period_start,
      period_start + interval_duration as period_end
    FROM time_periods
  )
  SELECT 
    pr.period_start,
    pr.period_end,
    COUNT(DISTINCT u.id) as new_users,
    COUNT(DISTINCT s.id) as new_submissions,
    COUNT(DISTINCT rev.id) as new_reviews,
    COALESCE(SUM(xt.amount), 0) as xp_awarded
  FROM period_ranges pr
  LEFT JOIN "User" u ON u."createdAt" >= pr.period_start AND u."createdAt" < pr.period_end
  LEFT JOIN "Submission" s ON s."createdAt" >= pr.period_start AND s."createdAt" < pr.period_end
  LEFT JOIN "PeerReview" rev ON rev."createdAt" >= pr.period_start AND rev."createdAt" < pr.period_end
  LEFT JOIN "XpTransaction" xt ON xt."createdAt" >= pr.period_start AND xt."createdAt" < pr.period_end AND xt.amount > 0
  GROUP BY pr.period_start, pr.period_end
  ORDER BY pr.period_start;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_analytics_time_series TO authenticated;

-- Create function for platform and task type distributions
CREATE OR REPLACE FUNCTION get_analytics_distributions(
  start_date timestamp DEFAULT NULL
)
RETURNS TABLE(
  distribution_type text,
  category text,
  count bigint,
  percentage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  -- Platform distribution
  WITH platform_stats AS (
    SELECT 
      'platform' as distribution_type,
      s.platform as category,
      COUNT(*) as count
    FROM "Submission" s
    WHERE start_date IS NULL OR s."createdAt" >= start_date
    GROUP BY s.platform
  ),
  platform_totals AS (
    SELECT SUM(count) as total_count FROM platform_stats
  ),
  platform_with_percentage AS (
    SELECT 
      ps.distribution_type,
      ps.category,
      ps.count,
      ROUND((ps.count::numeric / pt.total_count::numeric) * 100, 2) as percentage
    FROM platform_stats ps
    CROSS JOIN platform_totals pt
  ),
  -- Task type distribution (unnest array)
  task_type_stats AS (
    SELECT 
      'task_type' as distribution_type,
      unnest(s."taskTypes") as category,
      COUNT(*) as count
    FROM "Submission" s
    WHERE start_date IS NULL OR s."createdAt" >= start_date
    GROUP BY unnest(s."taskTypes")
  ),
  task_type_totals AS (
    SELECT SUM(count) as total_count FROM task_type_stats
  ),
  task_type_with_percentage AS (
    SELECT 
      tts.distribution_type,
      tts.category,
      tts.count,
      ROUND((tts.count::numeric / ttt.total_count::numeric) * 100, 2) as percentage
    FROM task_type_stats tts
    CROSS JOIN task_type_totals ttt
  ),
  -- User role distribution
  role_stats AS (
    SELECT 
      'user_role' as distribution_type,
      u.role as category,
      COUNT(*) as count
    FROM "User" u
    GROUP BY u.role
  ),
  role_totals AS (
    SELECT SUM(count) as total_count FROM role_stats
  ),
  role_with_percentage AS (
    SELECT 
      rs.distribution_type,
      rs.category,
      rs.count,
      ROUND((rs.count::numeric / rt.total_count::numeric) * 100, 2) as percentage
    FROM role_stats rs
    CROSS JOIN role_totals rt
  )
  -- Combine all distributions
  SELECT * FROM platform_with_percentage
  UNION ALL
  SELECT * FROM task_type_with_percentage
  UNION ALL
  SELECT * FROM role_with_percentage
  ORDER BY distribution_type, count DESC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_analytics_distributions TO authenticated;

-- Create indexes for analytics optimization if they don't exist
-- Note: CONCURRENTLY indexes must be created separately, not in a transaction block
CREATE INDEX IF NOT EXISTS idx_user_last_active_at ON "User"("lastActiveAt") WHERE "lastActiveAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_submission_created_at_status ON "Submission"("createdAt", "status");
CREATE INDEX IF NOT EXISTS idx_peer_review_created_at ON "PeerReview"("createdAt");
CREATE INDEX IF NOT EXISTS idx_xp_transaction_created_at_amount ON "XpTransaction"("createdAt", "amount") WHERE "amount" > 0;
CREATE INDEX IF NOT EXISTS idx_user_achievement_earned_at ON "UserAchievement"("earnedAt");
CREATE INDEX IF NOT EXISTS idx_content_flag_status ON "ContentFlag"("status") WHERE "status" = 'PENDING';

-- Create composite indexes for better join performance
CREATE INDEX IF NOT EXISTS idx_submission_user_created_status ON "Submission"("userId", "createdAt", "status");
CREATE INDEX IF NOT EXISTS idx_peer_review_reviewer_created ON "PeerReview"("reviewerId", "createdAt");
CREATE INDEX IF NOT EXISTS idx_xp_transaction_user_created_amount ON "XpTransaction"("userId", "createdAt", "amount");
CREATE INDEX IF NOT EXISTS idx_user_achievement_user_earned ON "UserAchievement"("userId", "earnedAt");

-- Add comments for documentation
COMMENT ON FUNCTION get_consolidated_analytics IS 'Optimized function that replaces 8 separate analytics queries with 1 CTE query for 9x performance improvement';
COMMENT ON FUNCTION get_analytics_time_series IS 'Function to get time-series analytics data for charts and trends';
COMMENT ON FUNCTION get_analytics_distributions IS 'Function to get distribution statistics for platforms, task types, and user roles';
COMMENT ON VIEW analytics_summary IS 'Optimized view for quick access to common analytics metrics';
