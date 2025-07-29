-- ============================================================================
-- ADD DISCORD FIELDS TO USER TABLE
-- ============================================================================
-- This migration adds Discord-related fields to the User table that are
-- required for the legacy account merge system.

-- Add Discord-related columns to User table
ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS "discordId" TEXT,
ADD COLUMN IF NOT EXISTS "discordHandle" TEXT,
ADD COLUMN IF NOT EXISTS "discordAvatarUrl" TEXT;

-- Add indexes for Discord fields (used in legacy account matching)
CREATE INDEX IF NOT EXISTS "User_discordId_idx" ON "User"("discordId");
CREATE INDEX IF NOT EXISTS "User_discordHandle_idx" ON "User"("discordHandle");

-- Add unique constraint on discordId (each Discord user should have only one account)
CREATE UNIQUE INDEX IF NOT EXISTS "User_discordId_unique" ON "User"("discordId") WHERE "discordId" IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN "User"."discordId" IS 'Discord user ID from OAuth provider';
COMMENT ON COLUMN "User"."discordHandle" IS 'Discord username with discriminator (e.g., username#1234)';
COMMENT ON COLUMN "User"."discordAvatarUrl" IS 'URL to Discord avatar image';
