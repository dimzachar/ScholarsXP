import { supabaseClient } from '@/lib/supabase'
import { createServiceClient } from '@/lib/supabase-server'
import { prisma } from '@/lib/prisma'
import { getWeekBoundaries } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

export type MonthlyStanding = {
  userId: string
  total: number
  user?: { id: string; username: string | null; email?: string; profileImageUrl?: string | null; totalXp?: number }
}

export type MonthlyWinner = {
  id: string
  userId: string
  month: string
  awardedAt: string
  rank: number
  xpAwarded: number
}

export interface LeaderboardEntry {
  rank: number
  userId: string
  username: string
  totalXp: number
  weeklyXp: number
  streak: number
  submissions: number
  reviews: number
}

export interface LeaderboardStats {
  activeParticipants: number
  totalXpAwarded: number
  averageXp: number
}

export interface PaginationMeta {
  page: number
  limit: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

// ============================================================================
// Monthly Leaderboard Functions
// ============================================================================

export async function listMonthsWithData(limit = 12): Promise<string[]> {
  const { data, error } = await supabaseClient.rpc('list_months_with_xp', { p_limit: limit })
  if (error) {
    console.error('listMonthsWithData error:', error)
    return []
  }
  return (data || []).map((row: any) => row.month)
}

export function getCurrentMonthUTC(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = (now.getUTCMonth() + 1).toString().padStart(2, '0')
  return `${y}-${m}`
}

export async function getMonthlyLeaderboard(month: string, limit = 20, offset = 0): Promise<MonthlyStanding[]> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Invalid month format, expected YYYY-MM')

  const startDate = new Date(`${month}-01T00:00:00Z`)
  const endDate = new Date(startDate)
  endDate.setUTCMonth(endDate.getUTCMonth() + 1)

  try {
    // Single optimized query: aggregation + user data in one round trip
    const results = await prisma.$queryRaw<Array<{
      userId: string
      total: bigint
      username: string | null
      email: string
      totalXp: number
      profileImageUrl: string | null
    }>>`
      SELECT 
        t."userId",
        SUM(t.amount)::BIGINT as total,
        u.username,
        u.email,
        u."totalXp",
        u."profileImageUrl"
      FROM "XpTransaction" t
      JOIN "User" u ON t."userId" = u.id
      WHERE t."createdAt" >= ${startDate}
        AND t."createdAt" < ${endDate}
      GROUP BY t."userId", u.username, u.email, u."totalXp", u."profileImageUrl"
      ORDER BY SUM(t.amount) DESC, MIN(t."createdAt") ASC
      LIMIT ${limit} OFFSET ${offset}
    `

    return results.map((row) => ({
      userId: row.userId,
      total: Number(row.total),
      user: {
        id: row.userId,
        username: row.username,
        email: row.email,
        totalXp: row.totalXp,
        profileImageUrl: row.profileImageUrl
      }
    }))
  } catch (error) {
    console.warn('getMonthlyLeaderboard: Prisma query failed, falling back to RPC method:', error)
    return getMonthlyLeaderboardFallback(month, limit, offset)
  }
}

async function getMonthlyLeaderboardFallback(month: string, limit: number, offset: number): Promise<MonthlyStanding[]> {
  const supabaseAdmin = createServiceClient()
  const { data, error } = await supabaseAdmin.rpc('get_monthly_leaderboard', {
    p_month: month,
    p_limit: limit,
    p_offset: offset,
  })
  if (error) {
    console.error('getMonthlyLeaderboard RPC error:', error)
    return []
  }

  const standings: MonthlyStanding[] = (data || []).map((row: any) => ({ userId: row.userId, total: Number(row.total) }))
  if (standings.length === 0) return []

  const ids = standings.map((s) => s.userId)
  const { data: users, error: userErr } = await supabaseAdmin
    .from('User')
    .select('id, username, email, totalXp, profileImageUrl')
    .in('id', ids)

  if (userErr) {
    console.warn('Could not enrich monthly standings with user data:', userErr)
    return standings
  }

  const userMap = new Map((users || []).map((u) => [u.id, u]))
  return standings.map((s) => ({ ...s, user: userMap.get(s.userId) }))
}

