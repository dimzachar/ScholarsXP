-- Add missing enum value if enum is used and provide a safe top-up function

-- 1) Ensure enum has reversal value if enum exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'XpTransactionType') THEN
    BEGIN
      ALTER TYPE "XpTransactionType" ADD VALUE IF NOT EXISTS 'MONTHLY_WINNER_BONUS_REVERSAL';
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END $$;

-- 2) Top-up function: ensure all winners for a month have matching XP transactions and totals
CREATE OR REPLACE FUNCTION top_up_monthly_winner_xp(p_month TEXT)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  w RECORD;
  v_start_ts TIMESTAMPTZ;
  v_end_ts   TIMESTAMPTZ;
  award_ts   TIMESTAMPTZ;
  inserted   INTEGER := 0;
  has_tx     BOOLEAN;
BEGIN
  SELECT mb.start_ts, mb.end_ts INTO v_start_ts, v_end_ts FROM month_bounds(p_month) AS mb;
  award_ts := (v_end_ts - INTERVAL '1 second');

  FOR w IN SELECT * FROM "MonthlyWinner" WHERE "month" = p_month LOOP
    SELECT EXISTS (
      SELECT 1 FROM "XpTransaction" t
      WHERE t."userId" = w."userId"
        AND t."amount" = w."xpAwarded"
        AND t."createdAt" >= v_start_ts AND t."createdAt" < v_end_ts
        AND (
          t."type" = 'MONTHLY_WINNER_BONUS' OR
          t."description" ILIKE '%' || p_month || '%'
        )
    ) INTO has_tx;

    IF NOT has_tx THEN
      BEGIN
        INSERT INTO "XpTransaction" ("userId", "amount", "type", "description", "weekNumber", "createdAt")
        VALUES (
          w."userId",
          w."xpAwarded",
          'MONTHLY_WINNER_BONUS',
          'Monthly leaderboard bonus for ' || p_month || ' - rank #' || w."rank",
          EXTRACT(WEEK FROM award_ts),
          award_ts
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'TopUp: failed to insert XpTransaction for %, user %: %', p_month, w."userId", SQLERRM;
      END;

      BEGIN
        UPDATE "User" SET
          "totalXp" = "totalXp" + w."xpAwarded",
          "currentWeekXp" = COALESCE("currentWeekXp", 0) + w."xpAwarded",
          "updatedAt" = NOW()
        WHERE "id" = w."userId";
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'TopUp: failed to update User totals for %, user %: %', p_month, w."userId", SQLERRM;
      END;

      inserted := inserted + 1;
    END IF;
  END LOOP;

  RETURN inserted;
END;
$$;

