'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import SubmissionForm from '@/components/SubmissionForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Zap,
  BookOpen,
  Users,
  Trophy,
  Star,
  TrendingUp,
  LogOut,
  User,
  BarChart3,
  Target,
  Award,
  Calendar,
  Clock,
  Flame,
  ArrowUp,
  ArrowDown,
  Activity
} from 'lucide-react'

export default function DashboardPage() {
  const { user, loading, signOut, isAdmin, isReviewer } = useAuth()
  const router = useRouter()
  const [profileData, setProfileData] = useState<any>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  // Fetch comprehensive profile data
  useEffect(() => {
    if (user) {
      fetchProfileData()
    }
  }, [user])

  const fetchProfileData = async () => {
    try {
      const response = await fetch('/api/user/profile/complete')
      if (response.ok) {
        const data = await response.json()
        setProfileData(data)
      }
    } catch (error) {
      console.error('Error fetching profile data:', error)
    } finally {
      setLoadingProfile(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  // Middleware ensures user is authenticated, but show loading if user is still null
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Authenticating...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
      <div className="container mx-auto px-4 py-8">
        {/* Enhanced Header with Profile */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profileData?.profileImageUrl} />
              <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                {user.email?.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                Welcome back, {profileData?.username || user.email?.split('@')[0]}!
              </h1>
              <p className="text-muted-foreground">
                {profileData?.role || 'Scholar'} • Member since {profileData?.joinedAt ? new Date(profileData.joinedAt).toLocaleDateString() : 'Recently'}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>

        {/* Enhanced Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-lg bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-primary-foreground/70 text-sm font-medium">Total XP</p>
                  <p className="text-3xl font-bold">{profileData?.totalXp?.toLocaleString() || '0'}</p>
                  {profileData?.xpAnalytics?.weeklyTrends?.length > 1 && (
                    <div className="flex items-center mt-1">
                      <ArrowUp className="h-3 w-3 mr-1" />
                      <span className="text-xs">+{profileData.xpAnalytics.projectedWeeklyXp} this week</span>
                    </div>
                  )}
                </div>
                <Trophy className="h-10 w-10 text-primary-foreground/70" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm font-medium">This Week</p>
                  <p className="text-3xl font-bold">{profileData?.currentWeekXp || '0'}</p>
                  <div className="flex items-center mt-1">
                    <Calendar className="h-3 w-3 mr-1" />
                    <span className="text-xs">Week {Math.ceil(new Date().getDate() / 7)}</span>
                  </div>
                </div>
                <TrendingUp className="h-10 w-10 text-white/70" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-orange-500 to-red-500 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm font-medium">Streak</p>
                  <p className="text-3xl font-bold">{profileData?.streakWeeks || '0'}</p>
                  <div className="flex items-center mt-1">
                    <Flame className="h-3 w-3 mr-1" />
                    <span className="text-xs">weeks</span>
                  </div>
                </div>
                <Star className="h-10 w-10 text-white/70" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-gradient-to-br from-green-500 to-emerald-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/70 text-sm font-medium">Rank</p>
                  <p className="text-3xl font-bold">#{profileData?.xpAnalytics?.rank?.weekly || '—'}</p>
                  <div className="flex items-center mt-1">
                    <Users className="h-3 w-3 mr-1" />
                    <span className="text-xs">of {profileData?.xpAnalytics?.rank?.totalUsers || '—'}</span>
                  </div>
                </div>
                <Trophy className="h-10 w-10 text-white/70" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Enhanced Tabbed Interface */}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="submit" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Submit
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="achievements" className="flex items-center gap-2">
              <Award className="h-4 w-4" />
              Achievements
            </TabsTrigger>
            <TabsTrigger value="goals" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Goals
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Recent Activity */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingProfile ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="animate-pulse">
                          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Recent Submissions */}
                      {profileData?.recentActivity?.submissions?.slice(0, 3).map((submission: any) => (
                        <div key={submission.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                              <BookOpen className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-medium">Submission on {submission.platform}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(submission.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <Badge variant={submission.status === 'FINALIZED' ? 'default' : 'secondary'}>
                            {submission.finalXp ? `+${submission.finalXp} XP` : submission.status}
                          </Badge>
                        </div>
                      ))}

                      {/* Recent Reviews */}
                      {profileData?.recentActivity?.reviews?.slice(0, 2).map((review: any) => (
                        <div key={review.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                              <Users className="h-4 w-4 text-green-600" />
                            </div>
                            <div>
                              <p className="font-medium">Peer review completed</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(review.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-green-600">
                            +{review.xpScore} XP
                          </Badge>
                        </div>
                      ))}

                      {/* Recent Achievements */}
                      {profileData?.recentActivity?.achievements?.slice(0, 2).map((achievement: any) => (
                        <div key={achievement.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 bg-yellow-100 rounded-full flex items-center justify-center">
                              <Award className="h-4 w-4 text-yellow-600" />
                            </div>
                            <div>
                              <p className="font-medium">{achievement.achievement.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(achievement.earnedAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-yellow-600">
                            +{achievement.achievement.xpReward} XP
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions & Stats */}
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button
                      onClick={() => router.push('/review')}
                      className="w-full justify-start"
                      variant="outline"
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Review Submissions
                    </Button>
                    <Button
                      onClick={() => router.push('/leaderboard')}
                      className="w-full justify-start"
                      variant="outline"
                    >
                      <Trophy className="h-4 w-4 mr-2" />
                      View Leaderboard
                    </Button>
                    {(isAdmin || isReviewer) && (
                      <Button
                        onClick={() => router.push('/admin')}
                        className="w-full justify-start"
                        variant="outline"
                      >
                        <Star className="h-4 w-4 mr-2" />
                        Admin Panel
                      </Button>
                    )}
                  </CardContent>
                </Card>

                {/* Weekly Progress */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Weekly Progress
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {profileData?.xpAnalytics?.goalProgress ? (
                      <div className="space-y-4">
                        {profileData.xpAnalytics.goalProgress.slice(0, 3).map((goal: any) => (
                          <div key={goal.taskType} className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Task {goal.taskType}</span>
                              <span>{goal.current}/{goal.maximum}</span>
                            </div>
                            <Progress value={goal.percentage} className="h-2" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No goals data available</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Submit Tab */}
          <TabsContent value="submit" className="mt-6">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <BookOpen className="h-5 w-5" />
                  <span>Submit Your Work</span>
                </CardTitle>
                <CardDescription>
                  Share your academic content and get AI-powered evaluation plus peer feedback
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SubmissionForm />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    XP Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {profileData?.xpAnalytics?.currentWeek ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-4 bg-blue-50 rounded-lg">
                          <p className="text-2xl font-bold text-blue-600">
                            {profileData.xpAnalytics.currentWeek.submissions}
                          </p>
                          <p className="text-sm text-blue-600">Submissions</p>
                        </div>
                        <div className="text-center p-4 bg-green-50 rounded-lg">
                          <p className="text-2xl font-bold text-green-600">
                            {profileData.xpAnalytics.currentWeek.reviews}
                          </p>
                          <p className="text-sm text-green-600">Reviews</p>
                        </div>
                        <div className="text-center p-4 bg-orange-50 rounded-lg">
                          <p className="text-2xl font-bold text-orange-600">
                            {profileData.xpAnalytics.currentWeek.streaks}
                          </p>
                          <p className="text-sm text-orange-600">Streak Bonus</p>
                        </div>
                        <div className="text-center p-4 bg-purple-50 rounded-lg">
                          <p className="text-2xl font-bold text-purple-600">
                            {profileData.xpAnalytics.currentWeek.achievements}
                          </p>
                          <p className="text-sm text-purple-600">Achievements</p>
                        </div>
                      </div>

                      {profileData.xpAnalytics.currentWeek.penalties < 0 && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm text-red-600">
                            Penalties this week: {profileData.xpAnalytics.currentWeek.penalties} XP
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No analytics data available</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Performance Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {profileData?.stats ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Submission Success Rate</span>
                        <span className="font-medium">{profileData.stats.metrics.submissionSuccessRate}%</span>
                      </div>
                      <Progress value={profileData.stats.metrics.submissionSuccessRate} className="h-2" />

                      <div className="flex justify-between items-center">
                        <span className="text-sm">Review Completion Rate</span>
                        <span className="font-medium">{profileData.stats.metrics.reviewCompletionRate}%</span>
                      </div>
                      <Progress value={profileData.stats.metrics.reviewCompletionRate} className="h-2" />

                      <div className="flex justify-between items-center">
                        <span className="text-sm">Average XP per Week</span>
                        <span className="font-medium">{profileData.stats.metrics.averageXpPerWeek}</span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm">Days Since Joining</span>
                        <span className="font-medium">{profileData.stats.metrics.joinedDaysAgo}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No performance data available</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Achievements Tab */}
          <TabsContent value="achievements" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Achievement Progress
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {profileData?.achievements?.progress ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {profileData.achievements.progress.map((achievement: any) => (
                        <div key={achievement.achievement.id} className="p-4 border rounded-lg">
                          <div className="flex items-center gap-3 mb-2">
                            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                              achievement.isCompleted ? 'bg-yellow-100' : 'bg-gray-100'
                            }`}>
                              <Award className={`h-5 w-5 ${
                                achievement.isCompleted ? 'text-yellow-600' : 'text-gray-400'
                              }`} />
                            </div>
                            <div className="flex-1">
                              <h4 className="font-medium">{achievement.achievement.name}</h4>
                              <p className="text-sm text-muted-foreground">
                                {achievement.achievement.description}
                              </p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Progress</span>
                              <span>{achievement.progress}/{achievement.target}</span>
                            </div>
                            <Progress value={achievement.percentage} className="h-2" />
                            {achievement.isCompleted && (
                              <Badge className="bg-yellow-100 text-yellow-800">
                                +{achievement.achievement.xpReward} XP
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No achievements data available</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Achievements</CardTitle>
                </CardHeader>
                <CardContent>
                  {profileData?.achievements?.recent ? (
                    <div className="space-y-3">
                      {profileData.achievements.recent.map((achievement: any) => (
                        <div key={achievement.id} className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg">
                          <Award className="h-6 w-6 text-yellow-600" />
                          <div>
                            <p className="font-medium text-sm">{achievement.achievement.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(achievement.earnedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No recent achievements</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Goals Tab */}
          <TabsContent value="goals" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Weekly Task Goals
                  </CardTitle>
                  <CardDescription>
                    Track your progress toward weekly task type caps
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {profileData?.xpAnalytics?.goalProgress ? (
                    <div className="space-y-6">
                      {profileData.xpAnalytics.goalProgress.map((goal: any) => (
                        <div key={goal.taskType} className="space-y-3">
                          <div className="flex justify-between items-center">
                            <div>
                              <h4 className="font-medium">Task Type {goal.taskType}</h4>
                              <p className="text-sm text-muted-foreground">
                                {goal.current} of {goal.maximum} completed
                              </p>
                            </div>
                            <Badge variant={goal.percentage >= 100 ? 'default' : 'secondary'}>
                              {goal.percentage}%
                            </Badge>
                          </div>
                          <Progress value={goal.percentage} className="h-3" />
                          {goal.percentage >= 100 && (
                            <p className="text-sm text-green-600 font-medium">
                              ✅ Goal completed! Maximum XP earned for this task type.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No goals data available</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Weekly Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-center p-6 bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg">
                      <p className="text-3xl font-bold text-primary">
                        {profileData?.currentWeekXp || 0}
                      </p>
                      <p className="text-sm text-muted-foreground">XP earned this week</p>
                    </div>

                    {profileData?.xpAnalytics?.projectedWeeklyXp && (
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <p className="text-sm font-medium text-blue-900">Projected Weekly XP</p>
                        <p className="text-2xl font-bold text-blue-600">
                          {profileData.xpAnalytics.projectedWeeklyXp}
                        </p>
                        <p className="text-xs text-blue-600">
                          Based on your recent activity
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <h4 className="font-medium">This Week's Highlights</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span>Submissions</span>
                          <span>{profileData?.stats?.submissions?.total || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Reviews Completed</span>
                          <span>{profileData?.stats?.reviews?.completed || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Achievements Earned</span>
                          <span>{profileData?.achievements?.recent?.length || 0}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
