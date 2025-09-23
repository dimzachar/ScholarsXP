-- Deterministic rank assignment and top-up behavior for award_monthly_winners

CREATE OR REPLACE FUNCTION award_monthly_winners(p_month TEXT, p_top INT DEFAULT 3)
RETURNS TABLE (id UUID, "userId" UUID, month TEXT, "awardedAt" TIMESTAMPTZ, rank INT, "xpAwarded" INT)
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

  -- Return existing winners first, and remove their ranks from ranks_to_fill
  FOR existing IN
    SELECT mw."id", mw."userId", mw."month", mw."awardedAt", mw."rank", mw."xpAwarded"
    FROM "MonthlyWinner" mw
    WHERE mw."month" = p_month
    ORDER BY mw."rank" ASC
  LOOP
    id := existing.id; "userId" := existing."userId"; month := existing."month"; "awardedAt" := existing."awardedAt"; rank := existing."rank"; "xpAwarded" := existing."xpAwarded";
    RETURN NEXT;
    ranks_to_fill := ARRAY(SELECT x FROM unnest(ranks_to_fill) x WHERE x <> existing."rank");
  END LOOP;

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
    RETURNING "id", "userId", "month", "awardedAt", "rank", "xpAwarded" INTO inserted;

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

    -- Return the inserted row and remove the rank from remaining
    id := inserted.id; "userId" := inserted."userId"; month := inserted."month"; "awardedAt" := inserted."awardedAt"; rank := inserted."rank"; "xpAwarded" := inserted."xpAwarded";
    RETURN NEXT;
    ranks_to_fill := ARRAY(SELECT x FROM unnest(ranks_to_fill) x WHERE x <> inserted."rank");
  END LOOP;

  RETURN;
END;
$$;

