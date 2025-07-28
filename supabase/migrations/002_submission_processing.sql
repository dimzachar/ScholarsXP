-- Migration: Add SubmissionProcessing table and update SubmissionStatus enum
-- This migration supports the new fast submission flow optimization

-- First, add new enum values to SubmissionStatus
ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'PENDING_AI_EVALUATION';
ALTER TYPE "SubmissionStatus" ADD VALUE IF NOT EXISTS 'APPROVED';

-- Create SubmissionProcessing table for background queue management
CREATE TABLE IF NOT EXISTS "SubmissionProcessing" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "submissionId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "processingStartedAt" TIMESTAMP(3),
    "processingCompletedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "SubmissionProcessing_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SubmissionProcessing_submissionId_key" UNIQUE ("submissionId"),
    CONSTRAINT "SubmissionProcessing_submissionId_fkey" 
        FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE
);

-- Create indexes for efficient queue processing
CREATE INDEX IF NOT EXISTS "SubmissionProcessing_status_priority_idx" 
    ON "SubmissionProcessing"("status", "priority", "createdAt");

CREATE INDEX IF NOT EXISTS "SubmissionProcessing_status_retry_idx" 
    ON "SubmissionProcessing"("status", "retryCount");

-- Create trigger to update updatedAt timestamp
CREATE OR REPLACE FUNCTION update_submission_processing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_submission_processing_updated_at
    BEFORE UPDATE ON "SubmissionProcessing"
    FOR EACH ROW
    EXECUTE FUNCTION update_submission_processing_updated_at();

-- Update default status for new submissions to PROCESSING
ALTER TABLE "Submission" ALTER COLUMN "status" SET DEFAULT 'PROCESSING';

-- Create function to process submission queue (called by pg_cron)
CREATE OR REPLACE FUNCTION process_submission_queue()
RETURNS void AS $$
BEGIN
    -- Mark old PROCESSING records as PENDING if they've been stuck for too long (5 minutes)
    UPDATE "SubmissionProcessing" 
    SET "status" = 'PENDING',
        "processingStartedAt" = NULL,
        "retryCount" = "retryCount" + 1
    WHERE "status" = 'PROCESSING' 
      AND "processingStartedAt" < NOW() - INTERVAL '5 minutes'
      AND "retryCount" < 3;

    -- Mark failed records that have exceeded retry limit
    UPDATE "SubmissionProcessing" 
    SET "status" = 'FAILED',
        "errorMessage" = 'Maximum retry attempts exceeded'
    WHERE "retryCount" >= 3 
      AND "status" IN ('PENDING', 'PROCESSING');

    -- Update corresponding submissions to REJECTED for failed processing
    UPDATE "Submission" 
    SET "status" = 'REJECTED'
    WHERE "id" IN (
        SELECT "submissionId" 
        FROM "SubmissionProcessing" 
        WHERE "status" = 'FAILED'
    );
END;
$$ LANGUAGE plpgsql;

-- Set up pg_cron job to process submissions every minute
-- Note: This requires the pg_cron extension to be enabled
SELECT cron.schedule(
    'process-submissions',
    '* * * * *', -- Every minute
    'SELECT process_submission_queue();'
);

-- Also schedule cleanup of old completed processing records (daily at 2 AM)
SELECT cron.schedule(
    'cleanup-submission-processing',
    '0 2 * * *', -- Daily at 2 AM
    $$
    DELETE FROM "SubmissionProcessing" 
    WHERE "status" IN ('COMPLETED', 'FAILED') 
      AND "updatedAt" < NOW() - INTERVAL '7 days';
    $$
);

-- Grant necessary permissions for the processing functions
GRANT EXECUTE ON FUNCTION process_submission_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION update_submission_processing_updated_at() TO authenticated;

-- Add helpful comments
COMMENT ON TABLE "SubmissionProcessing" IS 'Queue management for background submission processing';
COMMENT ON COLUMN "SubmissionProcessing"."status" IS 'PENDING, PROCESSING, COMPLETED, FAILED';
COMMENT ON COLUMN "SubmissionProcessing"."priority" IS 'HIGH, NORMAL, LOW - for queue prioritization';
COMMENT ON FUNCTION process_submission_queue() IS 'Background function to manage submission processing queue';
