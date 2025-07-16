import { prisma } from '@/lib/prisma'
import { getWeekNumber } from '@/lib/utils'
import { TASK_TYPES, getTaskType } from '@/lib/task-types'
import { classifyMultiTask } from '@/lib/multi-task-classifier'
import { getCurrentWeeklyProgress } from '@/lib/weekly-task-tracker'
import {
  MultiTaskResult,
  TaskTypeId,
  XPAggregationResult,
  ContentData
} from '@/types/task-types'

// Updated weekly task caps based on new system
const WEEKLY_TASK_CAPS = {
  A: 90,  // Thread or Long Article - max 90 XP per week (3 × 30)
  B: 450, // Platform Article - max 450 XP per week (3 × 150)
  C: 90,  // Tutorial/Guide - max 90 XP per week (3 × 30)
  D: 225, // Protocol Explanation - max 225 XP per week (3 × 75)
  E: 225, // Correction Bounty - max 225 XP per week (3 × 75)
  F: 225  // Strategies - max 225 XP per week (3 × 75)
}

export interface EnhancedXPAggregationResult extends XPAggregationResult {
  multiTaskResult?: MultiTaskResult
  weeklyProgress: Record<string, { completions: number; xpEarned: number; remainingCapacity: number }>
}

export async function aggregateXP(submissionId: string): Promise<EnhancedXPAggregationResult> {
  try {
    // Get the submission with all peer reviews
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        peerReviews: true,
        user: true
      }
    })

    if (!submission) {
      throw new Error('Submission not found')
    }

    if (submission.peerReviews.length < 3) {
      throw new Error('Not enough peer reviews for aggregation')
    }

    // Get content data for multi-task classification
    const contentData: ContentData = {
      url: submission.url,
      platform: submission.platform,
      content: '', // Will be fetched from URL in real implementation
      extractedAt: submission.createdAt
    }

    // Perform multi-task classification to get accurate XP calculation
    const multiTaskResult = await classifyMultiTask(contentData, submission.userId)

    // Calculate weighted average of AI and peer scores for quality adjustment
    const aiXp = submission.aiXp
    const peerScores = submission.peerReviews.map(review => review.xpScore)
    const averagePeerXp = peerScores.reduce((sum, score) => sum + score, 0) / peerScores.length

    // Use multi-task result as base, but adjust with peer review quality assessment
    const qualityMultiplier = averagePeerXp / Math.max(aiXp, 1) // Peer vs AI quality ratio
    const adjustedXp = Math.round(multiTaskResult.totalXp * Math.min(Math.max(qualityMultiplier, 0.5), 1.5))

    // Get user's current weekly progress
    const weeklyProgress = await getCurrentWeeklyProgress(submission.userId)

    // The multi-task result already includes weekly limit applications
    const finalXp = multiTaskResult.totalXp
    const cappedXp = finalXp // Already capped in multi-task classification

    // Generate detailed reasoning
    const taskBreakdown = multiTaskResult.qualifyingTasks
      .map(task => `${task.taskType}: ${task.xpAwarded} XP`)
      .join(', ')

    const limitApplications = multiTaskResult.weeklyLimitsApplied
      .filter(limit => limit.cappedXp < limit.originalXp)
      .map(limit => `${limit.taskType} capped from ${limit.originalXp} to ${limit.cappedXp} XP`)
      .join(', ')

    let reasoning = `Multi-task XP: ${finalXp} (${taskBreakdown})`
    if (limitApplications) {
      reasoning += `. Weekly limits applied: ${limitApplications}`
    }
    reasoning += `. Quality adjustment: ${Math.round(qualityMultiplier * 100)}% (Peer: ${Math.round(averagePeerXp)}, AI: ${aiXp})`

    // Create weekly progress summary
    const weeklyProgressSummary: Record<string, { completions: number; xpEarned: number; remainingCapacity: number }> = {}
    Object.entries(weeklyProgress.taskTypeProgress).forEach(([taskType, progress]) => {
      weeklyProgressSummary[taskType] = {
        completions: progress.completions,
        xpEarned: Math.round(progress.xpEarned),
        remainingCapacity: Math.round(progress.remainingCapacity)
      }
    })

    // Update submission with final XP and task types
    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        finalXp: cappedXp,
        taskTypes: multiTaskResult.qualifyingTasks.map(task => task.taskType),
        status: 'FINALIZED'
      }
    })

    // Update user's total and weekly XP
    await prisma.user.update({
      where: { id: submission.userId },
      data: {
        totalXp: { increment: cappedXp },
        currentWeekXp: { increment: cappedXp }
      }
    })

    // Update or create weekly stats
    const currentWeek = getWeekNumber(new Date())
    const existingStats = await prisma.weeklyStats.findFirst({
      where: {
        userId: submission.userId,
        weekNumber: currentWeek
      }
    })

    if (existingStats) {
      await prisma.weeklyStats.update({
        where: { id: existingStats.id },
        data: {
          xpTotal: { increment: cappedXp }
        }
      })
    } else {
      await prisma.weeklyStats.create({
        data: {
          userId: submission.userId,
          weekNumber: currentWeek,
          xpTotal: cappedXp,
          reviewsDone: 0,
          reviewsMissed: 0
        }
      })
    }

    return {
      finalXp: cappedXp,
      cappedXp,
      reasoning,
      weeklyTotals: Object.fromEntries(
        Object.entries(weeklyProgressSummary).map(([taskType, progress]) => [taskType, progress.xpEarned])
      ),
      multiTaskResult,
      weeklyProgress: weeklyProgressSummary
    }

  } catch (error) {
    console.error('Error in XP aggregation:', error)
    throw new Error('Failed to aggregate XP')
  }
}

export async function processReadySubmissions(): Promise<number> {
  try {
    // Find submissions that are ready for XP aggregation
    const readySubmissions = await prisma.submission.findMany({
      where: {
        status: 'UNDER_PEER_REVIEW',
        finalXp: null
      },
      include: {
        peerReviews: true
      }
    })

    let processedCount = 0

    for (const submission of readySubmissions) {
      if (submission.peerReviews.length >= 3) {
        try {
          await aggregateXP(submission.id)
          processedCount++
          console.log(`Processed XP aggregation for submission ${submission.id}`)
        } catch (error) {
          console.error(`Failed to process submission ${submission.id}:`, error)
        }
      }
    }

    return processedCount

  } catch (error) {
    console.error('Error processing ready submissions:', error)
    throw new Error('Failed to process submissions')
  }
}

