-- Backfill XP for existing MonthlyWinner rows that lack a corresponding XP transaction
-- Idempotent: checks for an existing MONTHLY_WINNER_BONUS (or matching description) in the target month.

DO $$
DECLARE
  w RECORD;
  v_start_ts TIMESTAMPTZ;
  v_end_ts   TIMESTAMPTZ;
  award_ts   TIMESTAMPTZ;
  has_tx     BOOLEAN;
BEGIN
  FOR w IN SELECT * FROM "MonthlyWinner" LOOP
    -- Get month bounds and canonical award timestamp (end of month UTC)
    SELECT mb.start_ts, mb.end_ts
      INTO v_start_ts, v_end_ts
    FROM month_bounds(w."month") AS mb;
    award_ts := (v_end_ts - INTERVAL '1 second');

    -- Check if a matching transaction already exists in that month
    SELECT EXISTS (
      SELECT 1 FROM "XpTransaction" t
      WHERE t."userId" = w."userId"
        AND t."amount" = w."xpAwarded"
        AND t."createdAt" >= v_start_ts AND t."createdAt" < v_end_ts
        AND (
          t."type" = 'MONTHLY_WINNER_BONUS' OR
          t."description" ILIKE '%' || w."month" || '%'
        )
    ) INTO has_tx;

    IF NOT has_tx THEN
      -- Insert transaction (best-effort)
      BEGIN
        INSERT INTO "XpTransaction" ("userId", "amount", "type", "description", "weekNumber", "createdAt")
        VALUES (
          w."userId",
          w."xpAwarded",
          'MONTHLY_WINNER_BONUS',
          'Monthly leaderboard bonus for ' || w."month" || ' - rank #' || w."rank",
          EXTRACT(WEEK FROM award_ts),
          award_ts
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Backfill: failed to insert XpTransaction for %, user %: %', w."month", w."userId", SQLERRM;
      END;

      -- Update user totals (best-effort)
      BEGIN
        UPDATE "User" SET
          "totalXp" = "totalXp" + w."xpAwarded",
          "currentWeekXp" = COALESCE("currentWeekXp", 0) + w."xpAwarded",
          "updatedAt" = NOW()
        WHERE "id" = w."userId";
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Backfill: failed to update User totals for %, user %: %', w."month", w."userId", SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;
