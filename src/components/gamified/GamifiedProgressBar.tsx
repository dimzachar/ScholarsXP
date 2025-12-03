'use client'

import { cn } from '@/lib/utils'
import { calculateRankProgress, formatXP } from '@/lib/gamified-ranks'
import { Zap } from 'lucide-react'

interface GamifiedProgressBarProps {
    totalXp: number
    variant?: 'horizontal' | 'vertical'
    showLabels?: boolean
    showXpNumbers?: boolean
    height?: string
    width?: string
    className?: string
}

/**
 * Premium progress bar for XP progression
 * 
 * Features:
 * - Horizontal and vertical orientations
 * - Animated gradient fills based on current tier
 * - XP numbers display (e.g., "10,000 / 11,000 XP")
 * - Smooth transitions and glow effects
 * - Segmented appearance for visual appeal
 */
export function GamifiedProgressBar({
    totalXp,
    variant = 'horizontal',
    showLabels = true,
    showXpNumbers = true,
    height = variant === 'horizontal' ? 'h-3' : 'h-48',
    width = variant === 'horizontal' ? 'w-full' : 'w-6',
    className,
}: GamifiedProgressBarProps) {
    const progress = calculateRankProgress(totalXp)
    const { currentRank, nextRank, currentXp, requiredXp, progressPercentage } = progress

    // Dynamic color based on tier
    const getProgressColor = () => {
        switch (currentRank?.tier) {
            case 'Bronze':
                return 'from-amber-500 via-amber-600 to-amber-700'
            case 'Silver':
                return 'from-gray-300 via-gray-400 to-gray-500'
            case 'Gold':
                return 'from-yellow-400 via-yellow-500 to-yellow-600'
            case 'Platinum':
                return 'from-slate-300 via-slate-400 to-slate-500'
            case 'Diamond':
                return 'from-cyan-300 via-cyan-400 to-cyan-500'
            default:
                return 'from-slate-400 via-slate-500 to-slate-600'
        }
    }

    const isHorizontal = variant === 'horizontal'
    const isMaxRank = !nextRank

    if (isHorizontal) {
        return (
            <div className={cn('space-y-2', className)}>
                {/* XP Numbers */}
                {showXpNumbers && (
                    <div className="flex items-center justify-between text-sm font-medium">
                        <span className="text-muted-foreground flex items-center gap-1">
                            <Zap className="h-3.5 w-3.5 text-primary" />
                            {formatXP(currentXp)} XP
                        </span>
                        {!isMaxRank && (
                            <span className="text-muted-foreground">
                                {formatXP(requiredXp)} XP
                            </span>
                        )}
                    </div>
                )}

                {/* Progress Bar */}
                <div className={cn('relative rounded-full bg-muted overflow-hidden', height, width)}>
                    {/* Background subtle pattern */}
                    <div className="absolute inset-0 opacity-5">
                        <div className="h-full w-full" style={{
                            backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 10px, rgba(0,0,0,0.1) 10px, rgba(0,0,0,0.1) 20px)'
                        }} />
                    </div>

                    {/* Progress Fill */}
                    <div
                        className={cn(
                            'h-full rounded-full transition-all duration-700 ease-out',
                            'bg-gradient-to-r shadow-lg',
                            getProgressColor(),
                            isMaxRank && 'animate-pulse'
                        )}
                        style={{ width: `${progressPercentage}%` }}
                    >
                        {/* Shine effect */}
                        <div className="h-full w-full rounded-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                    </div>

                    {/* Glow effect */}
                    <div
                        className={cn(
                            'absolute inset-y-0 left-0 rounded-full blur-sm opacity-50 transition-all duration-700 ease-out',
                            `bg-gradient-to-r ${getProgressColor()}`
                        )}
                        style={{ width: `${progressPercentage}%` }}
                    />
                </div>

                {/* Labels (if needed for context) */}
                {showLabels && !isMaxRank && (
                    <p className="text-xs text-muted-foreground text-center">
                        {formatXP(progress.remainingXp)} XP to {nextRank.displayName}
                    </p>
                )}

                {isMaxRank && showLabels && (
                    <p className="text-xs text-center font-semibold bg-gradient-to-r from-cyan-600 to-cyan-400 bg-clip-text text-transparent">
                        ✨ Maximum Rank Achieved! ✨
                    </p>
                )}
            </div>
        )
    }

    // Vertical variant
    return (
        <div className={cn('flex flex-col items-center gap-3', className)}>
            {/* XP Numbers */}
            {showXpNumbers && (
                <div className="flex flex-col items-center gap-1 text-sm font-medium">
                    <span className="text-muted-foreground flex items-center gap-1">
                        <Zap className="h-3.5 w-3.5 text-primary" />
                        {formatXP(currentXp)}
                    </span>
                    {!isMaxRank && (
                        <>
                            <div className="h-px w-8 bg-border" />
                            <span className="text-muted-foreground text-xs">
                                {formatXP(requiredXp)}
                            </span>
                        </>
                    )}
                </div>
            )}

            {/* Vertical Progress Bar */}
            <div className={cn('relative rounded-full bg-muted overflow-hidden flex flex-col-reverse', height, width)}>
                {/* Background subtle pattern */}
                <div className="absolute inset-0 opacity-5">
                    <div className="h-full w-full" style={{
                        backgroundImage: 'repeating-linear-gradient(180deg, transparent, transparent 10px, rgba(0,0,0,0.1) 10px, rgba(0,0,0,0.1) 20px)'
                    }} />
                </div>

                {/* Progress Fill */}
                <div
                    className={cn(
                        'w-full rounded-full transition-all duration-700 ease-out',
                        'bg-gradient-to-t shadow-lg',
                        getProgressColor(),
                        isMaxRank && 'animate-pulse'
                    )}
                    style={{ height: `${progressPercentage}%` }}
                >
                    {/* Shine effect */}
                    <div className="h-full w-full rounded-full bg-gradient-to-t from-transparent via-white/30 to-transparent animate-shimmer" />
                </div>

                {/* Glow effect */}
                <div
                    className={cn(
                        'absolute inset-x-0 bottom-0 rounded-full blur-sm opacity-50 transition-all duration-700 ease-out',
                        `bg-gradient-to-t ${getProgressColor()}`
                    )}
                    style={{ height: `${progressPercentage}%` }}
                />
            </div>

            {isMaxRank && showLabels && (
                <p className="text-xs text-center font-semibold bg-gradient-to-r from-cyan-600 to-cyan-400 bg-clip-text text-transparent writing-mode-vertical">
                    ✨ Max ✨
                </p>
            )}
        </div>
    )
}
