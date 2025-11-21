-- SAFE Weekly XP Fix with Verification and Backup
-- This script creates a backup table with corrected values and compares it with the original table

-- STEP 1: Clear existing backup data and insert corrected values
DELETE FROM "User_WeeklyXp_Backup";

INSERT INTO "User_WeeklyXp_Backup" (id, username, totalxp, streakweeks, createdat, updatedat, original_currentweekxp, backup_reason)
SELECT 
    u.id,
    u.username,
    u."totalXp",
    u."streakWeeks",
    u."createdAt",
    u."updatedAt",
    COALESCE((
        SELECT SUM(amount) 
        FROM "XpTransaction" 
        WHERE "userId" = u.id 
        AND "weekNumber" = EXTRACT(WEEK FROM CURRENT_DATE)
    ), 0) as original_currentweekxp,
    'Xp-Corrected-' || CURRENT_DATE as backup_reason
FROM "User" u;

-- STEP 2: Show comparison of original vs backup values for affected users
SELECT 
    "User".id,
    "User".username,
    "User"."currentWeekXp" as original_weekly_xp,
    "User_WeeklyXp_Backup".original_currentweekxp as corrected_weekly_xp,
    "User"."totalXp",
    "User"."streakWeeks",
    "User"."createdAt",
    "User"."updatedAt",
    CASE 
        WHEN "User"."currentWeekXp" = "User_WeeklyXp_Backup".original_currentweekxp THEN '✅ NO CHANGE'
        ELSE '❌ UPDATED'
    END as change_status
FROM "User"
JOIN "User_WeeklyXp_Backup" ON "User".id = "User_WeeklyXp_Backup".id
WHERE "User"."currentWeekXp" != "User_WeeklyXp_Backup".original_currentweekxp
ORDER BY "User".id;

-- STEP 3: Count users affected by the changes
SELECT 
    COUNT(*) as total_users_with_weekly_xp,
    COUNT(CASE WHEN "User"."currentWeekXp" != "User_WeeklyXp_Backup".original_currentweekxp THEN 1 END) as users_with_changes,
    COUNT(CASE WHEN "User"."currentWeekXp" = "User_WeeklyXp_Backup".original_currentweekxp THEN 1 END) as users_no_changes
FROM "User"
JOIN "User_WeeklyXp_Backup" ON "User".id = "User_WeeklyXp_Backup".id
WHERE "User"."currentWeekXp" IS NOT NULL;

-- STEP 4: Verify the backup table data AND show comparison with original wrong values
SELECT 
    u.id,
    u.username,
    u."currentWeekXp" as original_wrong_weekly_xp,
    backup.original_currentweekxp as corrected_weekly_xp,
    backup.original_currentweekxp as backup_weekly_xp,
    backup.original_currentweekxp as calculated_weekly_xp,
    CASE 
        WHEN u."currentWeekXp" = backup.original_currentweekxp THEN '✅ CORRECT'
        ELSE '❌ NEEDS FIX'
    END as verification_status
FROM "User" u
JOIN "User_WeeklyXp_Backup" backup ON u.id = backup.id
ORDER BY u.id;

-- STEP 5: How to use the backup data (if needed)
/*
-- If you want to update the original User table with the corrected values from backup:
UPDATE "User" 
SET "currentWeekXp" = "User_WeeklyXp_Backup".original_currentweekxp
FROM "User_WeeklyXp_Backup" 
WHERE "User".id = "User_WeeklyXp_Backup".id
AND "User"."currentWeekXp" != "User_WeeklyXp_Backup".original_currentweekxp;
*/
