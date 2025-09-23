import { prisma } from '@/lib/prisma'
import type { AdminActionType, AdminAction } from '@prisma/client'

export type AuditTargetType = 'user' | 'submission' | 'peer_review' | 'review_assignment' | 'content_flag' | 'system' | string

export interface LogAdminActionInput {
  adminId: string
  action: AdminActionType
  targetType: AuditTargetType
  targetId: string
  details?: Record<string, any>
}

/**
 * Writes an admin action to the AdminAction table. Best-effort: errors are logged and swallowed.
 */
export async function logAdminAction(input: LogAdminActionInput): Promise<AdminAction | null> {
  try {
    const record = await prisma.adminAction.create({
      data: {
        adminId: input.adminId,
        action: input.action,
        targetType: String(input.targetType).slice(0, 50),
        targetId: input.targetId,
        details: input.details ?? {},
      },
    })
    return record
  } catch (err) {
    // Do not throw from logging
    console.error('[audit-log] Failed to write AdminAction', err)
    return null
  }
}

/**
 * Normalized audit/event log row used by the admin logs API and UI
 */
export interface NormalizedLogRow {
  id: string
  eventType: 'admin_action' | 'submission' | 'peer_review' | 'xp_transaction'
  action: string
  actor?: {
    id: string
    name?: string | null
    role?: string | null
  }
  target?: {
    type: AuditTargetType
    id: string
    label?: string | null
  }
  summary?: string
  details?: any
  createdAt: string
  severity?: 'info' | 'warning' | 'critical'
}

