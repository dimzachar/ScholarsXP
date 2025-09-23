-- Exclude ADMIN_ADJUSTMENT from monthly leaderboards and month listings

-- Update list_months_with_xp to ignore ADMIN_ADJUSTMENT
CREATE OR REPLACE FUNCTION list_months_with_xp(p_limit INT DEFAULT 12)
RETURNS TABLE (month TEXT, events BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
         COUNT(*) AS events
  FROM "XpTransaction"
  WHERE "type" <> 'ADMIN_ADJUSTMENT'
  GROUP BY 1
  ORDER BY 1 DESC
  LIMIT p_limit;
$$;

-- Update get_monthly_leaderboard to ignore ADMIN_ADJUSTMENT
CREATE OR REPLACE FUNCTION get_monthly_leaderboard(p_month TEXT, p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)
RETURNS TABLE ("userId" UUID, total BIGINT)
LANGUAGE sql STABLE AS $$
  WITH bounds AS (
    SELECT
      to_timestamp(p_month || '-01', 'YYYY-MM-DD') AT TIME ZONE 'UTC' AS start_ts,
      (to_timestamp(p_month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month') AT TIME ZONE 'UTC' AS end_ts
  )
  SELECT t."userId", SUM(t."amount")::BIGINT AS total
  FROM "XpTransaction" t, bounds b
  WHERE t."createdAt" >= b.start_ts
    AND t."createdAt" <  b.end_ts
    AND t."type" <> 'ADMIN_ADJUSTMENT'
  GROUP BY t."userId"
  ORDER BY total DESC, MIN(t."createdAt") ASC, t."userId" ASC
  OFFSET p_offset
  LIMIT p_limit;
$$;

