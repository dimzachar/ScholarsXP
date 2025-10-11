/**
 * Legacy Account Merge Service
 * 
 * Production-ready service for atomic legacy account merging with comprehensive
 * error handling, rollback capabilities, and data integrity validation.
 * 
 * This replaces the flawed merge logic in AuthContext.tsx with a robust,
 * transaction-based system that ensures data consistency.
 */

import { createServiceClient } from '@/lib/supabase-service'
import { LegacyMatcher } from './LegacyMatcher'
import { MergeValidator } from './MergeValidator'
import { MergeMonitor } from './MergeMonitor'

export interface MergeRequest {
  realUserId: string
  discordHandle: string
  discordId?: string
  email: string
  fallbackUsername?: string
  initiatedBy?: 'SYSTEM' | 'ADMIN' | 'USER'
}

export interface MergeResult {
  success: boolean
  mergeId?: string
  status: 'COMPLETED' | 'FAILED' | 'ALREADY_COMPLETED' | 'NO_LEGACY_ACCOUNT'
  message: string
  details?: {
    transactionsTransferred?: number
    totalXpTransferred?: number
    weeklyStatsTransferred?: number
    weeklyStatsConflicts?: number
    processingTimeMs?: number
    legacySubmissionsRekeyed?: number
  }
  error?: {
    code: string
    message: string
    details?: any
  }
}

export interface MergeStatus {
  mergeId?: string
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK' | 'CANCELLED'
  startedAt?: string
  completedAt?: string
  errorMessage?: string
  progress?: {
    transactionsTransferred: number
    xpTransferred: number
    weeklyStatsTransferred: number
  }
}

export class MergeService {
  private supabase = createServiceClient()
  private legacyMatcher = new LegacyMatcher()
  private validator = new MergeValidator()
  private monitor = new MergeMonitor()

