/**
 * Merge Validator
 * 
 * Validates merge requests and ensures data integrity before and after
 * merge operations. Prevents invalid merges and detects potential issues.
 */

import { createServiceClient } from '@/lib/supabase-service'
import type { MergeRequest } from './MergeService'

export interface ValidationResult {
  valid: boolean
  error?: string
  warnings: string[]
  details?: {
    userExists: boolean
    hasLegacyAccount: boolean
    hasActiveMerge: boolean
    dataIntegrityIssues: string[]
  }
}

export interface PreMergeValidation {
  canProceed: boolean
  issues: string[]
  warnings: string[]
  userProfile?: any
  legacyProfile?: any
}

export interface PostMergeValidation {
  success: boolean
  issues: string[]
  xpConsistency: boolean
  transactionIntegrity: boolean
  weeklyStatsIntegrity: boolean
}

export class MergeValidator {
  private supabase = createServiceClient()

  /**
   * Validates a merge request before processing
   */
  async validateMergeRequest(request: MergeRequest): Promise<ValidationResult> {
    const warnings: string[] = []
    const issues: string[] = []

    try {
      // Basic parameter validation
      if (!request.realUserId || !request.discordHandle || !request.email) {
        return {
          valid: false,
          error: 'Missing required parameters: realUserId, discordHandle, and email are required',
          warnings
        }
      }

      // Validate UUID format
      if (!this.isValidUUID(request.realUserId)) {
        return {
          valid: false,
          error: 'Invalid realUserId format',
          warnings
        }
      }

      // Validate email format
      if (!this.isValidEmail(request.email)) {
        warnings.push('Email format appears invalid')
      }

      // Check if real user exists
      const userExists = await this.checkUserExists(request.realUserId)
      if (!userExists) {
        return {
          valid: false,
          error: 'Real user account not found',
          warnings
        }
      }

      // Check if user already has an active merge
      const hasActiveMerge = await this.checkActiveMerge(request.realUserId)
      if (hasActiveMerge) {
        return {
          valid: false,
          error: 'User already has an active merge in progress',
          warnings
        }
      }

      // Check for potential legacy account
      const hasLegacyAccount = await this.checkLegacyAccountExists(
        request.discordHandle,
        request.fallbackUsername
      )
      if (!hasLegacyAccount) {
        warnings.push('No legacy account found with provided Discord handle')
      }

      // Data integrity checks
      const dataIntegrityIssues = await this.checkDataIntegrity(request.realUserId)
      if (dataIntegrityIssues.length > 0) {
        warnings.push(...dataIntegrityIssues)
      }

      return {
        valid: true,
        warnings,
        details: {
          userExists: true,
          hasLegacyAccount,
          hasActiveMerge: false,
          dataIntegrityIssues
        }
      }

    } catch (error) {
      console.error('Error validating merge request:', error)
      return {
        valid: false,
        error: 'Validation error: ' + (error instanceof Error ? error.message : 'Unknown error'),
        warnings
      }
    }
  }

  /**
   * Performs comprehensive pre-merge validation
   */
  async validatePreMerge(realUserId: string, legacyUserId: string): Promise<PreMergeValidation> {
    const issues: string[] = []
    const warnings: string[] = []

    try {
      // Get user profiles
      const [realUser, legacyUser] = await Promise.all([
        this.getUserProfile(realUserId),
        this.getUserProfile(legacyUserId)
      ])

      if (!realUser) {
        issues.push('Real user profile not found')
      }

      if (!legacyUser) {
        issues.push('Legacy user profile not found')
      }

      if (!realUser || !legacyUser) {
        return {
          canProceed: false,
          issues,
          warnings
        }
      }

      // Validate legacy account
      if (!legacyUser.email.endsWith('@legacy.import')) {
        issues.push('Target user is not a legacy account')
      }

      // Check for same user merge attempt
      if (realUserId === legacyUserId) {
        issues.push('Cannot merge user with themselves')
      }

      // Check XP consistency
      const realUserXpConsistency = await this.validateXpConsistency(realUserId)
      if (!realUserXpConsistency) {
        warnings.push('Real user XP inconsistency detected')
      }

      const legacyUserXpConsistency = await this.validateXpConsistency(legacyUserId)
      if (!legacyUserXpConsistency) {
        warnings.push('Legacy user XP inconsistency detected')
      }

      // Check for duplicate transactions that might cause conflicts
      const duplicateRisk = await this.checkDuplicateTransactionRisk(realUserId, legacyUserId)
      if (duplicateRisk.length > 0) {
        warnings.push(...duplicateRisk)
      }

      // Check weekly stats conflicts
      const weeklyStatsConflicts = await this.checkWeeklyStatsConflicts(realUserId, legacyUserId)
      if (weeklyStatsConflicts > 0) {
        warnings.push(`${weeklyStatsConflicts} weekly stats conflicts will be resolved during merge`)
      }

      return {
        canProceed: issues.length === 0,
        issues,
        warnings,
        userProfile: realUser,
        legacyProfile: legacyUser
      }

    } catch (error) {
      console.error('Error in pre-merge validation:', error)
      return {
        canProceed: false,
        issues: ['Pre-merge validation failed: ' + (error instanceof Error ? error.message : 'Unknown error')],
        warnings
      }
    }
  }

