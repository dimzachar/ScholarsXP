/**
 * Legacy Account Matcher
 * 
 * Implements deterministic matching algorithm to find legacy accounts
 * associated with real Discord users. Uses multiple fallback strategies
 * with priority ordering to ensure accurate matching.
 */

import { createServiceClient } from '@/lib/supabase-service'

export interface LegacyMatchCriteria {
  discordId?: string
  discordHandle: string
  email: string
  fallbackUsername?: string
}

export interface LegacyAccount {
  id: string
  email: string
  username: string | null
  discordHandle: string | null
  totalXp: number
  createdAt: string
  transactionCount?: number
  weeklyStatsCount?: number
}

export interface MatchResult {
  account: LegacyAccount | null
  matchMethod: 'DISCORD_ID' | 'EXACT_HANDLE' | 'BASE_HANDLE' | 'USERNAME_FALLBACK' | 'NONE'
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  warnings: string[]
}

export class LegacyMatcher {
  private supabase = createServiceClient()

  /**
   * Finds legacy account using deterministic matching algorithm
   * Priority order ensures most reliable matches are found first
   */
  async findLegacyAccount(criteria: LegacyMatchCriteria): Promise<LegacyAccount | null> {
    const matchResult = await this.findLegacyAccountWithDetails(criteria)
    return matchResult.account
  }

