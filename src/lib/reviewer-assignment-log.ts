import { prisma } from '@/lib/prisma'
import type { AutomationLog, AdminActionType } from '@prisma/client'
import type { NormalizedLogRow } from '@/lib/audit-log'

type ReviewerRef = {
  id: string
  username?: string | null
  email?: string | null
}

export interface ReviewerAssignmentAutomationPayload {
  action: Extract<
    AdminActionType,
    'REVIEW_AUTO_ASSIGN' | 'REVIEW_DEADLINE_REASSIGN' | 'REVIEW_MANUAL_RESHUFFLE' | 'REVIEW_BULK_RESHUFFLE'
  >
  submissionId: string
  source: string
  triggeredBy: string
  triggeredAt: string
  assignedReviewers?: ReviewerRef[]
  oldReviewer?: ReviewerRef | null
  newReviewer?: ReviewerRef | null
  reason?: string
  reviewerCount?: number
  reshuffledCount?: number
  totalProcessed?: number
  warnings?: string[]
  errors?: string[]
  assignmentResults?: Array<{
    assignmentId?: string
    success: boolean
    error?: string | null
    details?: {
      oldReviewerId?: string
      oldReviewerName?: string
      newReviewerId?: string
      newReviewerName?: string
    } | null
  }>
}

function getJobName(action: ReviewerAssignmentAutomationPayload['action']): string {
  switch (action) {
    case 'REVIEW_AUTO_ASSIGN':
      return 'review-auto-assign'
    case 'REVIEW_DEADLINE_REASSIGN':
      return 'review-deadline-reassign'
    case 'REVIEW_MANUAL_RESHUFFLE':
      return 'review-manual-reshuffle'
    case 'REVIEW_BULK_RESHUFFLE':
      return 'review-bulk-reshuffle'
  }
}

function getJobType(action: ReviewerAssignmentAutomationPayload['action']): string {
  switch (action) {
    case 'REVIEW_AUTO_ASSIGN':
      return 'review_assignment'
    case 'REVIEW_DEADLINE_REASSIGN':
      return 'review_reassignment'
    case 'REVIEW_MANUAL_RESHUFFLE':
    case 'REVIEW_BULK_RESHUFFLE':
      return 'review_reshuffle'
  }
}

function formatReviewerName(reviewer?: ReviewerRef | null): string | null {
  if (!reviewer) {
    return null
  }

  return reviewer.username || reviewer.email || reviewer.id
}

function formatReviewerList(reviewers?: ReviewerRef[]): string {
  if (!reviewers || reviewers.length === 0) {
    return ''
  }

  return reviewers
    .map(reviewer => formatReviewerName(reviewer))
    .filter((value): value is string => Boolean(value))
    .join(', ')
}

function summarizeAssignmentResults(payload: ReviewerAssignmentAutomationPayload): string | null {
  const successfulResults = (payload.assignmentResults || []).filter(result => result.success)

  if (successfulResults.length === 0) {
    return null
  }

  const pairs = successfulResults
    .map(result => {
      const oldName = result.details?.oldReviewerName || result.details?.oldReviewerId
      const newName = result.details?.newReviewerName || result.details?.newReviewerId

      if (!oldName && !newName) {
        return null
      }

      if (!oldName) {
        return `${newName}`
      }

      if (!newName) {
        return `${oldName}`
      }

      return `${oldName} -> ${newName}`
    })
    .filter((value): value is string => Boolean(value))

  if (pairs.length === 0) {
    return null
  }

  return pairs.slice(0, 3).join(', ')
}

export async function logReviewerAssignmentAutomation(
  payload: ReviewerAssignmentAutomationPayload
): Promise<AutomationLog | null> {
  try {
    return await prisma.automationLog.create({
      data: {
        jobName: getJobName(payload.action),
        jobType: getJobType(payload.action),
        triggeredBy: payload.triggeredBy,
        startedAt: new Date(payload.triggeredAt),
        completedAt: new Date(payload.triggeredAt),
        status: payload.errors?.length ? 'FAILED' : 'SUCCESS',
        result: JSON.stringify(payload),
      }
    })
  } catch (error) {
    console.error('[reviewer-assignment-log] Failed to write AutomationLog', error)
    return null
  }
}

export function parseReviewerAssignmentAutomationPayload(result: string | null | undefined): ReviewerAssignmentAutomationPayload | null {
  if (!result) {
    return null
  }

  try {
    const parsed = JSON.parse(result) as ReviewerAssignmentAutomationPayload
    return parsed?.action ? parsed : null
  } catch (error) {
    console.warn('[reviewer-assignment-log] Failed to parse AutomationLog result', error)
    return null
  }
}

export function buildReviewerAssignmentSummary(payload: ReviewerAssignmentAutomationPayload): string {
  switch (payload.action) {
    case 'REVIEW_AUTO_ASSIGN': {
      const reviewerList = formatReviewerList(payload.assignedReviewers)
      if (reviewerList) {
        return `Auto-assigned: ${reviewerList}`
      }
      return `Auto-assigned ${payload.reviewerCount || payload.assignedReviewers?.length || 0} reviewer(s)`
    }
    case 'REVIEW_DEADLINE_REASSIGN': {
      const oldName = formatReviewerName(payload.oldReviewer)
      const newName = formatReviewerName(payload.newReviewer)
      if (oldName && newName) {
        return `Auto-reassigned ${oldName} -> ${newName}`
      }
      return `Deadline reassignment${payload.reason ? `: ${payload.reason}` : ''}`
    }
    case 'REVIEW_MANUAL_RESHUFFLE': {
      const summary = summarizeAssignmentResults(payload)
      if (summary) {
        return `Manual reshuffle: ${summary}`
      }
      return `Manual reshuffle: ${payload.reshuffledCount || 0} assignment(s) reshuffled`
    }
    case 'REVIEW_BULK_RESHUFFLE': {
      const summary = summarizeAssignmentResults(payload)
      if (summary) {
        return `Bulk reshuffle: ${summary}`
      }
      return `Bulk reshuffle: ${payload.reshuffledCount || 0} assignment(s) reshuffled`
    }
  }
}

export function normalizeReviewerAssignmentAutomationLog(
  row: Pick<AutomationLog, 'id' | 'triggeredBy' | 'startedAt' | 'result'>,
  actorLookup: Map<string, { username: string | null; role: string | null }>
): NormalizedLogRow | null {
  const payload = parseReviewerAssignmentAutomationPayload(row.result)

  if (!payload) {
    return null
  }

  let actor: NormalizedLogRow['actor']
  if (row.triggeredBy.startsWith('admin:')) {
    const adminId = row.triggeredBy.slice('admin:'.length)
    const admin = actorLookup.get(adminId)
    actor = {
      id: adminId,
      name: admin?.username,
      role: admin?.role || 'ADMIN'
    }
  } else {
    actor = {
      id: row.triggeredBy,
      name: 'System',
      role: 'SYSTEM'
    }
  }

  return {
    id: `automation:${row.id}`,
    eventType: 'admin_action',
    action: payload.action,
    actor,
    target: {
      type: 'submission',
      id: payload.submissionId
    },
    details: payload,
    createdAt: row.startedAt.toISOString(),
    summary: buildReviewerAssignmentSummary(payload)
  }
}
