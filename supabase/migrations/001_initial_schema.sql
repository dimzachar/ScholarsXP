-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum for submission status
CREATE TYPE "SubmissionStatus" AS ENUM (
  'PENDING',
  'AI_REVIEWED',
  'UNDER_PEER_REVIEW',
  'FINALIZED',
  'FLAGGED',
  'REJECTED'
);

-- Create User table
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "email" TEXT NOT NULL,
    "username" TEXT,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "currentWeekXp" INTEGER NOT NULL DEFAULT 0,
    "streakWeeks" INTEGER NOT NULL DEFAULT 0,
    "missedReviews" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- Create Submission table
CREATE TABLE "Submission" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "taskTypes" TEXT[] NOT NULL,
    "aiXp" INTEGER NOT NULL,
    "originalityScore" DOUBLE PRECISION,
    "peerXp" INTEGER,
    "finalXp" INTEGER,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weekNumber" INTEGER NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- Create PeerReview table
CREATE TABLE "PeerReview" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "reviewerId" UUID NOT NULL,
    "submissionId" UUID NOT NULL,
    "xpScore" INTEGER NOT NULL,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeerReview_pkey" PRIMARY KEY ("id")
);

-- Create WeeklyStats table
CREATE TABLE "WeeklyStats" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "xpTotal" INTEGER NOT NULL,
    "reviewsDone" INTEGER NOT NULL,
    "reviewsMissed" INTEGER NOT NULL,
    "earnedStreak" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyStats_pkey" PRIMARY KEY ("id")
);

-- Create unique indexes
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "WeeklyStats_userId_weekNumber_key" ON "WeeklyStats"("userId", "weekNumber");

-- Add foreign key constraints
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PeerReview" ADD CONSTRAINT "PeerReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PeerReview" ADD CONSTRAINT "PeerReview_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyStats" ADD CONSTRAINT "WeeklyStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create function to automatically update updatedAt timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updatedAt
CREATE TRIGGER update_user_updated_at BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_submission_updated_at BEFORE UPDATE ON "Submission" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_peer_review_updated_at BEFORE UPDATE ON "PeerReview" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_weekly_stats_updated_at BEFORE UPDATE ON "WeeklyStats" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
