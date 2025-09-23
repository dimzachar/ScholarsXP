-- Fix ambiguous "month" reference by avoiding OUT params named "month"
-- and by qualifying column names explicitly.

CREATE OR REPLACE FUNCTION award_monthly_winner(p_month TEXT)
RETURNS TABLE (id UUID, "userId" UUID, month TEXT, "awardedAt" TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
DECLARE
  rec RECORD;
  existing_id UUID;
  existing_user UUID;
  existing_month TEXT;
  existing_awarded TIMESTAMPTZ;
BEGIN
  -- If already awarded, return existing
  SELECT mw."id", mw."userId", mw."month", mw."awardedAt"
  INTO existing_id, existing_user, existing_month, existing_awarded
  FROM "MonthlyWinner" mw
  WHERE mw."month" = p_month;

  IF FOUND THEN
    RETURN QUERY SELECT existing_id, existing_user, existing_month, existing_awarded;
    RETURN;
  END IF;

  FOR rec IN
    SELECT * FROM get_monthly_leaderboard(p_month, 200, 0)
  LOOP
    IF is_eligible_monthly_winner(rec."userId", p_month) THEN
      RETURN QUERY
      INSERT INTO "MonthlyWinner" ("userId", "month")
      VALUES (rec."userId", p_month)
      RETURNING "id", "userId", "month", "awardedAt";
      RETURN;
    END IF;
  END LOOP;

  RAISE EXCEPTION 'No eligible winner for % (cooldown rule)', p_month;
END;
$$;