export async function getMonthlyWinners(month: string): Promise<MonthlyWinner[]> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Invalid month format, expected YYYY-MM')
  const { data, error } = await supabaseClient
    .from('MonthlyWinner')
    .select('id, userId, month, awardedAt, rank, xpAwarded')
    .eq('month', month)
    .order('rank', { ascending: true })
  if (error) {
    const legacy = await supabaseClient
      .from('MonthlyWinner')
      .select('id, userId, month, awardedAt')
      .eq('month', month)
      .maybeSingle()
    if (legacy.error) throw legacy.error
    const row = legacy.data
    return row ? [{ id: row.id, userId: row.userId, month: row.month, awardedAt: row.awardedAt, rank: 1, xpAwarded: 0 }] : []
  }
  return (data || []) as unknown as MonthlyWinner[]
}

export async function awardMonthlyWinners(month: string): Promise<MonthlyWinner[]> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Invalid month format, expected YYYY-MM')
  const { data, error } = await supabaseClient.rpc('award_monthly_winners', { p_month: month })
  if (error) throw error
  const rows = Array.isArray(data) ? data : [data]
  return (rows || []).map((row: any) => {
    if (!row) return row
    const { month_text, ...rest } = row
    return { ...rest, month: month_text } as MonthlyWinner
  })
}

export async function getUserMonthlyStats(userId: string, month?: string): Promise<{ xp: number; rank: number; totalUsers: number }> {
  const targetMonth = month || getCurrentMonthUTC()
  
  try {
    const standings = await getMonthlyLeaderboard(targetMonth, 1000, 0)
    const userIndex = standings.findIndex(s => s.userId === userId)
    const userStanding = standings[userIndex]
    
    return {
      xp: userStanding?.total || 0,
      rank: userIndex >= 0 ? userIndex + 1 : 0,
      totalUsers: standings.length
    }
  } catch (error) {
    console.error('getUserMonthlyStats error:', error)
    return { xp: 0, rank: 0, totalUsers: 0 }
  }
}

// ============================================================================
// Weekly & All-Time Leaderboard Service
// ============================================================================

/**
 * Optimized leaderboard service using single efficient queries
 */
export class LeaderboardService {
  
