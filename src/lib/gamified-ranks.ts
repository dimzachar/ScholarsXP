/**
 * Gamified Rank System
 * 
 * This module defines the 5-tier gamification system (Bronze, Silver, Gold, Platinum, Diamond)
 * across 4 Discord role categories (Apprentice, Journeyman, Erudite, Master).
 * 
 * The system provides non-linear XP progression with peaks and dips for engagement.
 * Uses Lucide React icons for a professional, consistent appearance.
 * 
 * Structure:
 * - Base Discord roles (Initiate, Apprentice, Journeyman, Erudite, Master) = 5 ranks
 * - Tiered progression (Bronze, Silver,Gold, Platinum, Diamond) within each category = 4×5 = 20 ranks  
 * - Total: 25 ranks (5 Discord roles + 20 tier variants)
 */

import { LucideIcon, Sprout, Flame, Compass, BookOpen, Crown } from 'lucide-react'

export type RankTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond'
export type RankCategory = 'Initiate' | 'Apprentice' | 'Journeyman' | 'Erudite' | 'Master'

export interface GamifiedRank {
    category: RankCategory
    tier: RankTier | null // null for base Discord roles
    displayName: string
    minXp: number
    maxXp: number
    color: string
    gradient: string
    icon: LucideIcon
    tierEmoji?: string
    isDiscordRole: boolean
}

