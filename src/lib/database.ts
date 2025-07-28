import { supabaseClient } from './supabase'
import type { Database } from './supabase'

type User = Database['public']['Tables']['User']['Row']
type UserInsert = Database['public']['Tables']['User']['Insert']
type UserUpdate = Database['public']['Tables']['User']['Update']

type Submission = Database['public']['Tables']['Submission']['Row']
type SubmissionInsert = Database['public']['Tables']['Submission']['Insert']
type SubmissionUpdate = Database['public']['Tables']['Submission']['Update']

type PeerReview = Database['public']['Tables']['PeerReview']['Row']
type PeerReviewInsert = Database['public']['Tables']['PeerReview']['Insert']

type WeeklyStats = Database['public']['Tables']['WeeklyStats']['Row']
type WeeklyStatsInsert = Database['public']['Tables']['WeeklyStats']['Insert']
type WeeklyStatsUpdate = Database['public']['Tables']['WeeklyStats']['Update']

// User operations
export const userService = {
  async findById(id: string): Promise<User | null> {
    const { data, error } = await supabaseClient
      .from('User')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      console.error('Error finding user by ID:', error)
      return null
    }
    return data
  },

  async findByEmail(email: string): Promise<User | null> {
    const { data, error } = await supabaseClient
      .from('User')
      .select('*')
      .eq('email', email)
      .single()
    
    if (error) {
      console.error('Error finding user by email:', error)
      return null
    }
    return data
  },

  async create(userData: UserInsert): Promise<User | null> {
    const { data, error } = await supabaseClient
      .from('User')
      .insert(userData)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating user:', error)
      return null
    }
    return data
  },

  async update(id: string, userData: UserUpdate): Promise<User | null> {
    const { data, error } = await supabaseClient
      .from('User')
      .update(userData)
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      console.error('Error updating user:', error)
      return null
    }
    return data
  },

  async count(): Promise<number> {
    const { count, error } = await supabaseClient
      .from('User')
      .select('*', { count: 'exact', head: true })
    
    if (error) {
      console.error('Error counting users:', error)
      return 0
    }
    return count || 0
  },

  async findMany(): Promise<User[]> {
    const { data, error } = await supabaseClient
      .from('User')
      .select('*')
    
    if (error) {
      console.error('Error finding users:', error)
      return []
    }
    return data || []
  },

  async incrementXp(id: string, totalXpIncrement: number, weeklyXpIncrement: number): Promise<User | null> {
    // First get current values
    const user = await this.findById(id)
    if (!user) return null

    const { data, error } = await supabaseClient
      .from('User')
      .update({
        totalXp: user.totalXp + totalXpIncrement,
        currentWeekXp: user.currentWeekXp + weeklyXpIncrement
      })
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      console.error('Error incrementing user XP:', error)
      return null
    }
    return data
  },

  async findTopUsers(limit: number = 10, offset: number = 0): Promise<User[]> {
    const { data, error } = await supabaseClient
      .from('User')
      .select('*')
      .order('totalXp', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error finding top users:', error)
      return []
    }
    return data || []
  },

  async countAll(): Promise<number> {
    const { count, error } = await supabaseClient
      .from('User')
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.error('Error counting users:', error)
      return 0
    }
    return count || 0
  }
}

