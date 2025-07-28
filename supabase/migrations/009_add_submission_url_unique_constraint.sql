-- ============================================================================
-- ADD UNIQUE CONSTRAINT TO SUBMISSION URL
-- ============================================================================
-- This migration adds a unique constraint to the Submission.url field to prevent
-- race conditions where the same URL could be submitted multiple times by the
-- same user or different users within a short time window.

-- First, check if there are any existing duplicate URLs and handle them
DO $$
DECLARE
    duplicate_count INTEGER;
BEGIN
    -- Count existing duplicates
    SELECT COUNT(*) INTO duplicate_count
    FROM (
        SELECT url, COUNT(*) as cnt
        FROM "Submission"
        WHERE status != 'REJECTED'
        GROUP BY url
        HAVING COUNT(*) > 1
    ) duplicates;
    
    RAISE NOTICE 'Found % duplicate URLs in Submission table', duplicate_count;
    
    -- If there are duplicates, we need to handle them before adding the constraint
    IF duplicate_count > 0 THEN
        RAISE NOTICE 'Handling duplicate URLs before adding unique constraint...';
        
        -- Keep the oldest submission for each URL, mark others as REJECTED
        UPDATE "Submission" 
        SET status = 'REJECTED', 
            "updatedAt" = NOW()
        WHERE id IN (
            SELECT s.id
            FROM "Submission" s
            INNER JOIN (
                SELECT url, MIN("createdAt") as first_created
                FROM "Submission"
                WHERE status != 'REJECTED'
                GROUP BY url
                HAVING COUNT(*) > 1
            ) first_submissions ON s.url = first_submissions.url
            WHERE s."createdAt" > first_submissions.first_created
              AND s.status != 'REJECTED'
        );
        
        RAISE NOTICE 'Marked duplicate submissions as REJECTED, keeping the oldest submission for each URL';
    END IF;
END $$;

-- Add the unique constraint
DO $$
BEGIN
    -- Check if the unique constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'Submission_url_key'
    ) THEN
        -- Add unique constraint on url field
        ALTER TABLE "Submission" ADD CONSTRAINT "Submission_url_key" UNIQUE ("url");
        RAISE NOTICE 'Added unique constraint on Submission.url';
    ELSE
        RAISE NOTICE 'Unique constraint on Submission.url already exists';
    END IF;
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION 'Cannot add unique constraint due to existing duplicate URLs. Please clean up duplicates first.';
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error adding unique constraint: %', SQLERRM;
END $$;

-- Add index for performance (if not already exists from unique constraint)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'Submission_url_key' OR indexname = 'Submission_url_idx'
    ) THEN
        CREATE INDEX "Submission_url_idx" ON "Submission"("url");
        RAISE NOTICE 'Added index on Submission.url';
    ELSE
        RAISE NOTICE 'Index on Submission.url already exists';
    END IF;
END $$;

-- Verify the constraint was added successfully
DO $$
DECLARE
    constraint_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'Submission_url_key'
    ) INTO constraint_exists;
    
    IF constraint_exists THEN
        RAISE NOTICE '✅ SUCCESS: Unique constraint on Submission.url is now active';
        RAISE NOTICE '✅ This prevents race conditions where the same URL could be submitted multiple times';
    ELSE
        RAISE WARNING '❌ FAILED: Unique constraint was not added successfully';
    END IF;
END $$;