  /**
   * Validates merge results after completion
   */
  async validatePostMerge(mergeId: string, realUserId: string): Promise<PostMergeValidation> {
    const issues: string[] = []

    try {
      // Check XP consistency after merge
      const xpConsistency = await this.validateXpConsistency(realUserId)
      if (!xpConsistency) {
        issues.push('XP inconsistency detected after merge')
      }

      // Validate transaction integrity
      const transactionIntegrity = await this.validateTransactionIntegrity(realUserId, mergeId)
      if (!transactionIntegrity) {
        issues.push('Transaction integrity issues detected')
      }

      // Validate weekly stats integrity
      const weeklyStatsIntegrity = await this.validateWeeklyStatsIntegrity(realUserId)
      if (!weeklyStatsIntegrity) {
        issues.push('Weekly stats integrity issues detected')
      }

      // Check that legacy account was properly deleted
      const legacyAccountDeleted = await this.checkLegacyAccountDeleted(mergeId)
      if (!legacyAccountDeleted) {
        issues.push('Legacy account was not properly deleted')
      }

      return {
        success: issues.length === 0,
        issues,
        xpConsistency,
        transactionIntegrity,
        weeklyStatsIntegrity
      }

    } catch (error) {
      console.error('Error in post-merge validation:', error)
      return {
        success: false,
        issues: ['Post-merge validation failed: ' + (error instanceof Error ? error.message : 'Unknown error')],
        xpConsistency: false,
        transactionIntegrity: false,
        weeklyStatsIntegrity: false
      }
    }
  }

  /**
   * Validates XP consistency (totalXp matches sum of transactions)
   */
  private async validateXpConsistency(userId: string): Promise<boolean> {
    try {
      const { data: user, error: userError } = await this.supabase
        .from('User')
        .select('totalXp')
        .eq('id', userId)
        .single()

      if (userError || !user) {
        return false
      }

      const { data: transactions, error: transactionError } = await this.supabase
        .from('XpTransaction')
        .select('amount')
        .eq('userId', userId)

      if (transactionError) {
        return false
      }

      const calculatedXp = transactions?.reduce((sum, t) => sum + t.amount, 0) || 0
      return Math.abs(user.totalXp - calculatedXp) < 1 // Allow for small rounding differences
    } catch (error) {
      console.error('Error validating XP consistency:', error)
      return false
    }
  }

