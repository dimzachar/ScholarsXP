'use client'

import { cn } from '@/lib/utils'
import { GamifiedRank } from '@/lib/gamified-ranks'
import { Sparkles } from 'lucide-react'

interface GamifiedRankBadgeProps {
    rank: GamifiedRank
    size?: 'sm' | 'md' | 'lg' | 'xl'
    showIcon?: boolean
    showTier?: boolean
    animated?: boolean
    className?: string
}

/**
 * Premium badge component for displaying gamified ranks
 * 
 * Features:
 * - Dynamic gradient backgrounds based on tier
 * - Smooth animations and hover effects
 * - Lucide icons colored by tier for visual recognition
 * - Multiple size variants
 * - Glassmorphism effects for premium feel
 */
export function GamifiedRankBadge({
    rank,
    size = 'md',
    showIcon = true,
    showTier = true,
    animated = true,
    className,
}: GamifiedRankBadgeProps) {
    const sizeClasses = {
        sm: 'px-2 py-0.5 text-xs gap-1',
        md: 'px-3 py-1.5 text-sm gap-1.5',
        lg: 'px-4 py-2 text-base gap-2',
        xl: 'px-6 py-3 text-lg gap-2.5',
    }

    const iconSizes = {
        sm: 'h-3 w-3',
        md: 'h-4 w-4',
        lg: 'h-5 w-5',
        xl: 'h-6 w-6',
    }

    // Dynamic styling based on tier
    const getTierStyles = () => {
        const baseStyle = 'relative overflow-hidden backdrop-blur-sm border-2'

        switch (rank.tier) {
            case 'Bronze':
                return `${baseStyle} bg-gradient-to-r from-amber-500/10 to-amber-600/10 border-amber-500/30 text-amber-700 dark:text-amber-400`
            case 'Silver':
                return `${baseStyle} bg-gradient-to-r from-gray-300/10 to-gray-400/10 border-gray-400/30 text-gray-700 dark:text-gray-300`
            case 'Gold':
                return `${baseStyle} bg-gradient-to-r from-yellow-400/10 to-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400`
            case 'Platinum':
                return `${baseStyle} bg-gradient-to-r from-slate-200/10 to-slate-300/10 border-slate-400/30 text-slate-700 dark:text-slate-300`
            case 'Diamond':
                return `${baseStyle} bg-gradient-to-r from-cyan-300/10 to-cyan-400/10 border-cyan-400/30 text-cyan-700 dark:text-cyan-300`
            default: // Initiate
                return `${baseStyle} bg-gradient-to-r from-slate-400/10 to-slate-500/10 border-slate-400/30 text-slate-700 dark:text-slate-400`
        }
    }

    // Shine animation for premium effect
    const shineAnimation = animated ? (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-in-out" />
    ) : null

    const IconElement = rank.icon

    return (
        <div
            className={cn(
                'group inline-flex items-center font-semibold rounded-full',
                'transition-all duration-300 ease-out',
                'hover:scale-105 hover:shadow-lg',
                getTierStyles(),
                sizeClasses[size],
                className
            )}
        >
            {shineAnimation}

            {showIcon && (
                <IconElement
                    className={cn('relative z-10', iconSizes[size])}
                    style={{ color: rank.color }}
                    strokeWidth={2.5}
                />
            )}

            <span className="relative z-10 font-bold tracking-wide">
                {showTier ? rank.displayName : rank.category}
            </span>

            {/* Sparkle effect for Diamond tier */}
            {rank.tier === 'Diamond' && animated && (
                <Sparkles className="h-3 w-3 relative z-10 animate-pulse" style={{ color: rank.color }} />
            )}
        </div>
    )
}
