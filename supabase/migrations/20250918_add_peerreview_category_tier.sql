-- XP V2: Add contentCategory and qualityTier to PeerReview for auditability
-- Safe to run multiple times due to IF NOT EXISTS guards.

ALTER TABLE "PeerReview" ADD COLUMN IF NOT EXISTS "contentCategory" text;
ALTER TABLE "PeerReview" ADD COLUMN IF NOT EXISTS "qualityTier" text;

DO $$
BEGIN
  -- Add check constraint for contentCategory (nullable)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'peerreview_contentCategory_check'
  ) THEN
    ALTER TABLE "PeerReview"
      ADD CONSTRAINT peerreview_contentCategory_check
      CHECK ("contentCategory" IS NULL OR "contentCategory" IN ('strategy','guide','technical'));
  END IF;

  -- Add check constraint for qualityTier (nullable)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'peerreview_qualityTier_check'
  ) THEN
    ALTER TABLE "PeerReview"
      ADD CONSTRAINT peerreview_qualityTier_check
      CHECK ("qualityTier" IS NULL OR "qualityTier" IN ('basic','average','awesome'));
  END IF;
END $$;

