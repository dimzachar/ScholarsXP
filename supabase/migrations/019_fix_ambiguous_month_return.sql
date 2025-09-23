-- Avoid ambiguous reference by not using OUT parameter named "month"

-- Redefine award_monthly_winners to return column name "month_text" instead of "month"
CREATE OR REPLACE FUNCTION award_monthly_winners(p_month TEXT, p_top INT DEFAULT 3)
RETURNS TABLE (id UUID, "userId" UUID, month_text TEXT, "awardedAt" TIMESTAMPTZ, rank INT, "xpAwarded" INT)
LANGUAGE plpgsql AS $$
DECLARE
  need INT := LEAST(GREATEST(p_top, 1), 3); -- cap at 3
  prize INT[] := ARRAY[2000, 1500, 1000];
  award_time TIMESTAMPTZ;
  ranks_to_fill INT[];
  existing RECORD;
  rec RECORD;
  r INT;
  inserted RECORD;
BEGIN
  -- Determine award timestamp as the last second of the target month (UTC)
  SELECT ((to_timestamp(p_month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month') - INTERVAL '1 second') AT TIME ZONE 'UTC'
  INTO award_time;

  -- Initialize ranks_to_fill as [1..need]
  ranks_to_fill := ARRAY(SELECT i FROM generate_series(1, need) AS g(i));

  -- Return existing winners first
  RETURN QUERY
  SELECT mw."id", mw."userId", mw."month" AS month_text, mw."awardedAt", mw."rank", mw."xpAwarded"
  FROM "MonthlyWinner" mw
  WHERE mw."month" = p_month
  ORDER BY mw."rank" ASC;

  -- Remove already used ranks from ranks_to_fill
  SELECT ARRAY(SELECT x FROM unnest(ranks_to_fill) x WHERE x <> mw."rank")
  INTO ranks_to_fill
  FROM "MonthlyWinner" mw
  WHERE mw."month" = p_month;

  -- If no ranks remain to fill, we are done
  IF array_length(ranks_to_fill, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Iterate leaderboard and fill remaining ranks with eligible users
  FOR rec IN
    SELECT * FROM get_monthly_leaderboard(p_month, 500, 0)
  LOOP
    EXIT WHEN array_length(ranks_to_fill, 1) IS NULL;

    -- Skip if already awarded this month
    IF EXISTS (SELECT 1 FROM "MonthlyWinner" WHERE "month" = p_month AND "userId" = rec."userId") THEN
      CONTINUE;
    END IF;

    -- Enforce 3-month cooldown
    IF NOT is_eligible_monthly_winner(rec."userId", p_month) THEN
      CONTINUE;
    END IF;

    -- Pick the smallest remaining rank
    SELECT MIN(x) INTO r FROM unnest(ranks_to_fill) x;
    IF r IS NULL THEN
      EXIT;
    END IF;

    -- Insert winner at rank r
    INSERT INTO "MonthlyWinner" ("userId", "month", "rank", "xpAwarded")
    VALUES (rec."userId", p_month, r, prize[r])
    RETURNING * INTO inserted;

    -- Record XP (best-effort)
    BEGIN
      INSERT INTO "XpTransaction" ("userId", "amount", "type", "description", "weekNumber", "createdAt")
      VALUES (
        inserted."userId",
        inserted."xpAwarded",
        'MONTHLY_WINNER_BONUS',
        'Monthly leaderboard bonus for ' || p_month || ' - rank #' || inserted."rank",
        EXTRACT(WEEK FROM award_time),
        award_time
      );
      UPDATE "User" SET
        "totalXp" = "totalXp" + inserted."xpAwarded",
        "currentWeekXp" = COALESCE("currentWeekXp", 0) + inserted."xpAwarded",
        "updatedAt" = NOW()
      WHERE "id" = inserted."userId";
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to write XP transaction for monthly winner %, user %: %', p_month, inserted."userId", SQLERRM;
    END;

    -- Return the inserted row
    RETURN QUERY SELECT inserted."id", inserted."userId", inserted."month" AS month_text, inserted."awardedAt", inserted."rank", inserted."xpAwarded";

    -- Remove the rank from remaining
    ranks_to_fill := ARRAY(SELECT x FROM unnest(ranks_to_fill) x WHERE x <> inserted."rank");
  END LOOP;

  RETURN;
END;
$$;

-- Backward-compatible wrapper mapping month_text -> month for legacy callers
CREATE OR REPLACE FUNCTION award_monthly_winner(p_month TEXT)
RETURNS TABLE (id UUID, "userId" UUID, month TEXT, "awardedAt" TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT w.id, w."userId", w.month_text AS month, w."awardedAt"
  FROM award_monthly_winners(p_month, 3) AS w
  WHERE w.rank = 1
  ORDER BY w.rank
  LIMIT 1;
END;
$$;

