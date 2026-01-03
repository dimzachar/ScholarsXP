'use client'

import { useMemo, useEffect, useRef } from 'react'
import { ThumbsDown, ThumbsUp, Loader2, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { trackVoteEvent, markCaseViewed, getTimeSpent, clearViewTime } from '@/lib/vote-analytics'

interface VerdictButtonsProps {
  divergentScores: [number, number]
  onVote: (xp: number, direction: 'left' | 'right') => void
  onSkip?: () => void
  voting: boolean
  disabled?: boolean
  submissionId?: string
  onVoteSuccess?: (xp: number, buttonPosition: 'left' | 'right', highXpPosition: 'left' | 'right', timeSpentMs: number) => void
}

export function VerdictButtons({ 
  divergentScores, 
  onVote, 
  onSkip,
  voting, 
  disabled,
  submissionId,
  onVoteSuccess
}: VerdictButtonsProps) {
  const [lowXp, highXp] = divergentScores
  const pendingVoteRef = useRef<{ xp: number; buttonPosition: 'left' | 'right' } | null>(null)

  // Randomize button order based on submissionId (consistent per case)
  const swapped = useMemo(() => {
    if (!submissionId) return false
    const hash = submissionId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return hash % 2 === 1
  }, [submissionId])

  const highXpPosition: 'left' | 'right' = swapped ? 'left' : 'right'

  // Track case view on mount
  useEffect(() => {
    if (submissionId) {
      markCaseViewed(submissionId)
    }
    return () => {
      if (submissionId) {
        clearViewTime(submissionId)
      }
    }
  }, [submissionId])

  // Export tracking function for parent to call on success
  useEffect(() => {
    if (onVoteSuccess && submissionId) {
      // Expose the tracking data via callback registration
    }
  }, [onVoteSuccess, submissionId])

  const handleVote = (xp: number, buttonPosition: 'left' | 'right') => {
    // Store pending vote info for tracking after success
    pendingVoteRef.current = { xp, buttonPosition }
    onVote(xp, buttonPosition)
  }

  const handleSkip = () => {
    if (submissionId) {
      trackVoteEvent({
        submissionId,
        eventType: 'skip',
        highXpPosition,
        timeSpentMs: getTimeSpent(submissionId)
      })
    }
    onSkip?.()
  }

  // Expose method to track successful vote (called by parent after tx confirms)
  // Using a ref-based approach to avoid prop drilling
  useEffect(() => {
    if (submissionId && typeof window !== 'undefined') {
      (window as any).__trackVoteSuccess = (xp: number, buttonPosition: 'left' | 'right') => {
        trackVoteEvent({
          submissionId,
          eventType: 'vote',
          votedXp: xp,
          buttonPosition,
          highXpPosition,
          timeSpentMs: getTimeSpent(submissionId)
        })
      }
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).__trackVoteSuccess
      }
    }
  }, [submissionId, highXpPosition])

  const lowButton = (
    <Button
      variant="outline"
      onClick={() => handleVote(lowXp, swapped ? 'right' : 'left')}
      disabled={voting || disabled}
      className={cn(
        "h-24 flex-col gap-2 border-2 transition-all duration-200",
        "border-destructive/30 hover:border-destructive hover:bg-destructive/10",
        "group"
      )}
    >
      {voting ? (
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      ) : (
        <>
          <div className="p-2 rounded-full bg-destructive/10 group-hover:bg-destructive/20 transition-colors">
            <ThumbsDown className="w-6 h-6 text-destructive" />
          </div>
          <div className="text-2xl font-bold text-destructive">{lowXp} XP</div>
        </>
      )}
    </Button>
  )

  const highButton = (
    <Button
      variant="outline"
      onClick={() => handleVote(highXp, swapped ? 'left' : 'right')}
      disabled={voting || disabled}
      className={cn(
        "h-24 flex-col gap-2 border-2 transition-all duration-200",
        "border-success/30 hover:border-success hover:bg-success/10",
        "group"
      )}
    >
      {voting ? (
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      ) : (
        <>
          <div className="p-2 rounded-full bg-success/10 group-hover:bg-success/20 transition-colors">
            <ThumbsUp className="w-6 h-6 text-success" />
          </div>
          <div className="text-2xl font-bold text-success">{highXp} XP</div>
        </>
      )}
    </Button>
  )

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-1">YOUR VERDICT</h3>
        <p className="text-sm text-muted-foreground">
          Based on the evidence, what XP should this submission have earned?
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {swapped ? (
          <>
            {highButton}
            {lowButton}
          </>
        ) : (
          <>
            {lowButton}
            {highButton}
          </>
        )}
      </div>

      {onSkip && (
        <Button
          variant="ghost"
          onClick={handleSkip}
          disabled={voting || disabled}
          className="w-full text-muted-foreground hover:text-foreground"
        >
          <SkipForward className="w-4 h-4 mr-2" />
          Skip this case
        </Button>
      )}
    </div>
  )
}

// Helper to track vote success from parent component
export function trackVoteSuccess(xp: number, buttonPosition: 'left' | 'right') {
  if (typeof window !== 'undefined' && (window as any).__trackVoteSuccess) {
    (window as any).__trackVoteSuccess(xp, buttonPosition)
  }
}
