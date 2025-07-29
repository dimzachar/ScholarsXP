/**
 * Merge Status Hook
 * 
 * React hook for tracking merge status and providing user feedback
 * during the legacy account merge process.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
// Remove direct service imports to avoid Next.js server/client issues
// import { MergeService } from '@/lib/services/MergeService'
// import type { MergeStatus } from '@/lib/services/MergeService'

// Define types locally
interface MergeStatus {
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

interface UseMergeStatusOptions {
  userId?: string
  pollInterval?: number // in milliseconds
  autoRefresh?: boolean
}

interface UseMergeStatusReturn {
  status: MergeStatus | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  isActive: boolean
  isCompleted: boolean
  isFailed: boolean
  progressPercentage: number
}

export function useMergeStatus(options: UseMergeStatusOptions = {}): UseMergeStatusReturn {
  const { userId, pollInterval = 5000, autoRefresh = true } = options
  
  const [status, setStatus] = useState<MergeStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const refresh = useCallback(async () => {
    if (!userId) return

    try {
      setLoading(true)
      setError(null)

      // Use API call instead of direct service
      const response = await fetch(`/api/merge/initiate?userId=${userId}`)
      if (response.ok) {
        const mergeStatus = await response.json()
        setStatus(mergeStatus)
      } else {
        throw new Error('Failed to fetch merge status')
      }
    } catch (err) {
      console.error('Error fetching merge status:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch merge status')
    } finally {
      setLoading(false)
    }
  }, [userId])

  // Initial load
  useEffect(() => {
    if (userId) {
      refresh()
    }
  }, [userId, refresh])

  // Auto-refresh for active merges
  useEffect(() => {
    if (!autoRefresh || !userId || !status) return

    const isActive = status.status === 'PENDING' || status.status === 'IN_PROGRESS'
    if (!isActive) return

    const interval = setInterval(refresh, pollInterval)
    return () => clearInterval(interval)
  }, [autoRefresh, userId, status, pollInterval, refresh])

  // Derived state
  const isActive = status?.status === 'PENDING' || status?.status === 'IN_PROGRESS'
  const isCompleted = status?.status === 'COMPLETED'
  const isFailed = status?.status === 'FAILED'

  // Calculate progress percentage (rough estimate)
  const progressPercentage = useMemo(() => {
    if (!status) return 0
    
    switch (status.status) {
      case 'PENDING':
        return 10
      case 'IN_PROGRESS':
        // Estimate based on progress data if available
        if (status.progress) {
          const { transactionsTransferred, xpTransferred } = status.progress
          // Simple heuristic: assume 100 transactions and 1000 XP as "full"
          const transactionProgress = Math.min(transactionsTransferred / 100, 1) * 40
          const xpProgress = Math.min(xpTransferred / 1000, 1) * 40
          return 20 + transactionProgress + xpProgress
        }
        return 50
      case 'COMPLETED':
        return 100
      case 'FAILED':
      case 'ROLLED_BACK':
      case 'CANCELLED':
        return 0
      default:
        return 0
    }
  }, [status])

  return {
    status,
    loading,
    error,
    refresh,
    isActive,
    isCompleted,
    isFailed,
    progressPercentage
  }
}

/**
 * Hook for initiating a merge
 */
interface UseInitiateMergeOptions {
  onSuccess?: (result: any) => void
  onError?: (error: string) => void
}

interface UseInitiateMergeReturn {
  initiateMerge: (params: {
    realUserId: string
    discordHandle: string
    discordId?: string
    email: string
  }) => Promise<void>
  loading: boolean
  error: string | null
}

export function useInitiateMerge(options: UseInitiateMergeOptions = {}): UseInitiateMergeReturn {
  const { onSuccess, onError } = options
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const initiateMerge = useCallback(async (params: {
    realUserId: string
    discordHandle: string
    discordId?: string
    email: string
  }) => {
    try {
      setLoading(true)
      setError(null)

      // Use API call instead of direct service
      const response = await fetch('/api/merge/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...params,
          initiatedBy: 'USER'
        })
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          onSuccess?.(result)
        } else {
          const errorMessage = result.message || 'Merge initiation failed'
          setError(errorMessage)
          onError?.(errorMessage)
        }
      } else {
        throw new Error('API call failed')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initiate merge'
      setError(errorMessage)
      onError?.(errorMessage)
    } finally {
      setLoading(false)
    }
  }, [onSuccess, onError])

  return {
    initiateMerge,
    loading,
    error
  }
}

/**
 * Hook for merge statistics (admin use)
 */
interface UseMergeStatisticsReturn {
  statistics: any | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useMergeStatistics(timeframe: 'day' | 'week' | 'month' = 'day'): UseMergeStatisticsReturn {
  const [statistics, setStatistics] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Mock statistics for now - would be API call in production
      const stats = {
        totalMerges: 0,
        successRate: 1,
        averageProcessingTime: 0,
        errorRate: 0,
        recentFailures: 0,
        performanceScore: 100
      }
      setStatistics(stats)
    } catch (err) {
      console.error('Error fetching merge statistics:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch statistics')
    } finally {
      setLoading(false)
    }
  }, [timeframe])

  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    statistics,
    loading,
    error,
    refresh
  }
}

// Helper function to format merge status for display
export function formatMergeStatus(status: string): { label: string; color: string; icon: string } {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending', color: 'yellow', icon: 'clock' }
    case 'IN_PROGRESS':
      return { label: 'In Progress', color: 'blue', icon: 'loader' }
    case 'COMPLETED':
      return { label: 'Completed', color: 'green', icon: 'check-circle' }
    case 'FAILED':
      return { label: 'Failed', color: 'red', icon: 'x-circle' }
    case 'ROLLED_BACK':
      return { label: 'Rolled Back', color: 'orange', icon: 'undo' }
    case 'CANCELLED':
      return { label: 'Cancelled', color: 'gray', icon: 'x' }
    default:
      return { label: status, color: 'gray', icon: 'help-circle' }
  }
}

// Helper function to estimate merge duration
export function estimateMergeDuration(progress?: { transactionsTransferred: number; xpTransferred: number }): string {
  if (!progress) return 'Estimating...'
  
  const { transactionsTransferred } = progress
  
  // Rough estimate: 10 transactions per second
  const estimatedSeconds = Math.max(1, Math.ceil((100 - transactionsTransferred) / 10))
  
  if (estimatedSeconds < 60) {
    return `~${estimatedSeconds}s remaining`
  } else {
    const minutes = Math.ceil(estimatedSeconds / 60)
    return `~${minutes}m remaining`
  }
}