  async getWeeklyLeaderboard(
    weekNumber: number,
    limit: number = 20,
    offset: number = 0
  ): Promise<{
    entries: LeaderboardEntry[]
    stats: LeaderboardStats
    pagination: PaginationMeta
  }> {
    const currentYear = new Date().getFullYear()
    const { startDate, endDate } = getWeekBoundaries(weekNumber, currentYear)

    const [leaderboardData, totalsData] = await Promise.all([
      prisma.$queryRaw<Array<{
        userId: string
        username: string | null
        discordHandle: string | null
        totalXp: number
        streakWeeks: number
        weeklyXp: bigint
        submissionCount: bigint
        reviewCount: bigint
        legacyCount: bigint
      }>>`
        WITH user_xp AS (
          SELECT 
            t."userId",
            SUM(t.amount) as "weeklyXp",
            COUNT(*) FILTER (WHERE t.type = 'SUBMISSION_REWARD') as "submissionCount"
          FROM "XpTransaction" t
          WHERE t."weekNumber" = ${weekNumber}
          GROUP BY t."userId"
        ),
        user_reviews AS (
          SELECT "reviewerId", COUNT(*) as "reviewCount"
          FROM "PeerReview"
          WHERE "createdAt" >= ${startDate} AND "createdAt" <= ${endDate}
          GROUP BY "reviewerId"
        ),
        legacy_counts AS (
          SELECT "discordHandle", COUNT(*) as cnt
          FROM "LegacySubmission"
          WHERE COALESCE("submittedAt", "importedAt") >= ${startDate}
            AND COALESCE("submittedAt", "importedAt") <= ${endDate}
          GROUP BY "discordHandle"
        )
        SELECT 
          u.id as "userId",
          u.username,
          u."discordHandle",
          u."totalXp",
          u."streakWeeks",
          COALESCE(ux."weeklyXp", 0) as "weeklyXp",
          COALESCE(ux."submissionCount", 0) as "submissionCount",
          COALESCE(ur."reviewCount", 0) as "reviewCount",
          GREATEST(
            COALESCE(lc1.cnt, 0),
            COALESCE(lc2.cnt, 0)
          ) as "legacyCount"
        FROM user_xp ux
        JOIN "User" u ON ux."userId" = u.id
        LEFT JOIN user_reviews ur ON u.id = ur."reviewerId"
        LEFT JOIN legacy_counts lc1 ON u.username = lc1."discordHandle"
        LEFT JOIN legacy_counts lc2 ON u."discordHandle" = lc2."discordHandle"
        ORDER BY ux."weeklyXp" DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw<Array<{ count: bigint; total: bigint }>>`
        SELECT COUNT(DISTINCT "userId") as count, COALESCE(SUM(amount), 0) as total
        FROM "XpTransaction"
        WHERE "weekNumber" = ${weekNumber}
      `
    ])

    const totalCount = Number(totalsData[0]?.count || 0)
    const totalXp = Number(totalsData[0]?.total || 0)

    const entries: LeaderboardEntry[] = leaderboardData.map((row, index) => ({
      rank: offset + index + 1,
      userId: row.userId,
      username: row.username || 'Unknown',
      totalXp: row.totalXp || 0,
      weeklyXp: Number(row.weeklyXp) || 0,
      streak: row.streakWeeks || 0,
      submissions: Number(row.submissionCount) + Number(row.legacyCount),
      reviews: Number(row.reviewCount) || 0
    }))

    const totalPages = Math.ceil(totalCount / limit)
    const page = Math.floor(offset / limit) + 1

    return {
      entries,
      stats: {
        activeParticipants: totalCount,
        totalXpAwarded: totalXp,
        averageXp: totalCount > 0 ? totalXp / totalCount : 0
      },
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    }
  }

  async getAllTimeLeaderboard(
    limit: number = 20,
    offset: number = 0
  ): Promise<{
    entries: LeaderboardEntry[]
    stats: LeaderboardStats
    pagination: PaginationMeta
  }> {
    const [leaderboardData, totalsData] = await Promise.all([
      prisma.$queryRaw<Array<{
        userId: string
        username: string | null
        discordHandle: string | null
        totalXp: number
        submissionCount: bigint
        reviewCount: bigint
        legacyByUsername: bigint
        legacyByDiscord: bigint
      }>>`
        WITH user_submissions AS (
          SELECT "userId", COUNT(*) as cnt FROM "Submission" GROUP BY "userId"
        ),
        user_reviews AS (
          SELECT "reviewerId", COUNT(*) as cnt FROM "PeerReview" GROUP BY "reviewerId"
        ),
        legacy_counts AS (
          SELECT "discordHandle", COUNT(*) as cnt FROM "LegacySubmission" GROUP BY "discordHandle"
        )
        SELECT 
          u.id as "userId",
          u.username,
          u."discordHandle",
          u."totalXp",
          COALESCE(us.cnt, 0) as "submissionCount",
          COALESCE(ur.cnt, 0) as "reviewCount",
          COALESCE(lc1.cnt, 0) as "legacyByUsername",
          COALESCE(lc2.cnt, 0) as "legacyByDiscord"
        FROM "User" u
        LEFT JOIN user_submissions us ON u.id = us."userId"
        LEFT JOIN user_reviews ur ON u.id = ur."reviewerId"
        LEFT JOIN legacy_counts lc1 ON u.username = lc1."discordHandle"
        LEFT JOIN legacy_counts lc2 ON u."discordHandle" = lc2."discordHandle"
        ORDER BY u."totalXp" DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw<Array<{ count: bigint; total: bigint }>>`
        SELECT COUNT(*) as count, COALESCE(SUM("totalXp"), 0) as total FROM "User"
      `
    ])

    const totalCount = Number(totalsData[0]?.count || 0)
    const totalXp = Number(totalsData[0]?.total || 0)

    const entries: LeaderboardEntry[] = leaderboardData.map((row, index) => ({
      rank: offset + index + 1,
      userId: row.userId,
      username: row.username || 'Unknown',
      totalXp: row.totalXp || 0,
      weeklyXp: 0,
      streak: 0,
      submissions: Number(row.submissionCount) + Math.max(Number(row.legacyByUsername), Number(row.legacyByDiscord)),
      reviews: Number(row.reviewCount) || 0
    }))

    const totalPages = Math.ceil(totalCount / limit)
    const page = Math.floor(offset / limit) + 1

    return {
      entries,
      stats: {
        activeParticipants: totalCount,
        totalXpAwarded: totalXp,
        averageXp: totalCount > 0 ? totalXp / totalCount : 0
      },
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    }
  }
}

export const leaderboardService = new LeaderboardService()
