import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  },
  global: {
    headers: {
      'X-Client-Info': 'scholars-xp-web'
    }
  },
  db: {
    schema: 'public'
  },
  realtime: {
    log_level: 'error'
  }
})

// Database types for TypeScript
export type Database = {
  public: {
    Tables: {
      User: {
        Row: {
          id: string
          email: string
          username: string | null
          totalXp: number
          currentWeekXp: number
          streakWeeks: number
          missedReviews: number
          createdAt: string
          updatedAt: string
        }
        Insert: {
          id?: string
          email: string
          username?: string | null
          totalXp?: number
          currentWeekXp?: number
          streakWeeks?: number
          missedReviews?: number
          createdAt?: string
          updatedAt?: string
        }
        Update: {
          id?: string
          email?: string
          username?: string | null
          totalXp?: number
          currentWeekXp?: number
          streakWeeks?: number
          missedReviews?: number
          createdAt?: string
          updatedAt?: string
        }
      }
      Submission: {
        Row: {
          id: string
          userId: string
          url: string
          platform: string
          taskTypes: string[]
          aiXp: number
          originalityScore: number | null
          peerXp: number | null
          finalXp: number | null
          status: 'PENDING' | 'AI_REVIEWED' | 'UNDER_PEER_REVIEW' | 'FINALIZED' | 'FLAGGED' | 'REJECTED'
          createdAt: string
          updatedAt: string
          weekNumber: number
        }
        Insert: {
          id?: string
          userId: string
          url: string
          platform: string
          taskTypes: string[]
          aiXp: number
          originalityScore?: number | null
          peerXp?: number | null
          finalXp?: number | null
          status?: 'PENDING' | 'AI_REVIEWED' | 'UNDER_PEER_REVIEW' | 'FINALIZED' | 'FLAGGED' | 'REJECTED'
          createdAt?: string
          updatedAt?: string
          weekNumber: number
        }
        Update: {
          id?: string
          userId?: string
          url?: string
          platform?: string
          taskTypes?: string[]
          aiXp?: number
          originalityScore?: number | null
          peerXp?: number | null
          finalXp?: number | null
          status?: 'PENDING' | 'AI_REVIEWED' | 'UNDER_PEER_REVIEW' | 'FINALIZED' | 'FLAGGED' | 'REJECTED'
          createdAt?: string
          updatedAt?: string
          weekNumber?: number
        }
      }
      PeerReview: {
        Row: {
          id: string
          reviewerId: string
          submissionId: string
          xpScore: number
          comments: string | null
          createdAt: string
          updatedAt: string
        }
        Insert: {
          id?: string
          reviewerId: string
          submissionId: string
          xpScore: number
          comments?: string | null
          createdAt?: string
          updatedAt?: string
        }
        Update: {
          id?: string
          reviewerId?: string
          submissionId?: string
          xpScore?: number
          comments?: string | null
          createdAt?: string
          updatedAt?: string
        }
      }
      WeeklyStats: {
        Row: {
          id: string
          userId: string
          weekNumber: number
          xpTotal: number
          reviewsDone: number
          reviewsMissed: number
          earnedStreak: boolean
          createdAt: string
          updatedAt: string
        }
        Insert: {
          id?: string
          userId: string
          weekNumber: number
          xpTotal: number
          reviewsDone: number
          reviewsMissed: number
          earnedStreak?: boolean
          createdAt?: string
          updatedAt?: string
        }
        Update: {
          id?: string
          userId?: string
          weekNumber?: number
          xpTotal?: number
          reviewsDone?: number
          reviewsMissed?: number
          earnedStreak?: boolean
          createdAt?: string
          updatedAt?: string
        }
      }
      ReviewAssignment: {
        Row: {
          id: string
          submissionId: string
          reviewerId: string
          assignedAt: string
          deadline: string
          status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'MISSED' | 'REASSIGNED' | 'ASSIGNED' | 'OVERDUE' | 'CANCELLED'
          completedAt: string | null
          releasedAt: string | null
          releaseReason: string | null
          createdAt: string
          updatedAt: string
        }
        Insert: {
          id?: string
          submissionId: string
          reviewerId: string
          assignedAt?: string
          deadline: string
          status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'MISSED' | 'REASSIGNED' | 'ASSIGNED' | 'OVERDUE' | 'CANCELLED'
          completedAt?: string | null
          releasedAt?: string | null
          releaseReason?: string | null
          createdAt?: string
          updatedAt?: string
        }
        Update: {
          id?: string
          submissionId?: string
          reviewerId?: string
          assignedAt?: string
          deadline?: string
          status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'MISSED' | 'REASSIGNED' | 'ASSIGNED' | 'OVERDUE' | 'CANCELLED'
          completedAt?: string | null
          releasedAt?: string | null
          releaseReason?: string | null
          createdAt?: string
          updatedAt?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      reshuffle_single_assignment: {
        Args: {
          p_assignment_id: string
          p_reason: string
          p_dry_run?: boolean
        }
        Returns: Record<string, unknown>
      }
      auto_reshuffle_stale_reviewers: {
        Args: {
          p_pending_cutoff_hours?: number
          p_in_progress_cutoff_hours?: number
          p_limit?: number
        }
        Returns: Record<string, unknown>
      }
      select_reviewer_for_submission: {
        Args: {
          p_submission_id: string
          p_excluded_reviewers?: string[] | null
        }
        Returns: {
          reviewerId: string
        }[]
      }
    }
    Enums: {
      SubmissionStatus: 'PENDING' | 'AI_REVIEWED' | 'UNDER_PEER_REVIEW' | 'FINALIZED' | 'FLAGGED' | 'REJECTED'
    }
  }
}

// Create a typed client
export const supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  },
  global: {
    headers: {
      'X-Client-Info': 'scholars-xp-web'
    }
  },
  db: {
    schema: 'public'
  },
  realtime: {
    log_level: 'error'
  }
})
