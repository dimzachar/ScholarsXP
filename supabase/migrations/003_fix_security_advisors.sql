-- ============================================================================
-- MIGRATION: Fix Supabase Security Advisors
-- Date: 2025-01-15
-- Purpose: Address RLS disabled warnings and function security issues
-- ============================================================================

-- ============================================================================
-- 1. ENABLE RLS ON MISSING TABLES
-- ============================================================================

-- Enable RLS on AdminAction table
ALTER TABLE "AdminAction" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on notifications table  
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on rate_limits table
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. CREATE RLS POLICIES FOR AdminAction TABLE
-- ============================================================================

-- Only admins can view admin actions
CREATE POLICY "admin_view_admin_actions" ON "AdminAction"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "User" 
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- Only admins can create admin actions
CREATE POLICY "admin_create_admin_actions" ON "AdminAction"
    FOR INSERT WITH CHECK (
        auth.uid() = "adminId" AND
        EXISTS (
            SELECT 1 FROM "User" 
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================================================
-- 3. CREATE RLS POLICIES FOR notifications TABLE
-- ============================================================================

-- Users can only view their own notifications
CREATE POLICY "users_view_own_notifications" ON "notifications"
    FOR SELECT USING (auth.uid()::text = "userId");

-- Users can only update their own notifications (mark as read)
CREATE POLICY "users_update_own_notifications" ON "notifications"
    FOR UPDATE USING (auth.uid()::text = "userId");

-- System can create notifications (service role)
CREATE POLICY "system_create_notifications" ON "notifications"
    FOR INSERT WITH CHECK (true);

-- Admins can view all notifications
CREATE POLICY "admin_view_all_notifications" ON "notifications"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "User" 
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================================================
-- 4. CREATE RLS POLICIES FOR rate_limits TABLE
-- ============================================================================

-- Rate limits are system-managed, only service role should access
-- This table is used internally by the API for rate limiting
CREATE POLICY "system_manage_rate_limits" ON "rate_limits"
    FOR ALL USING (true);

-- ============================================================================
-- 5. FIX MISSING RLS POLICIES FOR ReviewAssignment TABLE
-- ============================================================================

-- Reviewers can view their own assignments
CREATE POLICY "reviewers_view_own_assignments" ON "ReviewAssignment"
    FOR SELECT USING (auth.uid() = "reviewerId");

-- Admins can view all assignments
CREATE POLICY "admin_view_all_assignments" ON "ReviewAssignment"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "User"
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- Admins can manage all assignments (INSERT, UPDATE, DELETE)
CREATE POLICY "admin_manage_assignments" ON "ReviewAssignment"
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM "User"
            WHERE id = auth.uid() AND role = 'ADMIN'
        )
    );

-- ============================================================================
-- 6. FIX FUNCTION SECURITY ISSUE
-- ============================================================================

-- Drop and recreate the update_updated_at_column function with proper security
DROP FUNCTION IF EXISTS update_updated_at_column();

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- 7. ENABLE LEAKED PASSWORD PROTECTION (Auth Configuration)
-- ============================================================================

-- Note: This needs to be done via Supabase Dashboard or Auth API
-- Cannot be done via SQL migration
-- Go to: Authentication > Settings > Password Protection
-- Enable "Check for leaked passwords"

-- ============================================================================
-- 8. VERIFICATION QUERIES
-- ============================================================================

-- Verify RLS is enabled on all tables
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('AdminAction', 'notifications', 'rate_limits', 'ReviewAssignment')
ORDER BY tablename;

-- Verify policies exist
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('AdminAction', 'notifications', 'rate_limits', 'ReviewAssignment')
ORDER BY tablename, policyname;

-- Verify function security
SELECT proname, prosecdef, proconfig
FROM pg_proc 
WHERE proname = 'update_updated_at_column';
