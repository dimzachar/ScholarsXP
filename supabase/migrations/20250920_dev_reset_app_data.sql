-- ============================================================================
-- DEV RESET: Wipe app data to re-import legacy data
-- WARNING: DESTRUCTIVE. Intended for development only. Do NOT run in prod.
-- Preserves only the admin with username 'raki5629'.
-- ============================================================================

begin;

-- 1) Truncate known data tables if they exist (idempotent and safe)
do $$
declare
  t text;
  tbls text[] := array[
    'PeerReview',
    'ReviewAssignment',
    'XpTransaction',
    'Submission',
    'WeeklyStats',
    'UserAchievement',
    'MonthlyWinner',
    'UserMergeHistory',
    'MergeLock',
    'TransferBatch',
    'RollbackPoint',
    'AutomationLog',
    'LegacySubmission',
    'notifications',
    'cache_entries',
    'AiEvaluation',
    'ContentFingerprint',
    'RolePromotionNotification',
    'SystemLog',
    'SubmissionProcessing',
    'ContentFlag'
  ];
begin
  foreach t in array tbls loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('truncate table %I.%I restart identity cascade', 'public', t);
    end if;
  end loop;
end $$;

-- 2) Keep only the admin user 'raki5629' (if User table exists)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'User'
  ) then
    -- Delete all users except the preserved admin; handles NULL usernames too
    delete from public."User" where username is distinct from 'raki5629';
  end if;
end $$;

-- 3) OPTIONAL: Also clean up Supabase Auth users (commented out)
-- NOTE: Uncomment if you also want to wipe auth users while keeping the admin
--       whose id is present in public."User" with username 'raki5629'.
-- delete from auth.users where id not in (
--   select id from public."User" where username in ('raki5629')
-- );
-- OR wipe all Auth users (you will need to re-create your login):
-- delete from auth.users;

commit;

-- RAISE NOTICE so it's obvious in logs that this is dev-only
do $$ begin raise notice '✅ Dev reset completed. Kept user: raki5629'; end $$;