// Submission operations
export const submissionService = {
  async create(submissionData: SubmissionInsert): Promise<Submission | null> {
    const { data, error } = await supabaseClient
      .from('Submission')
      .insert(submissionData)
      .select()
      .single()
    
    if (error) {
      console.error('Error creating submission:', error)
      return null
    }
    return data
  },

  async findById(id: string): Promise<Submission | null> {
    const { data, error } = await supabaseClient
      .from('Submission')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      console.error('Error finding submission by ID:', error)
      return null
    }
    return data
  },

  async update(id: string, submissionData: SubmissionUpdate): Promise<Submission | null> {
    const { data, error } = await supabaseClient
      .from('Submission')
      .update(submissionData)
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      console.error('Error updating submission:', error)
      return null
    }
    return data
  },

  async findManyWithUser(limit: number = 20): Promise<any[]> {
    const { data, error } = await supabaseClient
      .from('Submission')
      .select(`
        *,
        user:User(username),
        peerReviews:PeerReview(*)
      `)
      .order('createdAt', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error finding submissions with user:', error)
      return []
    }
    return data || []
  },

  async findManyByUser(userId: string, limit: number = 20): Promise<any[]> {
    const { data, error } = await supabaseClient
      .from('Submission')
      .select(`
        *,
        user:User(username),
        peerReviews:PeerReview(*)
      `)
      .eq('userId', userId)
      .order('createdAt', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('Error finding submissions by user:', error)
      return []
    }
    return data || []
  },

  async count(): Promise<number> {
    const { count, error } = await supabaseClient
      .from('Submission')
      .select('*', { count: 'exact', head: true })
    
    if (error) {
      console.error('Error counting submissions:', error)
      return 0
    }
    return count || 0
  },

  async countByStatus(status: string): Promise<number> {
    const { count, error } = await supabaseClient
      .from('Submission')
      .select('*', { count: 'exact', head: true })
      .eq('status', status)
    
    if (error) {
      console.error('Error counting submissions by status:', error)
      return 0
    }
    return count || 0
  },

  async findManyByWeek(weekNumber: number, status?: string): Promise<Submission[]> {
    let query = supabaseClient
      .from('Submission')
      .select('*')
      .eq('weekNumber', weekNumber)

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query
    
    if (error) {
      console.error('Error finding submissions by week:', error)
      return []
    }
    return data || []
  },

  async findTopByWeek(weekNumber: number): Promise<any | null> {
    const { data, error } = await supabaseClient
      .from('Submission')
      .select(`
        *,
        user:User(username)
      `)
      .eq('weekNumber', weekNumber)
      .eq('status', 'FINALIZED')
      .not('finalXp', 'is', null)
      .order('finalXp', { ascending: false })
      .limit(1)
      .single()
    
    if (error) {
      console.error('Error finding top submission by week:', error)
      return null
    }
    return data
  }
}

// PeerReview operations
export const peerReviewService = {
  async create(reviewData: PeerReviewInsert): Promise<PeerReview | null> {
    const { data, error } = await supabaseClient
      .from('PeerReview')
      .insert(reviewData)
      .select()
      .single()

    if (error) {
      console.error('Error creating peer review:', error)
      return null
    }
    return data
  },

  async count(): Promise<number> {
    const { count, error } = await supabaseClient
      .from('PeerReview')
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.error('Error counting peer reviews:', error)
      return 0
    }
    return count || 0
  }
}

// WeeklyStats operations
export const weeklyStatsService = {
  async findByUserAndWeek(userId: string, weekNumber: number): Promise<WeeklyStats | null> {
    const { data, error } = await supabaseClient
      .from('WeeklyStats')
      .select('*')
      .eq('userId', userId)
      .eq('weekNumber', weekNumber)
      .single()

    if (error) {
      console.error('Error finding weekly stats:', error)
      return null
    }
    return data
  },

  async create(statsData: WeeklyStatsInsert): Promise<WeeklyStats | null> {
    const { data, error } = await supabaseClient
      .from('WeeklyStats')
      .insert(statsData)
      .select()
      .single()

    if (error) {
      console.error('Error creating weekly stats:', error)
      return null
    }
    return data
  },

  async update(id: string, statsData: WeeklyStatsUpdate): Promise<WeeklyStats | null> {
    const { data, error } = await supabaseClient
      .from('WeeklyStats')
      .update(statsData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating weekly stats:', error)
      return null
    }
    return data
  },

  async incrementXp(id: string, xpIncrement: number): Promise<WeeklyStats | null> {
    // First get current values
    const { data: currentStats, error: fetchError } = await supabaseClient
      .from('WeeklyStats')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !currentStats) {
      console.error('Error fetching current weekly stats:', fetchError)
      return null
    }

    const { data, error } = await supabaseClient
      .from('WeeklyStats')
      .update({
        xpTotal: currentStats.xpTotal + xpIncrement
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error incrementing weekly stats XP:', error)
      return null
    }
    return data
  },

  async findManyByWeek(weekNumber: number): Promise<any[]> {
    const { data, error } = await supabaseClient
      .from('WeeklyStats')
      .select(`
        *,
        user:User(username, totalXp, streakWeeks)
      `)
      .eq('weekNumber', weekNumber)

    if (error) {
      console.error('Error finding weekly stats by week:', error)
      return []
    }
    return data || []
  },

  async findLeaderboard(weekNumber: number, limit: number = 10, offset: number = 0): Promise<any[]> {
    const { data, error } = await supabaseClient
      .from('WeeklyStats')
      .select(`
        *,
        user:User(username, totalXp)
      `)
      .eq('weekNumber', weekNumber)
      .order('xpTotal', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Error finding leaderboard:', error)
      return []
    }
    return data || []
  },

  async countByWeek(weekNumber: number): Promise<number> {
    const { count, error } = await supabaseClient
      .from('WeeklyStats')
      .select('*', { count: 'exact', head: true })
      .eq('weekNumber', weekNumber)

    if (error) {
      console.error('Error counting weekly stats:', error)
      return 0
    }
    return count || 0
  }
}
