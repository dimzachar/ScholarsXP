-- Monthly leaderboards and winners
-- Aggregates XP transactions by month and awards monthly winners with a 3-month cooldown.

-- 1) Monthly winners table
CREATE TABLE IF NOT EXISTS "MonthlyWinner" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "month" TEXT NOT NULL, -- format 'YYYY-MM'
  "awardedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT monthly_winner_month_unique UNIQUE ("month")
);

CREATE INDEX IF NOT EXISTS idx_monthly_winner_user_month ON "MonthlyWinner" ("userId", "month");

-- 2) Helper to parse month boundaries
CREATE OR REPLACE FUNCTION month_bounds(p_month TEXT)
RETURNS TABLE (start_ts TIMESTAMPTZ, end_ts TIMESTAMPTZ)
LANGUAGE sql AS $$
  SELECT
    to_timestamp(p_month || '-01', 'YYYY-MM-DD') AT TIME ZONE 'UTC' AS start_ts,
    (to_timestamp(p_month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month') AT TIME ZONE 'UTC' AS end_ts;
$$;

-- 3) List months that have any XP activity
CREATE OR REPLACE FUNCTION list_months_with_xp(p_limit INT DEFAULT 12)
RETURNS TABLE (month TEXT, events BIGINT)
LANGUAGE sql STABLE AS $$
  SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS month,
         COUNT(*) AS events
  FROM "XpTransaction"
  GROUP BY 1
  ORDER BY 1 DESC
  LIMIT p_limit;
$$;

-- 4) Monthly leaderboard aggregator
CREATE OR REPLACE FUNCTION get_monthly_leaderboard(p_month TEXT, p_limit INT DEFAULT 20, p_offset INT DEFAULT 0)
RETURNS TABLE ("userId" UUID, total BIGINT)
LANGUAGE sql STABLE AS $$
  WITH bounds AS (
    SELECT start_ts, end_ts FROM month_bounds(p_month)
  )
  SELECT t."userId", SUM(t."amount")::BIGINT AS total
  FROM "XpTransaction" t, bounds b
  WHERE t."createdAt" >= b.start_ts
    AND t."createdAt" <  b.end_ts
  GROUP BY t."userId"
  ORDER BY total DESC, MIN(t."createdAt") ASC, t."userId" ASC
  OFFSET p_offset
  LIMIT p_limit;
$$;

-- 5) Check 3-month cooldown eligibility
CREATE OR REPLACE FUNCTION is_eligible_monthly_winner(p_user_id UUID, p_month TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE AS $$
DECLARE
  m1 TEXT;
  m2 TEXT;
  m3 TEXT;
  cnt INT;
BEGIN
  -- Compute previous three months in YYYY-MM
  SELECT to_char((to_date(p_month || '-01','YYYY-MM-DD') - INTERVAL '1 month'),'YYYY-MM') INTO m1;
  SELECT to_char((to_date(p_month || '-01','YYYY-MM-DD') - INTERVAL '2 months'),'YYYY-MM') INTO m2;
  SELECT to_char((to_date(p_month || '-01','YYYY-MM-DD') - INTERVAL '3 months'),'YYYY-MM') INTO m3;

  SELECT COUNT(*) INTO cnt
  FROM "MonthlyWinner"
  WHERE "userId" = p_user_id AND "month" IN (m1, m2, m3);

  RETURN cnt = 0;
END;
$$;

-- 6) Award monthly winner: pick top eligible user for the given month
CREATE OR REPLACE FUNCTION award_monthly_winner(p_month TEXT)
RETURNS TABLE (id UUID, "userId" UUID, month TEXT, "awardedAt" TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE
  rec RECORD;
  existing RECORD;
BEGIN
  -- If already awarded, return existing
  SELECT * INTO existing FROM "MonthlyWinner" WHERE "month" = p_month;
  IF FOUND THEN
    id := existing.id; "userId" := existing."userId"; month := existing."month"; "awardedAt" := existing."awardedAt";
    RETURN NEXT; RETURN;
  END IF;

  FOR rec IN
    SELECT * FROM get_monthly_leaderboard(p_month, 200, 0)
  LOOP
    IF is_eligible_monthly_winner(rec."userId", p_month) THEN
      INSERT INTO "MonthlyWinner" ("userId", "month")
      VALUES (rec."userId", p_month)
      RETURNING "id", "userId", "month", "awardedAt" INTO id, "userId", month, "awardedAt";
      RETURN NEXT; RETURN;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'No eligible winner for % (cooldown rule)', p_month;
END;
$$;

