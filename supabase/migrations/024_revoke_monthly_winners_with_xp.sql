-- Revoke monthly winners and reverse their XP awards atomically

-- Revoke by winner ID
CREATE OR REPLACE FUNCTION revoke_monthly_winner_by_id(p_winner_id UUID)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  w RECORD;
  v_start_ts TIMESTAMPTZ;
  v_end_ts   TIMESTAMPTZ;
  award_ts   TIMESTAMPTZ;
BEGIN
  SELECT * INTO w FROM "MonthlyWinner" WHERE id = p_winner_id;
  IF NOT FOUND THEN
    RETURN; -- nothing to revoke
  END IF;

  -- Month boundaries and canonical award timestamp used originally
  SELECT mb.start_ts, mb.end_ts INTO v_start_ts, v_end_ts FROM month_bounds(w."month") AS mb;
  award_ts := (v_end_ts - INTERVAL '1 second');

  -- Insert compensating XP transaction (negative amount)
  BEGIN
    INSERT INTO "XpTransaction" ("userId", "amount", "type", "description", "weekNumber", "createdAt")
    VALUES (
      w."userId",
      -w."xpAwarded",
      'MONTHLY_WINNER_BONUS_REVERSAL',
      'Reversal of monthly leaderboard bonus for ' || w."month" || ' - rank #' || w."rank",
      EXTRACT(WEEK FROM award_ts),
      award_ts
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Revoke: failed to insert reversal XpTransaction for %, user %: %', w."month", w."userId", SQLERRM;
  END;

  -- Update user totals (cap at 0 to satisfy non-negative constraints)
  BEGIN
    UPDATE "User" SET
      "totalXp" = GREATEST("totalXp" - w."xpAwarded", 0),
      "currentWeekXp" = GREATEST(COALESCE("currentWeekXp", 0) - w."xpAwarded", 0),
      "updatedAt" = NOW()
    WHERE "id" = w."userId";
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Revoke: failed to update User totals for %, user %: %', w."month", w."userId", SQLERRM;
  END;

  -- Delete winner row
  DELETE FROM "MonthlyWinner" WHERE id = p_winner_id;
END;
$$;

-- Revoke all winners for a given month
CREATE OR REPLACE FUNCTION revoke_monthly_winners(p_month TEXT)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  w RECORD;
  revoked_count INTEGER := 0;
BEGIN
  FOR w IN SELECT id FROM "MonthlyWinner" WHERE "month" = p_month LOOP
    PERFORM revoke_monthly_winner_by_id(w.id);
    revoked_count := revoked_count + 1;
  END LOOP;
  RETURN revoked_count;
END;
$$;

-- Revoke all winners across all months
CREATE OR REPLACE FUNCTION revoke_all_monthly_winners()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
  w RECORD;
  revoked_count INTEGER := 0;
BEGIN
  FOR w IN SELECT id FROM "MonthlyWinner" LOOP
    PERFORM revoke_monthly_winner_by_id(w.id);
    revoked_count := revoked_count + 1;
  END LOOP;
  RETURN revoked_count;
END;
$$;

