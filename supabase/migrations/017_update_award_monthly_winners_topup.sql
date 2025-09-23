-- Update award_monthly_winners to top-up remaining ranks if some are already awarded

CREATE OR REPLACE FUNCTION award_monthly_winners(p_month TEXT, p_top INT DEFAULT 3)
RETURNS TABLE (id UUID, "userId" UUID, month TEXT, "awardedAt" TIMESTAMPTZ, rank INT, "xpAwarded" INT)
LANGUAGE plpgsql AS $$
DECLARE
  rec RECORD;
  need INT := LEAST(GREATEST(p_top, 1), 3); -- cap at 3
  prize INT[] := ARRAY[2000, 1500, 1000];
  award_time TIMESTAMPTZ;
  existing RECORD;
  used_ranks INT[] := ARRAY[]::INT[];
  used_users UUID[] := ARRAY[]::UUID[];
  next_rank INT;
  inserted RECORD;
BEGIN
  -- Determine award timestamp as the last second of the target month (UTC)
  SELECT ((to_timestamp(p_month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month') - INTERVAL '1 second') AT TIME ZONE 'UTC'
  INTO award_time;

  -- Return existing winners but do not exit; we will top-up remaining ranks
  FOR existing IN
    SELECT mw."id", mw."userId", mw."month", mw."awardedAt", mw."rank", mw."xpAwarded"
    FROM "MonthlyWinner" mw
    WHERE mw."month" = p_month
    ORDER BY mw."rank" ASC
  LOOP
    id := existing.id; "userId" := existing."userId"; month := existing."month"; "awardedAt" := existing."awardedAt"; rank := existing."rank"; "xpAwarded" := existing."xpAwarded";
    RETURN NEXT;
    used_ranks := used_ranks || existing.rank;
    used_users := used_users || existing."userId";
  END LOOP;

  -- If already have all needed ranks, we are done
  IF array_length(used_ranks, 1) IS NOT NULL AND array_length(used_ranks, 1) >= need THEN
    RETURN;
  END IF;

  -- Iterate leaderboard and pick first eligible users not already awarded, until filling all ranks
  FOR rec IN
    SELECT * FROM get_monthly_leaderboard(p_month, 500, 0)
  LOOP
    -- Skip users already awarded this month
    IF rec."userId" = ANY(used_users) THEN
      CONTINUE;
    END IF;
    -- Enforce 3-month cooldown
    IF NOT is_eligible_monthly_winner(rec."userId", p_month) THEN
      CONTINUE;
    END IF;

    -- Find next available rank in 1..need
    next_rank := NULL;
    FOR next_rank IN 1..need LOOP
      IF NOT next_rank = ANY(used_ranks) THEN
        EXIT; -- found available rank
      END IF;
      next_rank := NULL; -- ensure reset if not available
    END LOOP;
    IF next_rank IS NULL THEN
      EXIT; -- no rank available
    END IF;

    -- Insert winner for next_rank
    INSERT INTO "MonthlyWinner" ("userId", "month", "rank", "xpAwarded")
    VALUES (rec."userId", p_month, next_rank, prize[next_rank])
    RETURNING "id", "userId", "month", "awardedAt", "rank", "xpAwarded" INTO inserted;

    -- Award XP transaction and update user's totals (best-effort)
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

    -- Return the inserted row and track usage
    id := inserted.id; "userId" := inserted."userId"; month := inserted."month"; "awardedAt" := inserted."awardedAt"; rank := inserted."rank"; "xpAwarded" := inserted."xpAwarded";
    RETURN NEXT;
    used_ranks := used_ranks || inserted."rank";
    used_users := used_users || inserted."userId";

    -- Stop if all needed ranks filled
    IF array_length(used_ranks, 1) IS NOT NULL AND array_length(used_ranks, 1) >= need THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

