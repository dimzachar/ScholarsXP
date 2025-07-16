-- STEP-BY-STEP RLS MIGRATION
-- Run each section separately in Supabase SQL Editor to avoid errors

-- ============================================================================
-- STEP 1: CREATE ENUMS (Run this first)
-- ============================================================================

-- Create UserRole enum if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
        CREATE TYPE "UserRole" AS ENUM ('USER', 'REVIEWER', 'ADMIN');
    END IF;
END $$;

-- Create ReviewAssignmentStatus enum if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReviewAssignmentStatus') THEN
        CREATE TYPE "ReviewAssignmentStatus" AS ENUM ('ASSIGNED', 'COMPLETED', 'OVERDUE', 'CANCELLED');
    END IF;
END $$;

-- ============================================================================
-- STEP 2: ADD ROLE COLUMN TO USER TABLE (Run this second)
-- ============================================================================

-- Add role column to User table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'role') THEN
        ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';
    END IF;
END $$;

-- ============================================================================
-- STEP 3: CREATE REVIEWASSIGNMENT TABLE (Run this third - ONLY if table doesn't exist)
-- ============================================================================

-- Check if ReviewAssignment table exists first by running:
-- SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ReviewAssignment');

-- If it returns FALSE, run this:
CREATE TABLE IF NOT EXISTS "ReviewAssignment" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "submissionId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" "ReviewAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "ReviewAssignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReviewAssignment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewAssignment_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewAssignment_unique" UNIQUE ("submissionId", "reviewerId")
);

-- ============================================================================
-- STEP 4: ENABLE RLS ON ALL TABLES (Run this fourth)
-- ============================================================================

-- Enable Row Level Security on all tables
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PeerReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WeeklyStats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReviewAssignment" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 5: CREATE USER TABLE POLICIES (Run this fifth)
-- ============================================================================

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
-- STEP 6: CREATE SUBMISSION TABLE POLICIES (Run this sixth)
-- ============================================================================

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
-- STEP 7: CREATE PEER REVIEW TABLE POLICIES (Run this seventh)
-- ============================================================================

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

-- Reviewers can create reviews for assigned submissions
-- Note: Using text comparison for status to handle existing tables
CREATE POLICY "reviewers_create_reviews" ON "PeerReview"
    FOR INSERT WITH CHECK (
        auth.uid() = "reviewerId" AND
        EXISTS (
            SELECT 1 FROM "ReviewAssignment"
            WHERE "reviewerId" = auth.uid()
            AND "submissionId" = "PeerReview"."submissionId"
            AND status::text = 'ASSIGNED'
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
-- STEP 8: CREATE WEEKLY STATS TABLE POLICIES (Run this eighth)
-- ============================================================================

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
-- STEP 9: CREATE REVIEW ASSIGNMENT TABLE POLICIES (Run this ninth)
-- ============================================================================

-- Reviewers can view their own assignments
CREATE POLICY "reviewers_own_assignments" ON "ReviewAssignment"
    FOR SELECT USING (auth.uid() = "reviewerId");

-- Admins can view all assignments
CREATE POLICY "admin_view_all_assignments" ON "ReviewAssignment"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "User"
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- Admins can create and update assignments
CREATE POLICY "admin_manage_assignments" ON "ReviewAssignment"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "User"
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================================================
-- STEP 10: VERIFICATION QUERIES (Run these to verify everything worked)
-- ============================================================================

-- Check RLS is enabled on all tables
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('User', 'Submission', 'PeerReview', 'WeeklyStats', 'ReviewAssignment');

-- Check role column exists
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'User' AND column_name = 'role';

-- List all RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