  /**
   * Checks if user exists
   */
  private async checkUserExists(userId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('User')
        .select('id')
        .eq('id', userId)
        .single()

      return !error && !!data
    } catch (error) {
      return false
    }
  }

  /**
   * Checks if user has an active merge
   */
  private async checkActiveMerge(userId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('UserMergeHistory')
        .select('id')
        .eq('realUserId', userId)
        .in('status', ['PENDING', 'IN_PROGRESS'])
        .limit(1)

      return !error && data && data.length > 0
    } catch (error) {
      return false
    }
  }

  /**
   * Checks if legacy account exists for Discord handle
   */
  private async checkLegacyAccountExists(discordHandle: string, fallbackUsername?: string): Promise<boolean> {
    try {
      const emailLocalParts = new Set<string>()

      const addHandle = (value?: string | null) => {
        if (!value) return
        const trimmed = value.trim()
        if (!trimmed) return

        const normalized = trimmed.replace(/^@/, '').toLowerCase()
        const base = normalized.split('#')[0]

        if (base) {
          emailLocalParts.add(base)
        }
      }

      addHandle(discordHandle)
      addHandle(fallbackUsername)

      if (emailLocalParts.size === 0) {
        return false
      }

      const candidateEmails = Array.from(emailLocalParts).map(localPart => `${localPart}@legacy.import`)

      const { data, error } = await this.supabase
        .from('User')
        .select('id')
        .in('email', candidateEmails)
        .limit(1)

      return !error && !!data && data.length > 0
    } catch (error) {
      return false
    }
  }

  /**
   * Checks data integrity issues
   */
  private async checkDataIntegrity(userId: string): Promise<string[]> {
    const issues: string[] = []

    try {
      // Check for negative XP
      const { data: user } = await this.supabase
        .from('User')
        .select('totalXp, currentWeekXp')
        .eq('id', userId)
        .single()

      if (user) {
        if (user.totalXp < 0) {
          issues.push('User has negative total XP')
        }
        if (user.currentWeekXp < 0) {
          issues.push('User has negative current week XP')
        }
      }

      // Check for orphaned transactions
      const { data: orphanedTransactions } = await this.supabase
        .from('XpTransaction')
        .select('id')
        .eq('userId', userId)
        .is('sourceId', null)
        .neq('type', 'ADMIN_ADJUSTMENT')

      if (orphanedTransactions && orphanedTransactions.length > 0) {
        issues.push(`${orphanedTransactions.length} transactions without source reference`)
      }

    } catch (error) {
      issues.push('Error checking data integrity')
    }

    return issues
  }

  /**
   * Gets user profile
   */
  private async getUserProfile(userId: string) {
    try {
      const { data, error } = await this.supabase
        .from('User')
        .select('*')
        .eq('id', userId)
        .single()

      return error ? null : data
    } catch (error) {
      return null
    }
  }

  /**
   * Checks for duplicate transaction risks
   */
  private async checkDuplicateTransactionRisk(realUserId: string, legacyUserId: string): Promise<string[]> {
    const risks: string[] = []

    try {
      // Check for existing legacy transfer transactions
      const { data: existingTransfers } = await this.supabase
        .from('XpTransaction')
        .select('id')
        .eq('userId', realUserId)
        .eq('sourceType', 'LEGACY_TRANSFER')

      if (existingTransfers && existingTransfers.length > 0) {
        risks.push('User already has legacy transfer transactions')
      }

    } catch (error) {
      risks.push('Error checking duplicate transaction risk')
    }

    return risks
  }

  /**
   * Checks weekly stats conflicts
   */
  private async checkWeeklyStatsConflicts(realUserId: string, legacyUserId: string): Promise<number> {
    try {
      const { data: conflicts } = await this.supabase
        .from('WeeklyStats')
        .select('weekNumber')
        .eq('userId', realUserId)
        .in('weekNumber', 
          this.supabase
            .from('WeeklyStats')
            .select('weekNumber')
            .eq('userId', legacyUserId)
        )

      return conflicts?.length || 0
    } catch (error) {
      return 0
    }
  }

  /**
   * Validates transaction integrity after merge
   */
  private async validateTransactionIntegrity(userId: string, mergeId: string): Promise<boolean> {
    try {
      // Check that all transferred transactions have proper mergeId
      const { data: transferredTransactions } = await this.supabase
        .from('XpTransaction')
        .select('id')
        .eq('userId', userId)
        .eq('sourceType', 'LEGACY_TRANSFER')
        .neq('mergeId', mergeId)

      return !transferredTransactions || transferredTransactions.length === 0
    } catch (error) {
      return false
    }
  }

  /**
   * Validates weekly stats integrity
   */
  private async validateWeeklyStatsIntegrity(userId: string): Promise<boolean> {
    try {
      // Check for duplicate week numbers
      const { data: weeklyStats } = await this.supabase
        .from('WeeklyStats')
        .select('weekNumber')
        .eq('userId', userId)

      if (!weeklyStats) return true

      const weekNumbers = weeklyStats.map(w => w.weekNumber)
      const uniqueWeeks = new Set(weekNumbers)
      
      return weekNumbers.length === uniqueWeeks.size
    } catch (error) {
      return false
    }
  }

  /**
   * Checks if legacy account was deleted
   */
  private async checkLegacyAccountDeleted(mergeId: string): Promise<boolean> {
    try {
      const { data: mergeHistory } = await this.supabase
        .from('UserMergeHistory')
        .select('legacyUserId')
        .eq('id', mergeId)
        .single()

      if (!mergeHistory?.legacyUserId) return true

      const { data: legacyUser } = await this.supabase
        .from('User')
        .select('id')
        .eq('id', mergeHistory.legacyUserId)
        .single()

      return !legacyUser // Should be null if deleted
    } catch (error) {
      return false
    }
  }

  /**
   * Utility functions
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return uuidRegex.test(uuid)
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }
}
