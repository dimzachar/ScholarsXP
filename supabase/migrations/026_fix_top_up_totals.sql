-- Fix top_up_monthly_winner_xp to also reconcile User.totalXp
-- even when the XP transaction already exists for the month.
-- This addresses cases where transactions were inserted but User totals failed to update.

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
  calc_total INTEGER;
  cur_total  INTEGER;
BEGIN
  SELECT mb.start_ts, mb.end_ts INTO v_start_ts, v_end_ts FROM month_bounds(p_month) AS mb;
  award_ts := (v_end_ts - INTERVAL '1 second');

  FOR w IN SELECT * FROM "MonthlyWinner" WHERE "month" = p_month LOOP
    -- Check if a matching transaction exists inside month bounds
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
      -- Insert the missing monthly award transaction
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
        inserted := inserted + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'TopUp: failed to insert XpTransaction for %, user %: %', p_month, w."userId", SQLERRM;
      END;

      -- Only in the missing-transaction case, bump currentWeekXp best-effort
      BEGIN
        UPDATE "User" SET
          "currentWeekXp" = COALESCE("currentWeekXp", 0) + w."xpAwarded",
          "updatedAt" = NOW()
        WHERE "id" = w."userId";
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'TopUp: failed to bump currentWeekXp for %, user %: %', p_month, w."userId", SQLERRM;
      END;
    END IF;

    -- Reconcile User.totalXp to sum(XpTransaction.amount) for the user
    BEGIN
      SELECT COALESCE(SUM(amount), 0) INTO calc_total FROM "XpTransaction" WHERE "userId" = w."userId";
      SELECT "totalXp" INTO cur_total FROM "User" WHERE "id" = w."userId";
      IF cur_total IS NULL THEN cur_total := 0; END IF;
      IF cur_total <> calc_total THEN
        UPDATE "User" SET
          "totalXp" = calc_total,
          "updatedAt" = NOW()
        WHERE "id" = w."userId";
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'TopUp: failed to reconcile totalXp for %, user %: %', p_month, w."userId", SQLERRM;
    END;
  END LOOP;

  RETURN inserted;
END;
$$;

