import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase'
import { createServiceClient } from '@/lib/supabase-server'

export type ReshuffleFailureReason =
  | 'not_found'
  | 'already_processed'
  | 'no_replacement_available'
  | 'error'

export interface ReviewAssignmentPayload {
  id: string
  submissionId: string
  reviewerId: string
  assignedAt: string
  deadline: string
  status: string
  completedAt: string | null
  releasedAt: string | null
  releaseReason: string | null
  createdAt: string
  updatedAt: string
}

export interface ReshuffleRpcPayload {
  success: boolean
  dryRun?: boolean
  releasedAssignment?: ReviewAssignmentPayload | null
  newAssignment?: ReviewAssignmentPayload | null
  candidateReviewerId?: string | null
  reason?: ReshuffleFailureReason
  message?: string
}

export interface ReshuffleRequestOptions {
  reason?: string
  dryRun?: boolean
  client?: SupabaseClient<Database>
}

export interface ReshuffleResult {
  success: boolean
  dryRun: boolean
  releasedAssignment?: ReviewAssignmentPayload | null
  newAssignment?: ReviewAssignmentPayload | null
  candidateReviewerId?: string | null
  reason?: ReshuffleFailureReason
  message?: string
}

export async function manualReshuffleAssignment(
  assignmentId: string,
  options: ReshuffleRequestOptions = {}
): Promise<ReshuffleResult> {
  const {
    reason = 'manual:admin',
    dryRun = false,
    client
  } = options

  const supabase = client ?? createServiceClient()

  const { data, error } = await supabase.rpc('reshuffle_single_assignment', {
    p_assignment_id: assignmentId,
    p_reason: reason,
    p_dry_run: dryRun
  })

  if (error) {
    throw new Error(error.message)
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Unexpected empty response from reshuffle RPC')
  }

  const payload = data as ReshuffleRpcPayload

  return {
    success: payload.success === true,
    dryRun: payload.dryRun === true,
    releasedAssignment: payload.releasedAssignment ?? undefined,
    newAssignment: payload.newAssignment ?? undefined,
    candidateReviewerId: payload.candidateReviewerId ?? undefined,
    reason: payload.success ? undefined : payload.reason,
    message: payload.success ? undefined : payload.message
  }
}

export function needsManualFollowUp(result: ReshuffleResult): boolean {
  return result.success === false && result.reason === 'no_replacement_available'
}
