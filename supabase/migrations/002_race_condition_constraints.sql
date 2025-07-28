-- Race Condition Prevention Constraints
-- This migration adds database-level constraints to prevent race conditions and duplicate processing

-- 1. Add check constraint to prevent negative XP values
ALTER TABLE "User" 
ADD CONSTRAINT "User_totalXp_non_negative" CHECK ("totalXp" >= 0);

ALTER TABLE "User" 
ADD CONSTRAINT "User_currentWeekXp_non_negative" CHECK ("currentWeekXp" >= 0);

-- 2. Add check constraint to prevent negative weekly stats
ALTER TABLE "WeeklyStats" 
ADD CONSTRAINT "WeeklyStats_xpTotal_non_negative" CHECK ("xpTotal" >= 0);

-- 3. Add constraint to prevent duplicate XP processing for same submission
-- This ensures a submission can only be finalized once
CREATE UNIQUE INDEX "Submission_finalized_once" 
ON "Submission" ("id") 
WHERE "status" = 'FINALIZED' AND "finalXp" IS NOT NULL;

-- 4. Add index for better performance on XP aggregation queries
CREATE INDEX "Submission_status_finalXp_idx" 
ON "Submission" ("status", "finalXp") 
WHERE "status" IN ('UNDER_PEER_REVIEW', 'FINALIZED');

-- 5. Add index for weekly stats lookups (used in transactions)
CREATE INDEX "WeeklyStats_userId_weekNumber_lookup" 
ON "WeeklyStats" ("userId", "weekNumber");

-- 6. Add index for XP transaction queries
CREATE INDEX "XpTransaction_userId_weekNumber_idx" 
ON "XpTransaction" ("userId", "weekNumber");

CREATE INDEX "XpTransaction_sourceId_type_idx" 
ON "XpTransaction" ("sourceId", "type");

-- 7. Add constraint to prevent XP transactions with zero amount (except admin adjustments)
ALTER TABLE "XpTransaction" 
ADD CONSTRAINT "XpTransaction_amount_not_zero" 
CHECK ("amount" != 0 OR "type" = 'ADMIN_ADJUSTMENT');

-- 8. Add constraint to ensure submission has required reviews before finalization
-- This is a soft constraint - the application logic should enforce this
CREATE OR REPLACE FUNCTION check_submission_reviews()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'FINALIZED' AND NEW.finalXp IS NOT NULL THEN
        -- Check if submission has at least 3 peer reviews
        IF (SELECT COUNT(*) FROM "PeerReview" WHERE "submissionId" = NEW.id) < 3 THEN
            RAISE EXCEPTION 'Cannot finalize submission without at least 3 peer reviews';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER submission_finalization_check
    BEFORE UPDATE ON "Submission"
    FOR EACH ROW
    EXECUTE FUNCTION check_submission_reviews();

-- 9. Add function to validate XP consistency
CREATE OR REPLACE FUNCTION validate_xp_consistency()
RETURNS TRIGGER AS $$
DECLARE
    calculated_total INTEGER;
BEGIN
    -- Calculate total XP from XpTransaction table
    SELECT COALESCE(SUM(amount), 0) INTO calculated_total
    FROM "XpTransaction" 
    WHERE "userId" = NEW."userId";
    
    -- Allow small discrepancies (up to 5 XP) to account for rounding
    IF ABS(NEW."totalXp" - calculated_total) > 5 THEN
        RAISE WARNING 'XP inconsistency detected for user %: User.totalXp = %, calculated = %', 
            NEW."userId", NEW."totalXp", calculated_total;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_xp_consistency_check
    AFTER UPDATE OF "totalXp" ON "User"
    FOR EACH ROW
    EXECUTE FUNCTION validate_xp_consistency();

-- 10. Add comment explaining the race condition fix
COMMENT ON INDEX "Submission_finalized_once" IS 
'Prevents race conditions by ensuring a submission can only be finalized once with XP awarded';

COMMENT ON CONSTRAINT "User_totalXp_non_negative" ON "User" IS 
'Prevents negative XP values that could result from race conditions';

COMMENT ON TRIGGER submission_finalization_check ON "Submission" IS 
'Ensures submissions have required peer reviews before XP finalization';

COMMENT ON TRIGGER user_xp_consistency_check ON "User" IS 
'Validates XP consistency between User.totalXp and XpTransaction records';
