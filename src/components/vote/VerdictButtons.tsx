'use client'

import { useMemo, useEffect } from 'react'
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
}

export function VerdictButtons({ 
  divergentScores, 
  onVote, 
  onSkip,
  voting, 
  disabled,
  submissionId
}: VerdictButtonsProps) {
  const [lowXp, highXp] = divergentScores

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

  const handleVote = (xp: number, buttonPosition: 'left' | 'right') => {
    // Track vote event immediately (before component potentially unmounts)
    if (submissionId) {
      trackVoteEvent({
        submissionId,
        eventType: 'vote',
        votedXp: xp,
        buttonPosition,
        highXpPosition,
        timeSpentMs: getTimeSpent(submissionId)
      })
    }
    
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

// Helper to track vote success - no longer needed, tracking happens in VerdictButtons
export function trackVoteSuccess(_xp: number, _buttonPosition: 'left' | 'right') {
  // Deprecated: tracking now happens immediately in handleVote before component unmounts
}
