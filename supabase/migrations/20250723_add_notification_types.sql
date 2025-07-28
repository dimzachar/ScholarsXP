-- Add missing notification types to the NotificationType enum
-- This fixes the enum mismatch between Prisma schema and database

-- First, check what tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE '%otification%';

-- Add the missing notification types
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBMISSION_PROCESSING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBMISSION_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUBMISSION_REJECTED';

-- Verify the enum values
SELECT unnest(enum_range(NULL::"NotificationType")) AS notification_type;

-- Check existing notification types in the table (try both possible names)
SELECT DISTINCT type FROM notifications WHERE type IS NOT NULL
UNION ALL
SELECT DISTINCT type FROM "Notification" WHERE type IS NOT NULL;
