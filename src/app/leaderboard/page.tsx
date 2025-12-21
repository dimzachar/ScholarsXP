'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import MonthlyLeaderboard from '@/components/leaderboard/MonthlyLeaderboardNew'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
// import { Progress } from '@/components/ui/progress'
import AuthGuard from '@/components/Auth/AuthGuard'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { Pagination, PaginationInfo } from '@/components/ui/pagination'
import { apiGet } from '@/lib/api-client'
import Link from 'next/link'
import {
  Trophy,
  Medal,
  Award,
  TrendingUp,
  Users,
  Zap,
  Crown,
  Star,
  Target,
  Calendar,
  BarChart3
} from 'lucide-react'
import { getGamifiedRank, getDiscordRoles } from '@/lib/gamified-ranks'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface LeaderboardEntry {
  rank: number
  username: string
  totalXp: number
  weeklyXp: number
  streak: number
  submissions: number
  reviews: number
}

export const normalizeLeaderboardEntries = (entries: Record<string, unknown>[] = []): LeaderboardEntry[] =>
  entries.map((entry) => ({
    ...(entry as unknown as LeaderboardEntry),
    submissions: (entry.submissions ?? entry.totalSubmissions ?? entry.submissionCount ?? 0) as number,
    reviews: (entry.reviews ?? entry.reviewCount ?? entry.reviewsCount ?? 0) as number
  }))

interface WeeklyStats {
  activeParticipants: number
  totalXpAwarded: number
  averageXp: number
  topPerformers: LeaderboardEntry[]
  pagination?: PaginationInfo
}

interface AllTimeStats {
  activeParticipants: number
  totalXpAwarded: number
  averageXp: number
}

interface UserPosition {
  user: {
    id: string
    username: string
    email: string
    totalXp: number
    profileImageUrl: string | null
  }
  weekly: {
    rank: number
    xp: number
    totalParticipants: number
  }
  allTime: {
    rank: number
    xp: number
    totalUsers: number
  }
}