  /**
   * Finds legacy account with detailed match information
   * Useful for admin tools and debugging
   */
  async findLegacyAccountWithDetails(criteria: LegacyMatchCriteria): Promise<MatchResult> {
    const warnings: string[] = []

    try {
      // Priority 1: Discord ID match (most reliable)
      if (criteria.discordId) {
        const discordIdMatch = await this.findByDiscordId(criteria.discordId)
        if (discordIdMatch) {
          return {
            account: discordIdMatch,
            matchMethod: 'DISCORD_ID',
            confidence: 'HIGH',
            warnings
          }
        }
        warnings.push('No legacy account found with Discord ID')
      }

      // Priority 2: Exact Discord handle with @legacy.import email
      const exactMatch = await this.findByExactHandle(criteria.discordHandle)
      if (exactMatch) {
        return {
          account: exactMatch,
          matchMethod: 'EXACT_HANDLE',
          confidence: 'HIGH',
          warnings
        }
      }
      warnings.push('No legacy account found with exact Discord handle')

      // Priority 3: Base handle (without discriminator)
      const baseHandle = this.extractBaseHandle(criteria.discordHandle)
      if (baseHandle !== criteria.discordHandle) {
        const baseMatch = await this.findByBaseHandle(baseHandle)
        if (baseMatch) {
          warnings.push('Matched using base handle without discriminator')
          return {
            account: baseMatch,
            matchMethod: 'BASE_HANDLE',
            confidence: 'MEDIUM',
            warnings
          }
        }
        warnings.push('No legacy account found with base Discord handle')
      }

      // Priority 4: Username fallback (least reliable)
      if (criteria.fallbackUsername) {
        const usernameMatch = await this.findByUsername(criteria.fallbackUsername)
        if (usernameMatch) {
          warnings.push('Matched using username fallback - lower confidence')
          return {
            account: usernameMatch,
            matchMethod: 'USERNAME_FALLBACK',
            confidence: 'LOW',
            warnings
          }
        }
        warnings.push('No legacy account found with username fallback')
      }

      return {
        account: null,
        matchMethod: 'NONE',
        confidence: 'LOW',
        warnings
      }

    } catch (error) {
      console.error('Error in legacy account matching:', error)
      warnings.push(`Matching error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      
      return {
        account: null,
        matchMethod: 'NONE',
        confidence: 'LOW',
        warnings
      }
    }
  }

  /**
   * Finds legacy account by Discord ID (most reliable)
   */
  private async findByDiscordId(discordId: string): Promise<LegacyAccount | null> {
    try {
      const { data, error } = await this.supabase
        .from('User')
        .select(`
          id, email, username, discordHandle, totalXp, createdAt,
          xpTransactions:XpTransaction(count),
          weeklyStats:WeeklyStats(count)
        `)
        .eq('discordId', discordId)
        .ilike('email', '%@legacy.import')
        .maybeSingle()

      if (error) {
        console.error('Error finding by Discord ID:', error)
        return null
      }

      return data ? this.formatLegacyAccount(data) : null
    } catch (error) {
      console.error('Error in findByDiscordId:', error)
      return null
    }
  }

  /**
   * Finds legacy account by exact Discord handle
   */
  private async findByExactHandle(discordHandle: string): Promise<LegacyAccount | null> {
    try {
      const { data, error } = await this.supabase
        .from('User')
        .select(`
          id, email, username, discordHandle, totalXp, createdAt,
          xpTransactions:XpTransaction(count),
          weeklyStats:WeeklyStats(count)
        `)
        .eq('discordHandle', discordHandle)
        .eq('email', `${discordHandle}@legacy.import`)
        .maybeSingle()

      if (error) {
        console.error('Error finding by exact handle:', error)
        return null
      }

      return data ? this.formatLegacyAccount(data) : null
    } catch (error) {
      console.error('Error in findByExactHandle:', error)
      return null
    }
  }

  /**
   * Finds legacy account by base handle (without discriminator)
   */
  private async findByBaseHandle(baseHandle: string): Promise<LegacyAccount | null> {
    try {
      const { data, error } = await this.supabase
        .from('User')
        .select(`
          id, email, username, discordHandle, totalXp, createdAt,
          xpTransactions:XpTransaction(count),
          weeklyStats:WeeklyStats(count)
        `)
        .eq('discordHandle', baseHandle)
        .eq('email', `${baseHandle}@legacy.import`)
        .maybeSingle()

      if (error) {
        console.error('Error finding by base handle:', error)
        return null
      }

      return data ? this.formatLegacyAccount(data) : null
    } catch (error) {
      console.error('Error in findByBaseHandle:', error)
      return null
    }
  }

  /**
   * Finds legacy account by username (fallback method)
   */
  private async findByUsername(username: string): Promise<LegacyAccount | null> {
    try {
      const { data, error } = await this.supabase
        .from('User')
        .select(`
          id, email, username, discordHandle, totalXp, createdAt,
          xpTransactions:XpTransaction(count),
          weeklyStats:WeeklyStats(count)
        `)
        .eq('username', username)
        .ilike('email', '%@legacy.import')
        .maybeSingle()

      if (error) {
        console.error('Error finding by username:', error)
        return null
      }

      return data ? this.formatLegacyAccount(data) : null
    } catch (error) {
      console.error('Error in findByUsername:', error)
      return null
    }
  }

  /**
   * Extracts base handle from Discord handle (removes discriminator)
   */
  private extractBaseHandle(discordHandle: string): string {
    return discordHandle.split('#')[0]
  }

  /**
   * Formats database result into LegacyAccount interface
   */
  private formatLegacyAccount(data: any): LegacyAccount {
    return {
      id: data.id,
      email: data.email,
      username: data.username,
      discordHandle: data.discordHandle,
      totalXp: data.totalXp || 0,
      createdAt: data.createdAt,
      transactionCount: data.xpTransactions?.[0]?.count || 0,
      weeklyStatsCount: data.weeklyStats?.[0]?.count || 0
    }
  }

  /**
   * Validates that an account is actually a legacy account
   */
  async validateLegacyAccount(accountId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('User')
        .select('email')
        .eq('id', accountId)
        .single()

      if (error || !data) {
        return false
      }

      return data.email.endsWith('@legacy.import')
    } catch (error) {
      console.error('Error validating legacy account:', error)
      return false
    }
  }

  /**
   * Gets all potential legacy accounts for a Discord handle
   * Useful for admin tools to resolve conflicts
   */
  async getAllPotentialMatches(criteria: LegacyMatchCriteria): Promise<LegacyAccount[]> {
    const matches: LegacyAccount[] = []

    try {
      // Try all matching strategies
      const strategies = [
        () => criteria.discordId ? this.findByDiscordId(criteria.discordId) : null,
        () => this.findByExactHandle(criteria.discordHandle),
        () => this.findByBaseHandle(this.extractBaseHandle(criteria.discordHandle)),
        () => criteria.fallbackUsername ? this.findByUsername(criteria.fallbackUsername) : null
      ]

      for (const strategy of strategies) {
        const result = await strategy()
        if (result && !matches.find(m => m.id === result.id)) {
          matches.push(result)
        }
      }

      return matches
    } catch (error) {
      console.error('Error getting all potential matches:', error)
      return []
    }
  }

  /**
   * Gets statistics about legacy accounts
   */
  async getLegacyAccountStats() {
    try {
      const { data, error } = await this.supabase
        .from('User')
        .select('id, totalXp, createdAt')
        .ilike('email', '%@legacy.import')

      if (error) {
        console.error('Error getting legacy account stats:', error)
        return null
      }

      const totalAccounts = data.length
      const totalXp = data.reduce((sum, account) => sum + (account.totalXp || 0), 0)
      const averageXp = totalAccounts > 0 ? totalXp / totalAccounts : 0

      return {
        totalAccounts,
        totalXp,
        averageXp,
        oldestAccount: data.reduce((oldest, account) => 
          !oldest || new Date(account.createdAt) < new Date(oldest.createdAt) ? account : oldest, null
        )?.createdAt,
        newestAccount: data.reduce((newest, account) => 
          !newest || new Date(account.createdAt) > new Date(newest.createdAt) ? account : newest, null
        )?.createdAt
      }
    } catch (error) {
      console.error('Error calculating legacy account stats:', error)
      return null
    }
  }
}
