-- Ensure XP award visibility: allow MONTHLY_WINNER_BONUS/ROLE_PROMOTION types
-- and make award function resilient so User totals update even if logging fails.

-- 1) Extend enum XpTransactionType if it exists (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'XpTransactionType') THEN
    -- Add missing values safely
    BEGIN
      ALTER TYPE "XpTransactionType" ADD VALUE IF NOT EXISTS 'ROLE_PROMOTION';
    EXCEPTION WHEN OTHERS THEN
      -- ignore if already exists or not an enum
      NULL;
    END;
    BEGIN
      ALTER TYPE "XpTransactionType" ADD VALUE IF NOT EXISTS 'MONTHLY_WINNER_BONUS';
    EXCEPTION WHEN OTHERS THEN
      -- ignore if already exists or not an enum
      NULL;
    END;
  END IF;
END $$;

-- 2) If XpTransaction.type is backed by enum and still errors, fallback to TEXT
--    Only perform if the column's udt_name is XpTransactionType
DO $$
DECLARE
  is_enum boolean := FALSE;
BEGIN
  SELECT (data_type = 'USER-DEFINED' AND udt_name = 'XpTransactionType')
  INTO is_enum
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'XpTransaction' AND column_name = 'type';

  IF is_enum THEN
    -- Convert to TEXT to avoid future type drift causing awards to fail
    -- (no-op if already TEXT)
    BEGIN
      ALTER TABLE "XpTransaction"
      ALTER COLUMN "type" TYPE TEXT USING "type"::TEXT;
    EXCEPTION WHEN OTHERS THEN
      -- If conversion fails, leave as-is (the enum additions above should suffice)
      NULL;
    END;
  END IF;
END $$;

-- 3) Make award function robust: update User totals even if transaction insert fails
CREATE OR REPLACE FUNCTION award_monthly_winners(p_month TEXT, p_top INT DEFAULT 3)
RETURNS TABLE (id UUID, "userId" UUID, month_text TEXT, "awardedAt" TIMESTAMPTZ, rank INT, "xpAwarded" INT)
LANGUAGE plpgsql AS $$
DECLARE
  need INT := LEAST(GREATEST(p_top, 1), 3); -- cap at 3
  prize INT[] := ARRAY[2000, 1500, 1000];
  award_time TIMESTAMPTZ;
  ranks_to_fill INT[];
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
  SELECT ARRAY(
           SELECT x FROM unnest(ranks_to_fill) x
           WHERE x NOT IN (
             SELECT mw2."rank" FROM "MonthlyWinner" mw2 WHERE mw2."month" = p_month
           )
         ) INTO ranks_to_fill;

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
    IF EXISTS (SELECT 1 FROM "MonthlyWinner" mw WHERE mw."month" = p_month AND mw."userId" = rec."userId") THEN
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

    -- Record XP transaction (best-effort)
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
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to write XP transaction for monthly winner %, user %: %', p_month, inserted."userId", SQLERRM;
    END;

    -- Update user totals (independent best-effort)
    BEGIN
      UPDATE "User" SET
        "totalXp" = "totalXp" + inserted."xpAwarded",
        "currentWeekXp" = COALESCE("currentWeekXp", 0) + inserted."xpAwarded",
        "updatedAt" = NOW()
      WHERE "id" = inserted."userId";
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to update User totals for monthly winner %, user %: %', p_month, inserted."userId", SQLERRM;
    END;

    -- Return the inserted row
    RETURN QUERY SELECT inserted."id", inserted."userId", inserted."month" AS month_text, inserted."awardedAt", inserted."rank", inserted."xpAwarded";

    -- Remove the rank from remaining
    ranks_to_fill := ARRAY(SELECT x FROM unnest(ranks_to_fill) x WHERE x <> inserted."rank");
  END LOOP;

  RETURN;
END;
$$;