export const RANK_THRESHOLDS: GamifiedRank[] = [
    // Initiate - Base Discord Role (0-999 XP)
    {
        category: 'Initiate',
        tier: null,
        displayName: 'Initiate',
        minXp: 0,
        maxXp: 999,
        color: '#94a3b8',
        gradient: 'from-slate-400 to-slate-500',
        icon: Sprout,
        isDiscordRole: true,
    },

    // Apprentice - Base Discord Role (1,000-1,599 XP)
    {
        category: 'Apprentice',
        tier: null,
        displayName: 'Apprentice',
        minXp: 1000,
        maxXp: 1599,
        color: '#f97316',
        gradient: 'from-orange-500 to-orange-600',
        icon: Flame,
        isDiscordRole: true,
    },

    // Apprentice Tiers (1,600-4,999 XP)
    {
        category: 'Apprentice',
        tier: 'Bronze',
        displayName: 'Bronze Apprentice',
        minXp: 1600,
        maxXp: 2199,
        color: '#cd7f32',
        gradient: 'from-amber-600 to-amber-700',
        icon: Flame,
        tierEmoji: '🥉',
        isDiscordRole: false,
    },
    {
        category: 'Apprentice',
        tier: 'Silver',
        displayName: 'Silver Apprentice',
        minXp: 2200,
        maxXp: 2899,
        color: '#c0c0c0',
        gradient: 'from-gray-300 to-gray-400',
        icon: Flame,
        tierEmoji: '🥈',
        isDiscordRole: false,
    },
    {
        category: 'Apprentice',
        tier: 'Gold',
        displayName: 'Gold Apprentice',
        minXp: 2900,
        maxXp: 3799,
        color: '#ffd700',
        gradient: 'from-yellow-400 to-yellow-500',
        icon: Flame,
        tierEmoji: '🥇',
        isDiscordRole: false,
    },
    {
        category: 'Apprentice',
        tier: 'Platinum',
        displayName: 'Platinum Apprentice',
        minXp: 3800,
        maxXp: 4599,
        color: '#e5e4e2',
        gradient: 'from-slate-200 to-slate-300',
        icon: Flame,
        tierEmoji: '💠',
        isDiscordRole: false,
    },
    {
        category: 'Apprentice',
        tier: 'Diamond',
        displayName: 'Diamond Apprentice',
        minXp: 4600,
        maxXp: 4999,
        color: '#b9f2ff',
        gradient: 'from-cyan-300 to-cyan-400',
        icon: Flame,
        tierEmoji: '💎',
        isDiscordRole: false,
    },

    // Journeyman - Base Discord Role (5,000-6,999 XP)
    {
        category: 'Journeyman',
        tier: null,
        displayName: 'Journeyman',
        minXp: 5000,
        maxXp: 6999,
        color: '#3b82f6',
        gradient: 'from-blue-500 to-blue-600',
        icon: Compass,
        isDiscordRole: true,
    },

    // Journeyman Tiers (7,000-19,999 XP)
    {
        category: 'Journeyman',
        tier: 'Bronze',
        displayName: 'Bronze Journeyman',
        minXp: 7000,
        maxXp: 9499,
        color: '#cd7f32',
        gradient: 'from-amber-600 to-amber-700',
        icon: Compass,
        tierEmoji: '🥉',
        isDiscordRole: false,
    },
    {
        category: 'Journeyman',
        tier: 'Silver',
        displayName: 'Silver Journeyman',
        minXp: 9500,
        maxXp: 11999,
        color: '#c0c0c0',
        gradient: 'from-gray-300 to-gray-400',
        icon: Compass,
        tierEmoji: '🥈',
        isDiscordRole: false,
    },
    {
        category: 'Journeyman',
        tier: 'Gold',
        displayName: 'Gold Journeyman',
        minXp: 12000,
        maxXp: 15999,
        color: '#ffd700',
        gradient: 'from-yellow-400 to-yellow-500',
        icon: Compass,
        tierEmoji: '🥇',
        isDiscordRole: false,
    },
    {
        category: 'Journeyman',
        tier: 'Platinum',
        displayName: 'Platinum Journeyman',
        minXp: 16000,
        maxXp: 18499,
        color: '#e5e4e2',
        gradient: 'from-slate-200 to-slate-300',
        icon: Compass,
        tierEmoji: '💠',
        isDiscordRole: false,
    },
    {
        category: 'Journeyman',
        tier: 'Diamond',
        displayName: 'Diamond Journeyman',
        minXp: 18500,
        maxXp: 19999,
        color: '#b9f2ff',
        gradient: 'from-cyan-300 to-cyan-400',
        icon: Compass,
        tierEmoji: '💎',
        isDiscordRole: false,
    },

    // Erudite - Base Discord Role (20,000-27,999 XP)
    {
        category: 'Erudite',
        tier: null,
        displayName: 'Erudite',
        minXp: 20000,
        maxXp: 27999,
        color: '#8b5cf6',
        gradient: 'from-violet-500 to-violet-600',
        icon: BookOpen,
        isDiscordRole: true,
    },

    // Erudite Tiers (28,000-74,999 XP)
    {
        category: 'Erudite',
        tier: 'Bronze',
        displayName: 'Bronze Erudite',
        minXp: 28000,
        maxXp: 37999,
        color: '#cd7f32',
        gradient: 'from-amber-600 to-amber-700',
        icon: BookOpen,
        tierEmoji: '🥉',
        isDiscordRole: false,
    },
    {
        category: 'Erudite',
        tier: 'Silver',
        displayName: 'Silver Erudite',
        minXp: 38000,
        maxXp: 46999,
        color: '#c0c0c0',
        gradient: 'from-gray-300 to-gray-400',
        icon: BookOpen,
        tierEmoji: '🥈',
        isDiscordRole: false,
    },
    {
        category: 'Erudite',
        tier: 'Gold',
        displayName: 'Gold Erudite',
        minXp: 47000,
        maxXp: 59999,
        color: '#ffd700',
        gradient: 'from-yellow-400 to-yellow-500',
        icon: BookOpen,
        tierEmoji: '🥇',
        isDiscordRole: false,
    },
    {
        category: 'Erudite',
        tier: 'Platinum',
        displayName: 'Platinum Erudite',
        minXp: 60000,
        maxXp: 69999,
        color: '#e5e4e2',
        gradient: 'from-slate-200 to-slate-300',
        icon: BookOpen,
        tierEmoji: '💠',
        isDiscordRole: false,
    },
    {
        category: 'Erudite',
        tier: 'Diamond',
        displayName: 'Diamond Erudite',
        minXp: 70000,
        maxXp: 74999,
        color: '#b9f2ff',
        gradient: 'from-cyan-300 to-cyan-400',
        icon: BookOpen,
        tierEmoji: '💎',
        isDiscordRole: false,
    },

    // Master - Base Discord Role (75,000-89,999 XP)
    {
        category: 'Master',
        tier: null,
        displayName: 'Master',
        minXp: 75000,
        maxXp: 89999,
        color: '#eab308',
        gradient: 'from-yellow-500 to-yellow-600',
        icon: Crown,
        isDiscordRole: true,
    },

    // Master Tiers (90,000+ XP)
    {
        category: 'Master',
        tier: 'Bronze',
        displayName: 'Bronze Master',
        minXp: 90000,
        maxXp: 104999,
        color: '#cd7f32',
        gradient: 'from-amber-600 to-amber-700',
        icon: Crown,
        tierEmoji: '🥉',
        isDiscordRole: false,
    },
    {
        category: 'Master',
        tier: 'Silver',
        displayName: 'Silver Master',
        minXp: 105000,
        maxXp: 124999,
        color: '#c0c0c0',
        gradient: 'from-gray-300 to-gray-400',
        icon: Crown,
        tierEmoji: '🥈',
        isDiscordRole: false,
    },
    {
        category: 'Master',
        tier: 'Gold',
        displayName: 'Gold Master',
        minXp: 125000,
        maxXp: 149999,
        color: '#ffd700',
        gradient: 'from-yellow-400 to-yellow-500',
        icon: Crown,
        tierEmoji: '🥇',
        isDiscordRole: false,
    },
    {
        category: 'Master',
        tier: 'Platinum',
        displayName: 'Platinum Master',
        minXp: 150000,
        maxXp: 199999,
        color: '#e5e4e2',
        gradient: 'from-slate-200 to-slate-300',
        icon: Crown,
        tierEmoji: '💠',
        isDiscordRole: false,
    },
    {
        category: 'Master',
        tier: 'Diamond',
        displayName: 'Diamond Master',
        minXp: 200000,
        maxXp: Infinity,
        color: '#b9f2ff',
        gradient: 'from-cyan-300 to-cyan-400',
        icon: Crown,
        tierEmoji: '💎',
        isDiscordRole: false,
    },
]

