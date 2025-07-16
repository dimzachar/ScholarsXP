-- SIMPLIFIED RLS MIGRATION - WORKS WITH EXISTING SCHEMA
-- This version works with your existing tables without requiring schema changes

-- ============================================================================
-- STEP 1: CREATE USER ROLE ENUM AND ADD ROLE COLUMN
-- ============================================================================

-- Create UserRole enum if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
        CREATE TYPE "UserRole" AS ENUM ('USER', 'REVIEWER', 'ADMIN');
    END IF;
END $$;

-- Add role column to User table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'role') THEN
        ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';
    END IF;
END $$;

-- ============================================================================
-- STEP 2: ENABLE RLS ON ALL EXISTING TABLES
-- ============================================================================

-- Enable Row Level Security on existing tables only
DO $$
BEGIN
    -- Enable RLS on User table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'User') THEN
        ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Enable RLS on Submission table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Submission') THEN
        ALTER TABLE "Submission" ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Enable RLS on PeerReview table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'PeerReview') THEN
        ALTER TABLE "PeerReview" ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Enable RLS on WeeklyStats table
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'WeeklyStats') THEN
        ALTER TABLE "WeeklyStats" ENABLE ROW LEVEL SECURITY;
    END IF;
    
    -- Enable RLS on ReviewAssignment table if it exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ReviewAssignment') THEN
        ALTER TABLE "ReviewAssignment" ENABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- ============================================================================
-- STEP 3: CREATE USER TABLE POLICIES
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "users_own_profile_select" ON "User";
DROP POLICY IF EXISTS "users_own_profile_update" ON "User";
DROP POLICY IF EXISTS "admin_view_all_users" ON "User";
DROP POLICY IF EXISTS "admin_update_all_users" ON "User";

-- Users can view and update their own profile
CREATE POLICY "users_own_profile_select" ON "User"
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "users_own_profile_update" ON "User"
    FOR UPDATE USING (auth.uid() = id);

-- Admins can view all users
CREATE POLICY "admin_view_all_users" ON "User"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "User" 
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- Admins can update any user (for role management)
CREATE POLICY "admin_update_all_users" ON "User"
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM "User" 
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================================================
-- STEP 4: CREATE SUBMISSION TABLE POLICIES
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "users_own_submissions" ON "Submission";
DROP POLICY IF EXISTS "users_create_submissions" ON "Submission";
DROP POLICY IF EXISTS "users_update_own_submissions" ON "Submission";
DROP POLICY IF EXISTS "reviewers_view_submissions" ON "Submission";
DROP POLICY IF EXISTS "admin_update_submissions" ON "Submission";

-- Users can view their own submissions
CREATE POLICY "users_own_submissions" ON "Submission"
    FOR SELECT USING (auth.uid() = "userId");

-- Users can create their own submissions
CREATE POLICY "users_create_submissions" ON "Submission"
    FOR INSERT WITH CHECK (auth.uid() = "userId");

-- Users can update their own submissions (before review)
CREATE POLICY "users_update_own_submissions" ON "Submission"
    FOR UPDATE USING (
        auth.uid() = "userId" AND 
        status IN ('PENDING', 'AI_REVIEWED')
    );

-- Reviewers and admins can view all submissions
CREATE POLICY "reviewers_view_submissions" ON "Submission"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "User"
            WHERE id = auth.uid() 
            AND role IN ('REVIEWER', 'ADMIN')
        )
    );

-- Admins can update any submission
CREATE POLICY "admin_update_submissions" ON "Submission"
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM "User"
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================================================
-- STEP 5: CREATE PEER REVIEW TABLE POLICIES (SIMPLIFIED)
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "reviewers_own_reviews" ON "PeerReview";
DROP POLICY IF EXISTS "users_view_own_submission_reviews" ON "PeerReview";
DROP POLICY IF EXISTS "reviewers_create_reviews" ON "PeerReview";
DROP POLICY IF EXISTS "admin_view_all_reviews" ON "PeerReview";

-- Reviewers can view their own reviews
CREATE POLICY "reviewers_own_reviews" ON "PeerReview"
    FOR SELECT USING (auth.uid() = "reviewerId");

-- Users can view reviews of their own submissions
CREATE POLICY "users_view_own_submission_reviews" ON "PeerReview"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "Submission"
            WHERE id = "PeerReview"."submissionId" 
            AND "userId" = auth.uid()
        )
    );

-- Simplified: Reviewers can create reviews (without ReviewAssignment check for now)
CREATE POLICY "reviewers_create_reviews" ON "PeerReview"
    FOR INSERT WITH CHECK (
        auth.uid() = "reviewerId" AND
        EXISTS (
            SELECT 1 FROM "User"
            WHERE id = auth.uid() AND role IN ('REVIEWER', 'ADMIN')
        )
    );

-- Admins can view all reviews
CREATE POLICY "admin_view_all_reviews" ON "PeerReview"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "User"
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================================================
-- STEP 6: CREATE WEEKLY STATS TABLE POLICIES
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "users_own_weekly_stats" ON "WeeklyStats";
DROP POLICY IF EXISTS "users_create_weekly_stats" ON "WeeklyStats";
DROP POLICY IF EXISTS "admin_view_all_weekly_stats" ON "WeeklyStats";

-- Users can view their own weekly stats
CREATE POLICY "users_own_weekly_stats" ON "WeeklyStats"
    FOR SELECT USING (auth.uid() = "userId");

-- Users can insert their own weekly stats (system generated)
CREATE POLICY "users_create_weekly_stats" ON "WeeklyStats"
    FOR INSERT WITH CHECK (auth.uid() = "userId");

-- Admins can view all weekly stats
CREATE POLICY "admin_view_all_weekly_stats" ON "WeeklyStats"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "User"
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================================================
-- STEP 7: CREATE REVIEW ASSIGNMENT POLICIES (IF TABLE EXISTS)
-- ============================================================================

-- Only create policies if ReviewAssignment table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ReviewAssignment') THEN
        -- Drop existing policies if they exist
        DROP POLICY IF EXISTS "reviewers_own_assignments" ON "ReviewAssignment";
        DROP POLICY IF EXISTS "admin_view_all_assignments" ON "ReviewAssignment";
        DROP POLICY IF EXISTS "admin_manage_assignments" ON "ReviewAssignment";

        -- Reviewers can view their own assignments
        EXECUTE 'CREATE POLICY "reviewers_own_assignments" ON "ReviewAssignment"
            FOR SELECT USING (auth.uid() = "reviewerId")';

        -- Admins can view all assignments
        EXECUTE 'CREATE POLICY "admin_view_all_assignments" ON "ReviewAssignment"
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM "User"
                    WHERE id = auth.uid() AND role = ''ADMIN''
                )
            )';

        -- Admins can create and update assignments
        EXECUTE 'CREATE POLICY "admin_manage_assignments" ON "ReviewAssignment"
            FOR ALL USING (
                EXISTS (
                    SELECT 1 FROM "User"
                    WHERE id = auth.uid() AND role = ''ADMIN''
                )
            )';
    END IF;
END $$;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check RLS is enabled on all tables
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('User', 'Submission', 'PeerReview', 'WeeklyStats', 'ReviewAssignment')
ORDER BY tablename;

-- Check role column exists
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'User' AND column_name = 'role';

-- List all RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
