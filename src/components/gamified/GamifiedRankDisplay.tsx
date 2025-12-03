'use client'

import { GamifiedRankBadge } from './GamifiedRankBadge'
import { GamifiedProgressBar } from './GamifiedProgressBar'
import { getGamifiedRank, calculateRankProgress } from '@/lib/gamified-ranks'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface GamifiedRankDisplayProps {
    totalXp: number
    variant?: 'compact' | 'full' | 'card'
    orientation?: 'horizontal' | 'vertical'
    showProgress?: boolean
    animated?: boolean
    className?: string
}

/**
 * Complete display component for gamified rank system
 * 
 * Variants:
 * - compact: Badge only, minimal space
 * - full: Badge + progress bar inline
 * - card: Premium card layout with all details
 * 
 * This is the main component to use in profile pages and other areas
 */
export function GamifiedRankDisplay({
    totalXp,
    variant = 'full',
    orientation = 'horizontal',
    showProgress = true,
    animated = true,
    className,
}: GamifiedRankDisplayProps) {
    const rank = getGamifiedRank(totalXp)
    const progress = calculateRankProgress(totalXp)

    // Compact variant - just the badge
    if (variant === 'compact') {
        return (
            <div className={cn('inline-flex', className)}>
                {rank && <GamifiedRankBadge rank={rank} size="md" animated={animated} />}
            </div>
        )
    }

    // Full variant - badge and progress bar inline
    if (variant === 'full') {
        if (orientation === 'horizontal') {
            return (
                <div className={cn('flex flex-col gap-3', className)}>
                    {rank && <GamifiedRankBadge rank={rank} size="lg" animated={animated} />}
                    {showProgress && (
                        <GamifiedProgressBar
                            totalXp={totalXp}
                            variant="horizontal"
                            showLabels={true}
                            showXpNumbers={true}
                        />
                    )}
                </div>
            )
        } else {
            return (
                <div className={cn('flex items-center gap-4', className)}>
                    <GamifiedProgressBar
                        totalXp={totalXp}
                        variant="vertical"
                        showLabels={false}
                        showXpNumbers={true}
                        height="h-32"
                    />
                    <div className="flex flex-col gap-2">
                        {rank && <GamifiedRankBadge rank={rank} size="lg" animated={animated} />}
                        {progress.nextRank && (
                            <p className="text-xs text-muted-foreground">
                                Next: {progress.nextRank.displayName}
                            </p>
                        )}
                    </div>
                </div>
            )
        }
    }

    // Card variant - premium card with all details
    return (
        <Card className={cn('overflow-hidden', className)}>
            <CardContent className="p-6">
                <div className="flex flex-col gap-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-muted-foreground mb-1">
                                Current Rank
                            </p>
                            {rank ? (
                                <GamifiedRankBadge rank={rank} size="xl" animated={animated} />
                            ) : (
                                <p className="text-sm text-muted-foreground">No rank yet</p>
                            )}
                        </div>
                        {progress.nextRank && (
                            <div className="text-right">
                                <p className="text-xs text-muted-foreground mb-1">Next Rank</p>
                                <GamifiedRankBadge
                                    rank={progress.nextRank}
                                    size="md"
                                    animated={false}
                                    className="opacity-60"
                                />
                            </div>
                        )}
                    </div>

                    {/* Progress */}
                    {showProgress && (
                        <div className="space-y-2">
                            <GamifiedProgressBar
                                totalXp={totalXp}
                                variant="horizontal"
                                showLabels={true}
                                showXpNumbers={true}
                                height="h-4"
                            />
                        </div>
                    )}

                    {/* Achievement milestones hint */}
                    {rank?.tier === 'Diamond' && (
                        <div className="mt-2 p-3 rounded-lg bg-gradient-to-r from-cyan-500/10 to-cyan-600/10 border border-cyan-500/20">
                            <p className="text-xs text-center text-cyan-700 dark:text-cyan-300 font-medium">
                                🎉 You&apos;ve reached the highest tier in {rank.category}!
                            </p>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