export function getGamifiedRank(totalXp: number): GamifiedRank {
    const rank = RANK_THRESHOLDS.find(
        (r) => totalXp >= r.minXp && totalXp <= r.maxXp
    )
    return rank || RANK_THRESHOLDS[0]
}

export function getNextRank(currentRank: GamifiedRank): GamifiedRank | null {
    const currentIndex = RANK_THRESHOLDS.findIndex(
        (r) => r.displayName === currentRank.displayName
    )
    if (currentIndex === -1 || currentIndex === RANK_THRESHOLDS.length - 1) {
        return null
    }
    return RANK_THRESHOLDS[currentIndex + 1]
}

export function calculateRankProgress(totalXp: number): {
    currentRank: GamifiedRank
    nextRank: GamifiedRank | null
    currentXp: number
    requiredXp: number
    progressPercentage: number
    remainingXp: number
} {
    const currentRank = getGamifiedRank(totalXp)
    const nextRank = getNextRank(currentRank)

    if (!nextRank) {
        return {
            currentRank,
            nextRank: null,
            currentXp: totalXp,
            requiredXp: currentRank.maxXp === Infinity ? totalXp : currentRank.maxXp,
            progressPercentage: 100,
            remainingXp: 0,
        }
    }

    const currentXp = totalXp
    const requiredXp = nextRank.minXp
    const progressPercentage = Math.min(100, Math.max(0, (currentXp / requiredXp) * 100))

    return {
        currentRank,
        nextRank,
        currentXp,
        requiredXp,
        progressPercentage,
        remainingXp: Math.max(0, requiredXp - currentXp),
    }
}

export function getRanksInCategory(category: RankCategory): GamifiedRank[] {
    return RANK_THRESHOLDS.filter((r) => r.category === category)
}

export function getDiscordRoles(): GamifiedRank[] {
    return RANK_THRESHOLDS.filter((r) => r.isDiscordRole)
}

export function getDiscordRole(totalXp: number): string {
    const rank = getGamifiedRank(totalXp)
    return rank.category
}

export function formatXP(xp: number): string {
    return xp.toLocaleString('en-US')
}
