'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import AuthGuard from '@/components/Auth/AuthGuard'
import { useAuth } from '@/contexts/AuthContext'
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

interface LeaderboardEntry {
  rank: number
  username: string
  totalXp: number
  weeklyXp: number
  streak: number
  submissions: number
  reviews: number
}

interface WeeklyStats {
  activeParticipants: number
  totalXpAwarded: number
  averageXp: number
  topPerformers: LeaderboardEntry[]
  pagination?: PaginationInfo
}

export default function LeaderboardPage() {
  const { user } = useAuth()
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null)
  const [allTimeLeaders, setAllTimeLeaders] = useState<LeaderboardEntry[]>([])
  const [allTimePagination, setAllTimePagination] = useState<PaginationInfo | null>(null)
  const [currentUserPosition, setCurrentUserPosition] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [weeklyPage, setWeeklyPage] = useState(1)
  const [allTimePage, setAllTimePage] = useState(1)
  const [pageSize] = useState(20)
  const [activeTab, setActiveTab] = useState('weekly')

  // Separate useEffect for initial load
  useEffect(() => {
    fetchLeaderboardData()
  }, [])

  // Separate useEffect for pagination changes
  useEffect(() => {
    if (!loading) {
      fetchLeaderboardData()
    }
  }, [weeklyPage, allTimePage])

  const fetchCurrentUserPosition = async () => {
    if (!user) {
      console.log('No user available for position fetch')
      return null
    }

    try {
      console.log('Fetching user position for user:', user.id)
      const data = await apiGet('/api/leaderboard/user-position?type=both')
      console.log('User position data received:', data)
      return data
    } catch (error) {
      console.error('Error fetching user position:', error)
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
  }

  const fetchLeaderboardData = async () => {
    try {
      setLoading(true)

      // Fetch weekly data
      const weeklyParams = new URLSearchParams({
        page: weeklyPage.toString(),
        limit: pageSize.toString(),
        type: 'weekly'
      })

      // Fetch all-time data
      const allTimeParams = new URLSearchParams({
        page: allTimePage.toString(),
        limit: pageSize.toString(),
        type: 'alltime'
      })

      const [weeklyResponse, allTimeResponse, userPosition] = await Promise.all([
        fetch(`/api/leaderboard?${weeklyParams.toString()}`),
        fetch(`/api/leaderboard?${allTimeParams.toString()}`),
        fetchCurrentUserPosition()
      ])

      if (weeklyResponse.ok && allTimeResponse.ok) {
        const [weeklyData, allTimeData] = await Promise.all([
          weeklyResponse.json(),
          allTimeResponse.json()
        ])

        setWeeklyStats(weeklyData.data?.weeklyStats || null)
        setAllTimeLeaders(allTimeData.data?.allTimeLeaders || [])
        setAllTimePagination(allTimeData.data?.allTimePagination || null)
        setCurrentUserPosition(userPosition)
      }
    } catch (error) {
      console.error('Error fetching leaderboard:', error)
    } finally {
      setLoading(false)
    }
  }

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

        <div className="flex items-center space-x-4 p-4 rounded-lg bg-gradient-to-r from-primary/10 to-primary/5 border-2 border-primary/20 shadow-lg">
          <div className="flex items-center justify-center w-10 h-10">
            {getRankIcon(userData.rank)}
          </div>

          <Avatar className="h-10 w-10 ring-2 ring-primary/30">
            <AvatarImage src={userInfo.profileImageUrl} />
            <AvatarFallback className="bg-primary text-primary-foreground font-bold">
              {userInfo.username?.slice(0, 2).toUpperCase() || 'ME'}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-bold text-primary">You ({userInfo.username})</p>
              <Badge variant="default" className="text-xs bg-primary">
                Rank #{userData.rank}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>
                {type === 'weekly'
                  ? `${userData.totalParticipants || 0} participants this week`
                  : `${userData.totalUsers || 0} total users`
                }
              </span>
            </div>
          </div>

          <div className="text-right">
            <p className="text-lg font-bold text-primary">{userData.xp.toLocaleString()} XP</p>
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
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
      <div className="min-h-screen bg-background">
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

        {/* Weekly Stats */}
        {weeklyStats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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

        {/* Leaderboard Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
            <TabsTrigger value="weekly" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Current Week
            </TabsTrigger>
            <TabsTrigger value="alltime" className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              All Time
            </TabsTrigger>
          </TabsList>

          <TabsContent value="weekly" className="space-y-6">
            {/* Top 3 Podium */}
            {weeklyStats?.topPerformers && weeklyStats.topPerformers.length >= 3 && (
              <Card className="border-0 shadow-xl bg-gradient-to-r from-muted/50 to-muted">
                <CardHeader className="text-center">
                  <CardTitle className="flex items-center justify-center gap-2">
                    <Crown className="h-6 w-6 text-primary" />
                    Top Performers This Week
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-center items-end space-x-8">
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
                      <p className="font-semibold">{weeklyStats.topPerformers[1]?.username}</p>
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
                      <p className="font-bold text-lg">{weeklyStats.topPerformers[0]?.username}</p>
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
                      <p className="font-semibold">{weeklyStats.topPerformers[2]?.username}</p>
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
                    {weeklyStats.topPerformers.map((entry, index) => (
                      <div key={entry.username} className="flex items-center space-x-4 p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex items-center justify-center w-10 h-10">
                          {getRankIcon(entry.rank)}
                        </div>
                        
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            {entry.username.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold">{entry.username}</p>
                            {entry.streak > 0 && (
                              <Badge variant="outline" className={`text-xs ${getStreakColor(entry.streak)}`}>
                                🔥 {entry.streak} week{entry.streak > 1 ? 's' : ''}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>{entry.submissions} submissions</span>
                            <span>{entry.reviews} reviews</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-lg font-bold text-primary">{entry.weeklyXp} XP</p>
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
                    {allTimeLeaders.map((entry, index) => (
                      <div key={entry.username} className="flex items-center space-x-4 p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex items-center justify-center w-10 h-10">
                          {getRankIcon(entry.rank)}
                        </div>
                        
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary text-primary-foreground">
                            {entry.username.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold">{entry.username}</p>
                            <Badge variant={getRankBadgeVariant(entry.rank)} className="text-xs">
                              Rank #{entry.rank}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>{entry.submissions} total submissions</span>
                            <span>{entry.reviews} total reviews</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-lg font-bold text-primary">{entry.totalXp.toLocaleString()} XP</p>
                          <p className="text-xs text-muted-foreground">all time</p>
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

Date.prototype.getWeek = function() {
  const date = new Date(this.getTime())
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7)
  const week1 = new Date(date.getFullYear(), 0, 4)
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}

