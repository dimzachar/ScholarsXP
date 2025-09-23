-- Top-3 monthly winners with automatic XP awards
-- - Allows up to 3 winners per month
-- - Awards XP: 1st=2000, 2nd=1500, 3rd=1000
-- - Maintains 3-month cooldown per user (reuses is_eligible_monthly_winner)

-- 1) Schema changes: support multiple winners per month
DO $$
BEGIN
  -- Add rank column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'MonthlyWinner' AND column_name = 'rank'
  ) THEN
    ALTER TABLE "MonthlyWinner" ADD COLUMN "rank" INT NOT NULL DEFAULT 1;
  END IF;

  -- Add xpAwarded column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'MonthlyWinner' AND column_name = 'xpAwarded'
  ) THEN
    ALTER TABLE "MonthlyWinner" ADD COLUMN "xpAwarded" INT NOT NULL DEFAULT 0;
  END IF;

  -- Drop old unique(month) constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'MonthlyWinner' AND constraint_name = 'monthly_winner_month_unique'
  ) THEN
    ALTER TABLE "MonthlyWinner" DROP CONSTRAINT "monthly_winner_month_unique";
  END IF;

  -- Create unique(month, rank) to allow up to 3 winners and prevent duplicates
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'MonthlyWinner_month_rank_unique'
  ) THEN
    CREATE UNIQUE INDEX "MonthlyWinner_month_rank_unique" ON "MonthlyWinner"("month", "rank");
  END IF;
END $$;

-- 2) Award top-N monthly winners with XP bonuses and cooldown
CREATE OR REPLACE FUNCTION award_monthly_winners(p_month TEXT, p_top INT DEFAULT 3)
RETURNS TABLE (id UUID, "userId" UUID, month TEXT, "awardedAt" TIMESTAMPTZ, rank INT, "xpAwarded" INT)
LANGUAGE plpgsql AS $$
DECLARE
  rec RECORD;
  need INT := LEAST(GREATEST(p_top, 1), 3); -- cap at 3
  awarded_count INT := 0;
  prize INT[] := ARRAY[2000, 1500, 1000];
  out_id UUID;
  out_user UUID;
  out_month TEXT;
  out_awarded TIMESTAMPTZ;
  out_rank INT;
  out_xp INT;
  award_time TIMESTAMPTZ;
BEGIN
  -- Return existing winners if already awarded for this month
  RETURN QUERY
    SELECT mw."id", mw."userId", mw."month", mw."awardedAt", mw."rank", mw."xpAwarded"
    FROM "MonthlyWinner" mw
    WHERE mw."month" = p_month
    ORDER BY mw."rank" ASC;

  GET DIAGNOSTICS awarded_count = ROW_COUNT;
  IF awarded_count > 0 THEN
    RETURN; -- already awarded; returned above
  END IF;

  -- Determine award timestamp as the last second of the target month (UTC)
  SELECT ((to_timestamp(p_month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month') - INTERVAL '1 second') AT TIME ZONE 'UTC'
  INTO award_time;

  -- Iterate leaderboard and pick first eligible users up to `need`
  FOR rec IN
    SELECT * FROM get_monthly_leaderboard(p_month, 500, 0)
  LOOP
    EXIT WHEN awarded_count >= need;

    -- Enforce 3-month cooldown
    IF NOT is_eligible_monthly_winner(rec."userId", p_month) THEN
      CONTINUE;
    END IF;

    awarded_count := awarded_count + 1;
    out_rank := awarded_count;
    out_xp := prize[awarded_count];

    -- Insert winner with rank and xpAwarded
    INSERT INTO "MonthlyWinner" ("userId", "month", "rank", "xpAwarded")
    VALUES (rec."userId", p_month, out_rank, out_xp)
    RETURNING "id", "userId", "month", "awardedAt", "rank", "xpAwarded"
    INTO out_id, out_user, out_month, out_awarded, out_rank, out_xp;

    -- Award XP transaction and update user's totals
    BEGIN
      INSERT INTO "XpTransaction" (
        "userId", "amount", "type", "description", "weekNumber", "createdAt"
      ) VALUES (
        out_user,
        out_xp,
        'MONTHLY_WINNER_BONUS',
        'Monthly leaderboard bonus for ' || p_month || ' - rank #' || out_rank,
        EXTRACT(WEEK FROM award_time),
        award_time
      );

      UPDATE "User" SET
        "totalXp" = "totalXp" + out_xp,
        "currentWeekXp" = COALESCE("currentWeekXp", 0) + out_xp,
        "updatedAt" = NOW()
      WHERE "id" = out_user;
    EXCEPTION WHEN OTHERS THEN
      -- Log but do not abort winner insertion
      RAISE WARNING 'Failed to write XP transaction for monthly winner %, user %: %', p_month, out_user, SQLERRM;
    END;

    -- Return the inserted row
    id := out_id; "userId" := out_user; month := out_month; "awardedAt" := out_awarded; rank := out_rank; "xpAwarded" := out_xp;
    RETURN NEXT;
  END LOOP;

  IF awarded_count = 0 THEN
    RAISE EXCEPTION 'No eligible winners for % (cooldown rule)', p_month;
  END IF;

  RETURN;
END;
$$;

-- 3) Backward-compatible wrapper for single-winner API
-- Returns only the rank-1 winner, awarding all top 3 if missing
CREATE OR REPLACE FUNCTION award_monthly_winner(p_month TEXT)
RETURNS TABLE (id UUID, "userId" UUID, month TEXT, "awardedAt" TIMESTAMPTZ)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT w.id, w."userId", w.month, w."awardedAt"
  FROM award_monthly_winners(p_month, 3) AS w
  WHERE w.rank = 1
  ORDER BY w.rank
  LIMIT 1;
END;
$$;
