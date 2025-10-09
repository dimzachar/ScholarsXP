import { prisma } from '@/lib/prisma'
import type { AdminActionType, AdminAction } from '@prisma/client'

const NULL_TARGET_UUID = '00000000-0000-0000-0000-000000000000'

function isUuid(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(value)
}

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
    if (!isUuid(input.adminId)) {
      console.warn('[audit-log] Skipping admin action log: invalid adminId', input.adminId)
      return null
    }
    const safeTargetId = isUuid(input.targetId) ? input.targetId : NULL_TARGET_UUID
    const details = !isUuid(input.targetId)
      ? { ...(input.details ?? {}), targetIdRaw: input.targetId }
      : input.details ?? {}

    const record = await prisma.adminAction.create({
      data: {
        adminId: input.adminId,
        action: input.action,
        targetType: String(input.targetType).slice(0, 50),
        targetId: safeTargetId,
        details,
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

