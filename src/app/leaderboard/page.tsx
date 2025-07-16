'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import AuthGuard from '@/components/Auth/AuthGuard'
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
  Calendar
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
}

export default function LeaderboardPage() {
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats | null>(null)
  const [allTimeLeaders, setAllTimeLeaders] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLeaderboardData()
  }, [])

  const fetchLeaderboardData = async () => {
    try {
      const response = await fetch('/api/leaderboard')
      if (response.ok) {
        const data = await response.json()
        setWeeklyStats(data.weeklyStats)
        setAllTimeLeaders(data.allTimeLeaders || [])
      }
    } catch (error) {
      console.error('Error fetching leaderboard:', error)
    } finally {
      setLoading(false)
    }
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

  const getStreakColor = (streak: number) => {
    if (streak >= 4) return 'text-destructive'
    if (streak >= 2) return 'text-secondary-foreground'
    return 'text-muted-foreground'
  }

  if (loading) {
    return (
      <AuthGuard>
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
      </AuthGuard>
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

          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Compete with fellow scholars and earn your place on the leaderboard
          </p>
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
        <Tabs defaultValue="weekly" className="space-y-6">
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
                          <AvatarImage src={`/avatars/${weeklyStats.topPerformers[1]?.username}.svg`} />
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
                          <AvatarImage src={`/avatars/${weeklyStats.topPerformers[0]?.username}.svg`} />
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
                          <AvatarImage src={`/avatars/${weeklyStats.topPerformers[2]?.username}.svg`} />
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
                    {weeklyStats.topPerformers.map((entry, index) => (
                      <div key={entry.username} className="flex items-center space-x-4 p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex items-center justify-center w-10 h-10">
                          {getRankIcon(entry.rank)}
                        </div>
                        
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={`/avatars/${entry.username}.svg`} />
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
                    {allTimeLeaders.map((entry, index) => (
                      <div key={entry.username} className="flex items-center space-x-4 p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex items-center justify-center w-10 h-10">
                          {getRankIcon(entry.rank)}
                        </div>
                        
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={`/avatars/${entry.username}.svg`} />
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

