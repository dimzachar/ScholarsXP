-- ============================================================================
-- MIGRATION 007: RLS Policies for AI Evaluation System
-- Date: 2025-01-20
-- Purpose: Create RLS policies for new AI evaluation tables
-- ============================================================================

-- ============================================================================
-- AI EVALUATION POLICIES
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "admin_view_ai_evaluations" ON "AiEvaluation";
DROP POLICY IF EXISTS "system_manage_ai_evaluations" ON "AiEvaluation";

-- Only admins can view AI evaluation details
CREATE POLICY "admin_view_ai_evaluations" ON "AiEvaluation"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "User" 
            WHERE "User".id = auth.uid() 
            AND "User".role = 'ADMIN'
        )
    );

-- System can insert/update AI evaluations (for background processing)
CREATE POLICY "system_manage_ai_evaluations" ON "AiEvaluation"
    FOR ALL USING (true);

-- ============================================================================
-- LEGACY SUBMISSION POLICIES
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "admin_view_legacy_submissions" ON "LegacySubmission";
DROP POLICY IF EXISTS "system_manage_legacy_submissions" ON "LegacySubmission";

-- Only admins can view legacy submissions
CREATE POLICY "admin_view_legacy_submissions" ON "LegacySubmission"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "User" 
            WHERE "User".id = auth.uid() 
            AND "User".role = 'ADMIN'
        )
    );

-- System can manage legacy submissions (for import/duplicate checking)
CREATE POLICY "system_manage_legacy_submissions" ON "LegacySubmission"
    FOR ALL USING (true);

-- ============================================================================
-- CONTENT FINGERPRINT POLICIES
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "system_manage_content_fingerprints" ON "ContentFingerprint";

-- System can manage content fingerprints (for duplicate detection)
CREATE POLICY "system_manage_content_fingerprints" ON "ContentFingerprint"
    FOR ALL USING (true);

-- ============================================================================
-- ROLE PROMOTION NOTIFICATION POLICIES
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "admin_view_role_promotions" ON "RolePromotionNotification";
DROP POLICY IF EXISTS "system_manage_role_promotions" ON "RolePromotionNotification";

-- Only admins can view role promotion notifications
CREATE POLICY "admin_view_role_promotions" ON "RolePromotionNotification"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "User" 
            WHERE "User".id = auth.uid() 
            AND "User".role = 'ADMIN'
        )
    );

-- System can manage role promotion notifications
CREATE POLICY "system_manage_role_promotions" ON "RolePromotionNotification"
    FOR ALL USING (true);

-- ============================================================================
-- SYSTEM LOG POLICIES
-- ============================================================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "admin_view_system_logs" ON "SystemLog";
DROP POLICY IF EXISTS "system_manage_system_logs" ON "SystemLog";

-- Only admins can view system logs
CREATE POLICY "admin_view_system_logs" ON "SystemLog"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "User" 
            WHERE "User".id = auth.uid() 
            AND "User".role = 'ADMIN'
        )
    );

-- System can manage system logs
CREATE POLICY "system_manage_system_logs" ON "SystemLog"
    FOR ALL USING (true);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify new tables were created
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('AiEvaluation', 'LegacySubmission', 'ContentFingerprint', 'RolePromotionNotification', 'SystemLog')
ORDER BY table_name;

-- Verify Discord fields were added to User table
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'User' 
AND column_name IN ('discordId', 'discordHandle', 'discordAvatarUrl')
ORDER BY column_name;

-- Verify RLS is enabled on new tables
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('AiEvaluation', 'LegacySubmission', 'ContentFingerprint', 'RolePromotionNotification', 'SystemLog')
ORDER BY tablename;

-- List all RLS policies for new tables
SELECT schemaname, tablename, policyname, permissive, roles, cmd 
FROM pg_policies 
WHERE schemaname = 'public'
AND tablename IN ('AiEvaluation', 'LegacySubmission', 'ContentFingerprint', 'RolePromotionNotification', 'SystemLog')
ORDER BY tablename, policyname;
