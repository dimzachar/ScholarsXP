-- Migration 002: Enable Row Level Security and Add Missing Schema Elements
-- This migration adds the missing role column and enables RLS with comprehensive policies

-- First, add the missing role column and enum if not exists
DO $$ 
BEGIN
    -- Create UserRole enum if it doesn't exist
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

-- Create ReviewAssignmentStatus enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReviewAssignmentStatus') THEN
        CREATE TYPE "ReviewAssignmentStatus" AS ENUM ('ASSIGNED', 'COMPLETED', 'OVERDUE', 'CANCELLED');
    END IF;
END $$;

-- Handle ReviewAssignment table creation/modification
DO $$
BEGIN
    -- Check if ReviewAssignment table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ReviewAssignment') THEN
        -- Create the table if it doesn't exist
        CREATE TABLE "ReviewAssignment" (
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
    ELSE
        -- Table exists, check if status column needs to be updated to use enum
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ReviewAssignment' AND column_name = 'status' AND data_type = 'text') THEN
            -- Convert existing TEXT status column to enum
            ALTER TABLE "ReviewAssignment" ALTER COLUMN "status" TYPE "ReviewAssignmentStatus" USING "status"::"ReviewAssignmentStatus";
        END IF;
    END IF;
END $$;

-- Enable Row Level Security on all tables
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Submission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PeerReview" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WeeklyStats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReviewAssignment" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- USER TABLE POLICIES
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
-- SUBMISSION TABLE POLICIES
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
-- PEER REVIEW TABLE POLICIES
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
CREATE POLICY "reviewers_create_reviews" ON "PeerReview"
    FOR INSERT WITH CHECK (
        auth.uid() = "reviewerId" AND
        EXISTS (
            SELECT 1 FROM "ReviewAssignment"
            WHERE "reviewerId" = auth.uid() 
            AND "submissionId" = "PeerReview"."submissionId"
            AND status = 'ASSIGNED'
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
-- WEEKLY STATS TABLE POLICIES
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
-- REVIEW ASSIGNMENT TABLE POLICIES
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

-- Create trigger for ReviewAssignment updatedAt
CREATE TRIGGER update_review_assignment_updated_at 
    BEFORE UPDATE ON "ReviewAssignment" 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