export default function LeaderboardPage() {
  const { user } = usePrivyAuthSync()
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null)
  const [allTimeLeaders, setAllTimeLeaders] = useState<LeaderboardEntry[]>([])
  const [allTimePagination, setAllTimePagination] = useState<PaginationInfo | null>(null)
  const [allTimeStats, setAllTimeStats] = useState<AllTimeStats | null>(null)
  const [currentUserPosition, setCurrentUserPosition] = useState<UserPosition | null>(null)
  const [loading, setLoading] = useState(true)
  const [weeklyPage, setWeeklyPage] = useState(1)
  const [allTimePage, setAllTimePage] = useState(1)
  const [pageSize] = useState(20)
  const [activeTab, setActiveTab] = useState('weekly')

  // Fetch current user position (defined first to avoid TDZ in deps)
  const fetchCurrentUserPosition = useCallback(async () => {
    if (!user) {
      // console.log('No user available for position fetch')
      return null
    }

    try {
      // console.log('Fetching user position for user:', user.id)
      const data = await apiGet('/api/leaderboard/user-position?type=both')
      // console.log('User position data received:', data)
      return data
    } catch {
      // Return a default structure so the UI doesn't break
      // Return a default structure so the UI doesn't break
      return {
        user: {
          id: user.id,
          username: user.email?.split('@')[0] || 'User',
          email: user.email,
          totalXp: 0,
          profileImageUrl: null
        },
        weekly: {
          rank: 0,
          xp: 0,
          totalParticipants: 0
        },
        allTime: {
          rank: 0,
          xp: 0,
          totalUsers: 0
        }
      }
    }
  }, [user])

  const fetchLeaderboardData = useCallback(async () => {
    try {
      setLoading(true)
      const weeklyParams = new URLSearchParams({ page: String(weeklyPage), limit: String(pageSize) })
      const allTimeParams = new URLSearchParams({ page: String(allTimePage), limit: String(pageSize) })

      const [weeklyData, allTimeData, userPos] = await Promise.all([
        apiGet(`/api/leaderboard?type=weekly&${weeklyParams}`),
        apiGet(`/api/leaderboard?type=alltime&${allTimeParams}`),
        fetchCurrentUserPosition(),
      ])

      const rawWeeklyStats = weeklyData?.data?.weeklyStats || weeklyData?.weeklyStats || weeklyData
      if (rawWeeklyStats) {
        setWeeklyStats({
          ...rawWeeklyStats,
          topPerformers: normalizeLeaderboardEntries(rawWeeklyStats.topPerformers ?? [])
        })
      } else {
        setWeeklyStats(null)
      }

      const rawAllTimeLeaders =
        allTimeData?.data?.items ||
        allTimeData?.items ||
        allTimeData?.data?.allTimeLeaders ||
        allTimeData?.allTimeLeaders ||
        []

      setAllTimeLeaders(normalizeLeaderboardEntries(rawAllTimeLeaders))
      setAllTimePagination(
        allTimeData?.data?.pagination ||
        allTimeData?.pagination ||
        allTimeData?.data?.allTimePagination ||
        allTimeData?.allTimePagination ||
        null
      )
      setAllTimeStats(
        allTimeData?.data?.stats ||
        allTimeData?.stats ||
        allTimeData?.data?.allTimeStats ||
        allTimeData?.allTimeStats ||
        null
      )
      setCurrentUserPosition(userPos)
    } catch (e) {
      console.error('Error fetching leaderboard data', e)
    } finally {
      setLoading(false)
    }
  }, [weeklyPage, allTimePage, pageSize, fetchCurrentUserPosition])

  // Fetch on mount and when dependencies of fetchLeaderboardData change
  // (includes weeklyPage, allTimePage, pageSize, and user via fetchCurrentUserPosition)
  useEffect(() => { fetchLeaderboardData() }, [fetchLeaderboardData])

  // fetchCurrentUserPosition defined above

  // legacy fetchLeaderboardData removed; using useCallback version above

  const handleWeeklyPageChange = (page: number) => {
    setWeeklyPage(page)
  }

  const handleAllTimePageChange = (page: number) => {
    setAllTimePage(page)
  }

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-5 w-5 text-primary" />
    if (rank === 2) return <Medal className="h-5 w-5 text-muted-foreground" />
    if (rank === 3) return <Award className="h-5 w-5 text-secondary-foreground" />
    return <span className="text-sm font-bold text-muted-foreground">#{rank}</span>
  }

  const getRankBadgeVariant = (rank: number) => {
    if (rank === 1) return 'default'
    if (rank === 2) return 'secondary'
    if (rank === 3) return 'outline'
    return 'outline'
  }

  // Component for rendering the highlighted current user row
  const CurrentUserHighlight = ({ type }: { type: 'weekly' | 'alltime' }) => {
    if (!currentUserPosition || !user) {
      console.log('CurrentUserHighlight: No position data or user', { currentUserPosition, user: !!user })
      return null
    }

    const userData = type === 'weekly' ? currentUserPosition.weekly : currentUserPosition.allTime
    if (!userData || userData.rank === 0) {
      console.log(`CurrentUserHighlight: No ${type} data or rank is 0`, userData)
      return null
    }

    const userInfo = currentUserPosition.user
    if (!userInfo) {
      console.log('CurrentUserHighlight: No user info', userInfo)
      return null
    }

    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent flex-1" />
          <span className="text-sm font-medium text-primary px-3 py-1 bg-primary/10 rounded-full">
            Your Position
          </span>
          <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent flex-1" />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 border-2 border-primary/20 shadow-lg">
          <div className="flex items-center justify-center w-10 h-10">
            {getRankIcon(userData.rank)}
          </div>

          <Avatar className="h-10 w-10 ring-2 ring-primary/30">
            <AvatarImage src={userInfo.profileImageUrl || undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground font-bold">
              {userInfo.username?.slice(0, 2).toUpperCase() || 'ME'}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-bold text-primary truncate">You ({userInfo.username})</p>
              <Badge variant="default" className="text-[10px] sm:text-xs bg-primary whitespace-nowrap">
                Rank #{userData.rank}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
              <span>
                {type === 'weekly'
                  ? `${(userData as UserPosition['weekly']).totalParticipants || 0} participants this week`
                  : `${(userData as UserPosition['allTime']).totalUsers || 0} total users`
                }
              </span>
            </div>
          </div>

          <div className="w-full sm:w-auto sm:text-right">
            <p className="text-base sm:text-lg font-bold text-primary">{userData.xp.toLocaleString()} XP</p>
            <p className="text-xs text-muted-foreground">
              {type === 'weekly' ? 'this week' : 'all time'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const getStreakColor = (streak: number) => {
    if (streak >= 4) return 'text-destructive'
    if (streak >= 2) return 'text-secondary-foreground'
    return 'text-muted-foreground'
  }

  // Rank Progression Component
  const RankProgression = () => {
    const discordRoles = getDiscordRoles()
    const userXp = currentUserPosition?.allTime?.xp || currentUserPosition?.user?.totalXp || 0
    const userRank = getGamifiedRank(userXp)
    const currentRankIndex = userRank ? discordRoles.findIndex(r => r.category === userRank.category) : 0
    
    // Progress line width: percentage based on current rank position (0-100%)
    // 5 nodes = 4 segments, each segment is 25%
    const progressWidth = (currentRankIndex / (discordRoles.length - 1)) * 100
    
    // Build gradient that only includes colors up to current rank
    // Each rank takes equal portion of the gradient
    const buildProgressGradient = (direction: 'right' | 'bottom' = 'right') => {
      if (currentRankIndex === 0) return discordRoles[0].color
      const colors = discordRoles.slice(0, currentRankIndex + 1).map((role, i) => {
        const percent = (i / currentRankIndex) * 100
        return `${role.color} ${percent}%`
      })
      return `linear-gradient(to ${direction}, ${colors.join(', ')})`
    }
    
    // Next rank info
    const nextRankCategory = discordRoles[currentRankIndex + 1]
    const nextRankXp = nextRankCategory?.minXp || userXp
    const remainingXp = Math.max(0, nextRankXp - userXp)
    
    // Calculate progress percentage: userXp / nextRankXp * 100, rounded
    const progressPercent = nextRankCategory 
      ? Math.round((userXp / nextRankXp) * 100)
      : 100
    
    // Calculate user's percentile rank (top X%)
    const userRankPosition = currentUserPosition?.allTime?.rank || 0
    const totalUsers = currentUserPosition?.allTime?.totalUsers || 1
    const topPercent = totalUsers > 0 ? Math.max(1, Math.round((userRankPosition / totalUsers) * 100)) : 0

    // Render a single rank node for desktop (with tooltip)
    const DesktopRankNode = ({ role, index }: { role: typeof discordRoles[0], index: number }) => {
      const Icon = role.icon
      const isPast = index < currentRankIndex
      const isCurrent = index === currentRankIndex
      const isFuture = index > currentRankIndex
      
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`flex flex-col items-center ${isFuture ? 'opacity-60 hover:opacity-100' : ''} transition-opacity cursor-pointer group`}>
                {/* Icon circle */}
                <div 
                  className={`
                    flex items-center justify-center rounded-full mb-3 transition-transform hover:scale-110 shrink-0
                    ${isCurrent ? 'w-14 h-14' : 'w-10 h-10'}
                  `}
                  style={{ 
                    background: isCurrent 
                      ? `linear-gradient(to bottom right, ${role.color}, ${role.color}dd)` 
                      : isPast 
                        ? 'hsl(var(--background))' 
                        : 'hsl(var(--muted))',
                    border: isCurrent 
                      ? '4px solid hsl(var(--background))' 
                      : `2px solid ${isPast ? role.color : 'hsl(var(--border))'}`  ,
                    boxShadow: isCurrent ? `0 0 15px ${role.color}50` : 'none',
                    color: isCurrent ? 'white' : isPast ? role.color : 'hsl(var(--muted-foreground))'
                  }}
                >
                  <Icon 
                    className={isCurrent ? 'h-6 w-6' : 'h-4 w-4'}
                    strokeWidth={2.5}
                  />
                </div>
                
                {/* Label */}
                <span 
                  className={`text-xs font-bold uppercase tracking-wider ${isFuture ? 'group-hover:text-foreground' : ''}`}
                  style={{ color: isPast || isCurrent ? role.color : undefined }}
                >
                  {role.category}
                </span>
                
                {/* Current rank badge */}
                {isCurrent && (
                  <div className="absolute -bottom-6 bg-muted text-muted-foreground text-[10px] px-2 py-0.5 rounded border border-border whitespace-nowrap">
                    Current Rank
                  </div>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-semibold">{role.displayName}</p>
              <p className="text-xs text-muted-foreground">
                {role.minXp.toLocaleString()} - {role.maxXp === Infinity ? '∞' : role.maxXp.toLocaleString()} XP
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )
    }
    
    // Render a single rank node for mobile (no tooltip, info shown inline)
    const MobileRankNode = ({ role, index }: { role: typeof discordRoles[0], index: number }) => {
      const Icon = role.icon
      const isPast = index < currentRankIndex
      const isCurrent = index === currentRankIndex
      const isFuture = index > currentRankIndex
      
      return (
        <div className={`flex flex-row items-center gap-4 ${isFuture ? 'opacity-50' : ''} transition-opacity`}>
          {/* Icon circle */}
          <div 
            className={`
              flex items-center justify-center rounded-full shrink-0 z-10
              ${isCurrent ? 'w-11 h-11' : 'w-9 h-9'}
            `}
            style={{ 
              background: isCurrent 
                ? `linear-gradient(to bottom right, ${role.color}, ${role.color}dd)` 
                : isPast 
                  ? 'hsl(var(--background))' 
                  : 'hsl(var(--muted))',
              border: isCurrent 
                ? '3px solid hsl(var(--background))' 
                : `2px solid ${isPast ? role.color : 'hsl(var(--border))'}`  ,
              boxShadow: isCurrent ? `0 0 12px ${role.color}50` : 'none',
              color: isCurrent ? 'white' : isPast ? role.color : 'hsl(var(--muted-foreground))'
            }}
          >
            <Icon 
              className={isCurrent ? 'h-5 w-5' : 'h-4 w-4'}
              strokeWidth={2.5}
            />
          </div>
          
          {/* Label */}
          <div className="flex items-center gap-2">
            <span 
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: isPast || isCurrent ? role.color : undefined }}
            >
              {role.category}
            </span>
            {isCurrent && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                You
              </span>
            )}
          </div>
        </div>
      )
    }

    return (
      <Card className="border-0 shadow-xl overflow-hidden">
        <CardContent className="p-4 sm:p-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
            <div>
              <h2 className="text-lg sm:text-xl font-bold flex flex-wrap items-center gap-2">
                Rank Progression
                {userRank && (
                  <span 
                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border"
                    style={{ 
                      backgroundColor: `${userRank.color}15`,
                      color: userRank.color,
                      borderColor: `${userRank.color}30`
                    }}
                  >
                    {userRank.category}
                  </span>
                )}
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                {topPercent > 0 ? `You are in the top ${topPercent}% of scholars.` : 'Start earning XP to unlock ranks!'}
              </p>
            </div>
            <Link href="/ranks" className="text-sm font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1 group">
              View all 25 ranks
              <span className="transform group-hover:translate-x-1 transition-transform">→</span>
            </Link>
          </div>

          {/* Mobile: Vertical Progress Track */}
          <div className="block md:hidden relative py-2">
            {/* Vertical background line - positioned to align with icon centers (icon is 36px/44px, center at ~18-22px from left edge of icon) */}
            <div className="absolute left-[18px] top-5 bottom-5 w-1 bg-muted rounded-full z-0" />
            {/* Vertical progress line - fills through current rank node center */}
            {currentRankIndex > 0 && (
              <div 
                className="absolute left-[18px] top-5 w-1 rounded-full z-0 transition-all duration-1000 ease-out"
                style={{ 
                  // Calculate height: (currentIndex / totalSegments) * available height
                  // Available height is container minus top/bottom padding (40px total)
                  height: `calc(${(currentRankIndex / (discordRoles.length - 1)) * 100}% - 40px)`,
                  background: buildProgressGradient('bottom')
                }}
              />
            )}
            
            {/* Rank nodes - vertical with even spacing */}
            <div className="relative flex flex-col gap-4">
              {discordRoles.map((role, index) => (
                <MobileRankNode key={role.displayName} role={role} index={index} />
              ))}
            </div>
          </div>

          {/* Desktop: Horizontal Progress Track */}
          <div className="hidden md:block relative px-6 py-4">
            {/* Background line */}
            <div className="absolute top-1/2 left-0 w-full h-1 bg-muted -translate-y-1/2 rounded-full z-0" />
            {/* Progress line with gradient */}
            <div 
              className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full z-0 transition-all duration-1000 ease-out"
              style={{ 
                width: `${progressWidth}%`,
                background: buildProgressGradient('right')
              }}
            />
            
            {/* Rank nodes - horizontal */}
            <div className="relative z-10 flex justify-between items-center w-full">
              {discordRoles.map((role, index) => (
                <DesktopRankNode key={role.displayName} role={role} index={index} />
              ))}
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-8 md:mt-10 grid grid-cols-3 gap-2 sm:gap-4 border-t border-border pt-4 sm:pt-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-2 sm:gap-3 text-center sm:text-left">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div>
                <div className="text-[10px] sm:text-xs text-muted-foreground uppercase font-semibold">Next Rank</div>
                <div className="font-bold text-sm sm:text-lg">{nextRankXp.toLocaleString()}</div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-2 sm:gap-3 text-center sm:text-left">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Zap className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div>
                <div className="text-[10px] sm:text-xs text-muted-foreground uppercase font-semibold">Your XP</div>
                <div className="font-bold text-sm sm:text-lg">{userXp.toLocaleString()}</div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-2 sm:gap-3 text-center sm:text-left">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded bg-muted/50 flex items-center justify-center text-muted-foreground shrink-0">
                <Target className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div>
                <div className="text-[10px] sm:text-xs text-muted-foreground uppercase font-semibold">Remaining</div>
                <div className="font-bold text-sm sm:text-lg text-muted-foreground">{remainingXp.toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          {nextRankCategory && discordRoles[currentRankIndex] && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Progress to {nextRankCategory.category}</span>
                <span style={{ color: discordRoles[currentRankIndex].color }}>{progressPercent}%</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%`, backgroundColor: discordRoles[currentRankIndex].color }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted overflow-x-hidden">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Trophy className="h-4 w-4" />
              <span>Loading Leaderboard</span>
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-4">ScholarXP Leaderboard</h1>
            <p className="text-muted-foreground">Loading rankings...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <AuthGuard>
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted overflow-x-hidden">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Trophy className="h-4 w-4" />
              <span>Week {new Date().getWeek()}</span>
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              ScholarXP{' '}
              <span className="text-primary">
                Leaderboard
              </span>
            </h1>

            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
              Compete with fellow scholars and earn your place on the leaderboard
            </p>

            {/* Detailed View Button for Authorized Users */}
            {(user?.role === 'ADMIN' || user?.role === 'REVIEWER') && (
              <div className="flex justify-center">
                <Link href="/leaderboard/detailed">
                  <Button variant="outline" className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Detailed View
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Stats now render inside each tab for contextual accuracy */}

          {/* Leaderboard Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="w-full max-w-md sm:max-w-lg mx-auto grid grid-cols-3 gap-2 px-2">
              <TabsTrigger value="weekly" className="flex items-center gap-2 text-xs sm:text-sm py-1.5 sm:py-2">
                <Calendar className="h-4 w-4" />
                Current Week
              </TabsTrigger>
              <TabsTrigger value="alltime" className="flex items-center gap-2 text-xs sm:text-sm py-1.5 sm:py-2">
                <Trophy className="h-4 w-4" />
                All Time
              </TabsTrigger>
              <TabsTrigger value="monthly" className="flex items-center gap-2 text-xs sm:text-sm py-1.5 sm:py-2">
                <BarChart3 className="h-4 w-4" />
                Monthly
              </TabsTrigger>
            </TabsList>

            <TabsContent value="weekly" className="space-y-6">
              {weeklyStats && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="border-0 shadow-lg">
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-4">
                        <div className="p-3 bg-primary/20 rounded-lg">
                          <Users className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-foreground">{weeklyStats.activeParticipants}</p>
                          <p className="text-muted-foreground">Active Participants</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-lg">
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-4">
                        <div className="p-3 bg-secondary/20 rounded-lg">
                          <Zap className="h-6 w-6 text-secondary-foreground" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-foreground">{weeklyStats.totalXpAwarded.toLocaleString()}</p>
                          <p className="text-muted-foreground">Total XP Awarded</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-lg">
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-4">
                        <div className="p-3 bg-accent/20 rounded-lg">
                          <TrendingUp className="h-6 w-6 text-accent-foreground" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-foreground">{Math.round(weeklyStats.averageXp)}</p>
                          <p className="text-muted-foreground">Average XP</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
              {/* Top 3 Podium */}
              {weeklyStats?.topPerformers && weeklyStats.topPerformers.length >= 3 && (
                <Card className="border-0 shadow-xl">
                  <CardHeader className="text-center">
                    <CardTitle className="flex items-center justify-center gap-2">
                      <Crown className="h-6 w-6 text-primary" />
                      Top Performers This Week
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col sm:flex-row justify-center items-center sm:items-end gap-6 sm:gap-8">
                      {/* 2nd Place */}
                      <div className="text-center">
                        <div className="relative">
                          <Avatar className="h-16 w-16 mx-auto mb-2 ring-4 ring-border">
                            <AvatarFallback className="bg-muted text-muted-foreground text-lg font-bold">
                              {weeklyStats.topPerformers[1]?.username.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <Badge className="absolute -top-2 -right-2 bg-secondary">2nd</Badge>
                        </div>
                        <p className="font-semibold truncate max-w-[8rem] sm:max-w-none mx-auto">{weeklyStats.topPerformers[1]?.username}</p>
                        <p className="text-sm text-muted-foreground">{weeklyStats.topPerformers[1]?.weeklyXp} XP</p>
                      </div>

                      {/* 1st Place */}
                      <div className="text-center">
                        <div className="relative">
                          <Avatar className="h-20 w-20 mx-auto mb-2 ring-4 ring-primary">
                            <AvatarFallback className="bg-primary/20 text-primary text-xl font-bold">
                              {weeklyStats.topPerformers[0]?.username.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <Badge className="absolute -top-2 -right-2 bg-primary">1st</Badge>
                          <Crown className="absolute -top-4 left-1/2 transform -translate-x-1/2 h-6 w-6 text-primary" />
                        </div>
                        <p className="font-bold text-lg truncate max-w-[10rem] sm:max-w-none mx-auto">{weeklyStats.topPerformers[0]?.username}</p>
                        <p className="text-primary font-semibold">{weeklyStats.topPerformers[0]?.weeklyXp} XP</p>
                      </div>

                      {/* 3rd Place */}
                      <div className="text-center">
                        <div className="relative">
                          <Avatar className="h-16 w-16 mx-auto mb-2 ring-4 ring-accent">
                            <AvatarFallback className="bg-accent/20 text-accent-foreground text-lg font-bold">
                              {weeklyStats.topPerformers[2]?.username.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <Badge className="absolute -top-2 -right-2 bg-accent">3rd</Badge>
                        </div>
                        <p className="font-semibold truncate max-w-[8rem] sm:max-w-none mx-auto">{weeklyStats.topPerformers[2]?.username}</p>
                        <p className="text-sm text-muted-foreground">{weeklyStats.topPerformers[2]?.weeklyXp} XP</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Weekly Rankings */}
              <Card className="border-0 shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Week {new Date().getWeek()} Rankings
                  </CardTitle>
                  <CardDescription>
                    Current week performance and standings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {weeklyStats?.topPerformers && weeklyStats.topPerformers.length > 0 ? (
                    <div className="space-y-4">
                      <CurrentUserHighlight type="weekly" />
                      {weeklyStats.topPerformers.map((entry) => (
                        <div key={entry.username} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                          <div className="flex items-center justify-center w-10 h-10">
                            {getRankIcon(entry.rank)}
                          </div>

                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-primary text-primary-foreground">
                              {entry.username.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold truncate">{entry.username}</p>
                              {entry.streak > 0 && (
                                <Badge variant="outline" className={`text-[10px] sm:text-xs ${getStreakColor(entry.streak)} whitespace-nowrap`}>
                                  🔥 {entry.streak} week{entry.streak > 1 ? 's' : ''}
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                              <span>{entry.submissions} submissions</span>
                              <span>{entry.reviews} reviews</span>
                            </div>
                          </div>

                          <div className="w-full sm:w-auto sm:text-right">
                            <p className="text-base sm:text-lg font-bold text-primary">{entry.weeklyXp} XP</p>
                            <p className="text-xs text-muted-foreground">this week</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Target className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No weekly data available yet</p>
                    </div>
                  )}

                  {/* Weekly Pagination */}
                  {weeklyStats?.pagination && weeklyStats.pagination.totalPages > 1 && (
                    <div className="mt-6 pt-6 border-t">
                      <Pagination
                        pagination={weeklyStats.pagination}
                        onPageChange={handleWeeklyPageChange}
                        loading={loading}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="alltime" className="space-y-6">
              {/* Rank Progression */}
              <RankProgression />
              
              {allTimeStats && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="border-0 shadow-lg">
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-4">
                        <div className="p-3 bg-primary/20 rounded-lg">
                          <Users className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-foreground">{allTimeStats.activeParticipants}</p>
                          <p className="text-muted-foreground">Active Users</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-lg">
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-4">
                        <div className="p-3 bg-secondary/20 rounded-lg">
                          <Zap className="h-6 w-6 text-secondary-foreground" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-foreground">{allTimeStats.totalXpAwarded.toLocaleString()}</p>
                          <p className="text-muted-foreground">Total XP Awarded</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-lg">
                    <CardContent className="p-6">
                      <div className="flex items-center space-x-4">
                        <div className="p-3 bg-accent/20 rounded-lg">
                          <TrendingUp className="h-6 w-6 text-accent-foreground" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-foreground">{Math.round(allTimeStats.averageXp)}</p>
                          <p className="text-muted-foreground">Average XP</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
              <Card className="border-0 shadow-xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5" />
                    All-Time Leaderboard
                  </CardTitle>
                  <CardDescription>
                    Hall of fame - top performers across all weeks
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {allTimeLeaders.length > 0 ? (
                    <div className="space-y-4">
                      <CurrentUserHighlight type="alltime" />
                      {allTimeLeaders.map((entry) => (
                        <div key={entry.username} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                          <div className="flex items-center justify-center w-10 h-10">
                            {getRankIcon(entry.rank)}
                          </div>

                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-primary text-primary-foreground">
                              {entry.username.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold truncate">{entry.username}</p>
                              <Badge variant={getRankBadgeVariant(entry.rank)} className="text-[10px] sm:text-xs whitespace-nowrap">
                                Rank #{entry.rank}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
                              <span>{entry.submissions} total submissions</span>
                              <span>{entry.reviews} total reviews</span>
                            </div>
                          </div>

                          <div className="w-full sm:w-auto sm:text-right">
                            <div className="flex items-center gap-2 justify-end">
                              {(() => {
                                const rank = getGamifiedRank(entry.totalXp)
                                if (!rank) return null
                                const Icon = rank.icon
                                return (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Link href="/ranks" className="cursor-pointer hover:scale-110 transition-transform">
                                          <Icon
                                            className="h-5 w-5"
                                            style={{ color: rank.color }}
                                            strokeWidth={2.5}
                                          />
                                        </Link>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="font-semibold">{rank.displayName}</p>
                                        <p className="text-xs text-muted-foreground">Click to view all ranks</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )
                              })()}
                              <p className="text-base sm:text-lg font-bold text-primary">{entry.totalXp.toLocaleString()} XP</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Star className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No all-time data available yet</p>
                    </div>
                  )}

                  {/* All-Time Pagination */}
                  {allTimePagination && allTimePagination.totalPages > 1 && (
                    <div className="mt-6 pt-6 border-t">
                      <Pagination
                        pagination={allTimePagination}
                        onPageChange={handleAllTimePageChange}
                        loading={loading}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="monthly" className="space-y-6">
              <MonthlyLeaderboard />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AuthGuard>
  )
}

// Helper function to get week number
declare global {
  interface Date {
    getWeek(): number
  }
}

Date.prototype.getWeek = function () {
  const date = new Date(this.getTime())
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7)
  const week1 = new Date(date.getFullYear(), 0, 4)
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}