  /**
   * Initiates a legacy account merge for a user
   * This is the main entry point called from AuthContext
   */
  async initiateMerge(request: MergeRequest): Promise<MergeResult> {
    const startTime = Date.now()
    
    try {
      // Validate request
      const validationResult = await this.validator.validateMergeRequest(request)
      if (!validationResult.valid) {
        return {
          success: false,
          status: 'FAILED',
          message: validationResult.error || 'Invalid merge request',
          error: {
            code: 'VALIDATION_FAILED',
            message: validationResult.error || 'Request validation failed'
          }
        }
      }

      // Check if user already has an active merge
      const existingMerge = await this.getMergeStatus(request.realUserId)
      if (existingMerge.status === 'IN_PROGRESS' || existingMerge.status === 'PENDING') {
        return {
          success: false,
          status: 'FAILED',
          message: 'Merge already in progress for this user',
          error: {
            code: 'MERGE_IN_PROGRESS',
            message: 'Another merge is already active for this user'
          }
        }
      }

      // Find legacy account
      const legacyAccount = await this.legacyMatcher.findLegacyAccount({
        discordId: request.discordId,
        discordHandle: request.discordHandle,
        email: request.email,
        fallbackUsername: request.fallbackUsername
      })

      if (!legacyAccount) {
        return {
          success: true,
          status: 'NO_LEGACY_ACCOUNT',
          message: 'No legacy account found for this user'
        }
      }

      // Execute atomic merge
      const mergeResult = await this.executeAtomicMerge(
        request.realUserId,
        legacyAccount.id,
        request.discordHandle,
        request.initiatedBy || 'SYSTEM'
      )

      const processingTime = Date.now() - startTime

      // Monitor merge completion
      await this.monitor.recordMergeCompletion(mergeResult, processingTime)

      return mergeResult

    } catch (error) {
      const processingTime = Date.now() - startTime
      
      // Monitor merge failure
      await this.monitor.recordMergeFailure(error, processingTime)

      console.error('Merge service error:', error)
      
      return {
        success: false,
        status: 'FAILED',
        message: 'Internal error during merge process',
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error
        }
      }
    }
  }

  /**
   * Gets the current merge status for a user
   */
  async getMergeStatus(userId: string): Promise<MergeStatus> {
    try {
      const { data, error } = await this.supabase.rpc('get_merge_status', {
        p_user_id: userId
      })

      if (error) {
        console.error('Error getting merge status:', error)
        return { status: 'FAILED' }
      }

      if (!data || data.length === 0) {
        return { status: 'COMPLETED' } // No merge history means no merge needed
      }

      const merge = data[0]
      return {
        mergeId: merge.merge_id,
        status: merge.status,
        startedAt: merge.started_at,
        completedAt: merge.completed_at,
        errorMessage: merge.error_message,
        progress: {
          transactionsTransferred: merge.transactions_transferred || 0,
          xpTransferred: merge.xp_transferred || 0,
          weeklyStatsTransferred: 0 // TODO: Add to database function
        }
      }
    } catch (error) {
      console.error('Error getting merge status:', error)
      return { status: 'FAILED' }
    }
  }

  /**
   * Retries a failed merge
   */
  async retryFailedMerge(mergeId: string): Promise<MergeResult> {
    try {
      // Get merge details
      const { data: mergeHistory, error } = await this.supabase
        .from('UserMergeHistory')
        .select('*')
        .eq('id', mergeId)
        .single()

      if (error || !mergeHistory) {
        return {
          success: false,
          status: 'FAILED',
          message: 'Merge record not found',
          error: {
            code: 'MERGE_NOT_FOUND',
            message: 'Cannot find merge record to retry'
          }
        }
      }

      if (mergeHistory.status !== 'FAILED') {
        return {
          success: false,
          status: 'FAILED',
          message: 'Only failed merges can be retried',
          error: {
            code: 'INVALID_STATUS',
            message: `Merge status is ${mergeHistory.status}, not FAILED`
          }
        }
      }

      // Retry the merge
      return await this.initiateMerge({
        realUserId: mergeHistory.realUserId,
        discordHandle: mergeHistory.legacyDiscordHandle,
        email: mergeHistory.legacyEmail,
        initiatedBy: 'ADMIN' // Retries are admin-initiated
      })

    } catch (error) {
      console.error('Error retrying merge:', error)
      return {
        success: false,
        status: 'FAILED',
        message: 'Error during merge retry',
        error: {
          code: 'RETRY_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  /**
   * Executes the atomic merge using database functions
   */
  private async executeAtomicMerge(
    realUserId: string,
    legacyUserId: string,
    discordHandle: string,
    initiatedBy: string
  ): Promise<MergeResult> {
    try {
      const { data, error } = await this.supabase.rpc('atomic_merge_legacy_account', {
        p_real_user_id: realUserId,
        p_legacy_user_id: legacyUserId,
        p_discord_handle: discordHandle,
        p_initiated_by: initiatedBy
      })

      if (error) {
        console.error('Database merge function error:', error)
        return {
          success: false,
          status: 'FAILED',
          message: 'Database merge operation failed',
          error: {
            code: 'DATABASE_ERROR',
            message: error.message,
            details: error
          }
        }
      }

      // Handle different result statuses
      if (data.status === 'already_completed') {
        return {
          success: true,
          status: 'ALREADY_COMPLETED',
          message: 'Merge was already completed for this user pair'
        }
      }

      if (data.status === 'success') {
        return {
          success: true,
          status: 'COMPLETED',
          message: 'Legacy account merge completed successfully',
          mergeId: data.mergeId,
          details: {
            transactionsTransferred: parseInt(data.transactionsTransferred) || 0,
            totalXpTransferred: parseInt(data.totalXpTransferred) || 0,
            weeklyStatsTransferred: parseInt(data.weeklyStatsTransferred) || 0,
            weeklyStatsConflicts: parseInt(data.weeklyStatsConflicts) || 0,
            processingTimeMs: parseInt(data.processingTimeMs) || 0,
            legacySubmissionsRekeyed: parseInt(data.legacySubmissionsRekeyed) || 0
          }
        }
      }

      // Unexpected status
      return {
        success: false,
        status: 'FAILED',
        message: `Unexpected merge result status: ${data.status}`,
        error: {
          code: 'UNEXPECTED_STATUS',
          message: 'Database function returned unexpected status',
          details: data
        }
      }

    } catch (error) {
      console.error('Atomic merge execution error:', error)
      return {
        success: false,
        status: 'FAILED',
        message: 'Error executing atomic merge',
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error
        }
      }
    }
  }

  /**
   * Gets merge statistics for monitoring
   */
  async getMergeStatistics(timeframe: 'day' | 'week' | 'month' = 'day') {
    try {
      const interval = timeframe === 'day' ? '1 day' : 
                     timeframe === 'week' ? '7 days' : '30 days'

      const { data, error } = await this.supabase
        .from('UserMergeHistory')
        .select('status, processingTimeMs, transactionsTransferred, xpTransferred')
        .gte('startedAt', new Date(Date.now() - (timeframe === 'day' ? 86400000 : 
                                                timeframe === 'week' ? 604800000 : 2592000000)).toISOString())

      if (error) {
        console.error('Error getting merge statistics:', error)
        return null
      }

      const stats = {
        total: data.length,
        completed: data.filter(m => m.status === 'COMPLETED').length,
        failed: data.filter(m => m.status === 'FAILED').length,
        inProgress: data.filter(m => m.status === 'IN_PROGRESS').length,
        averageProcessingTime: data
          .filter(m => m.processingTimeMs)
          .reduce((sum, m) => sum + m.processingTimeMs, 0) / 
          data.filter(m => m.processingTimeMs).length || 0,
        totalTransactionsTransferred: data
          .reduce((sum, m) => sum + (m.transactionsTransferred || 0), 0),
        totalXpTransferred: data
          .reduce((sum, m) => sum + (m.xpTransferred || 0), 0)
      }

      return stats
    } catch (error) {
      console.error('Error calculating merge statistics:', error)
      return null
    }
  }
}
