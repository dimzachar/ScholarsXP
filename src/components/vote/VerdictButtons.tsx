'use client'

import { ThumbsDown, ThumbsUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface VerdictButtonsProps {
  divergentScores: [number, number]
  onVote: (xp: number, direction: 'left' | 'right') => void
  voting: boolean
  disabled?: boolean
}

export function VerdictButtons({ divergentScores, onVote, voting, disabled }: VerdictButtonsProps) {
  const [lowXp, highXp] = divergentScores

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-1">YOUR VERDICT</h3>
        <p className="text-sm text-muted-foreground">
          Based on the evidence, what XP should this submission have earned?
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Button
          variant="outline"
          onClick={() => onVote(lowXp, 'left')}
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
              <div>
                <div className="text-2xl font-bold text-destructive">{lowXp} XP</div>
              </div>
            </>
          )}
        </Button>

        <Button
          variant="outline"
          onClick={() => onVote(highXp, 'right')}
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
              <div>
                <div className="text-2xl font-bold text-success">{highXp} XP</div>
              </div>
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
