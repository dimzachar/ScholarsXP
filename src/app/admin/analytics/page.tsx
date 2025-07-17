'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  FileText,
  MessageSquare,
  Zap,
  Award,
  AlertTriangle,
  RefreshCw,
  Download,
  Calendar
} from 'lucide-react'
import { useRouter } from 'next/navigation'

interface AnalyticsData {
  overview: {
    totalUsers: number
    activeUsers: number
    totalSubmissions: number
    completedSubmissions: number
    totalReviews: number
    totalXpAwarded: number
    totalAchievements: number
    pendingFlags: number
    submissionSuccessRate: number
    avgReviewScore: number
  }
  timeSeriesData: Array<{
    date: string
    submissions: number
    reviews: number
    users: number
    xpAwarded: number
  }>
  distributions: {
    platforms: Record<string, number>
    taskTypes: Record<string, number>
    roles: Record<string, number>
    xpRanges: Record<string, number>
  }
  topPerformers: {
    submitters: Array<{
      id: string
      username: string
      totalXp: number
      _count: { submissions: number }
    }>
    reviewers: Array<{
      id: string
      username: string
      totalXp: number
      _count: { peerReviews: number }
    }>
  }
  qualityMetrics: {
    avgReviewScore: number
    minReviewScore: number
    maxReviewScore: number
    taskTypeSuccessRates: Array<{
      taskType: string
      total: number
      completed: number
      successRate: number
    }>
  }
  growthRates: {
    submissions: number
    reviews: number
    users: number
  }
  timeframe: string
  dateRange: {
    start: string
    end: string
  }
}

export default function AdminAnalyticsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(true)
  const [timeframe, setTimeframe] = useState('last_30_days')

  useEffect(() => {
    fetchAnalyticsData()
  }, [timeframe])

  const fetchAnalyticsData = async () => {
    try {
      setLoadingAnalytics(true)
      
      const response = await fetch(`/api/admin/analytics?timeframe=${timeframe}`)
      
      if (response.ok) {
        const data = await response.json()
        setAnalyticsData(data)
      }
    } catch (error) {
      console.error('Error fetching analytics data:', error)
    } finally {
      setLoadingAnalytics(false)
    }
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
  }

  const getGrowthIcon = (rate: number) => {
    if (rate > 0) return <TrendingUp className="h-4 w-4 text-success" />
    if (rate < 0) return <TrendingDown className="h-4 w-4 text-destructive" />
    return <div className="h-4 w-4" />
  }

  const getGrowthColor = (rate: number) => {
    if (rate > 0) return 'text-success'
    if (rate < 0) return 'text-destructive'
    return 'text-muted-foreground'
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (user?.role !== 'ADMIN') {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <BarChart3 className="h-8 w-8 text-info" />
              System Analytics
            </h1>
            <p className="text-muted-foreground">
              Comprehensive platform insights and performance metrics
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Select value={timeframe} onValueChange={setTimeframe}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                <SelectItem value="last_90_days">Last 90 Days</SelectItem>
                <SelectItem value="all_time">All Time</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={fetchAnalyticsData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {loadingAnalytics ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                    <div className="h-8 bg-muted rounded w-3/4"></div>
                    <div className="h-3 bg-muted rounded w-1/3"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : analyticsData ? (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6 mt-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="bg-gradient-to-br from-info/10 to-info/20 border-info/20">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-info">Total Users</p>
                        <p className="text-2xl font-bold text-info">
                          {formatNumber(analyticsData.overview.totalUsers)}
                        </p>
                        <div className={`flex items-center gap-1 text-sm ${getGrowthColor(analyticsData.growthRates.users)}`}>
                          {getGrowthIcon(analyticsData.growthRates.users)}
                          {Math.abs(analyticsData.growthRates.users).toFixed(1)}%
                        </div>
                      </div>
                      <Users className="h-8 w-8 text-info" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-success/10 to-success/20 border-success/20">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-success">Submissions</p>
                        <p className="text-2xl font-bold text-success">
                          {formatNumber(analyticsData.overview.totalSubmissions)}
                        </p>
                        <div className={`flex items-center gap-1 text-sm ${getGrowthColor(analyticsData.growthRates.submissions)}`}>
                          {getGrowthIcon(analyticsData.growthRates.submissions)}
                          {Math.abs(analyticsData.growthRates.submissions).toFixed(1)}%
                        </div>
                      </div>
                      <FileText className="h-8 w-8 text-success" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple/10 to-purple/20 border-purple/20">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-purple">Reviews</p>
                        <p className="text-2xl font-bold text-purple">
                          {formatNumber(analyticsData.overview.totalReviews)}
                        </p>
                        <div className={`flex items-center gap-1 text-sm ${getGrowthColor(analyticsData.growthRates.reviews)}`}>
                          {getGrowthIcon(analyticsData.growthRates.reviews)}
                          {Math.abs(analyticsData.growthRates.reviews).toFixed(1)}%
                        </div>
                      </div>
                      <MessageSquare className="h-8 w-8 text-purple" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-warning/10 to-warning/20 border-warning/20">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-warning">XP Awarded</p>
                        <p className="text-2xl font-bold text-warning">
                          {formatNumber(analyticsData.overview.totalXpAwarded)}
                        </p>
                        <p className="text-sm text-warning">
                          {analyticsData.overview.totalAchievements} achievements
                        </p>
                      </div>
                      <Zap className="h-8 w-8 text-warning" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Activity Overview */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Platform Activity</CardTitle>
                    <CardDescription>Content distribution by platform</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {Object.entries(analyticsData.distributions.platforms).map(([platform, count]) => {
                        const percentage = (count / analyticsData.overview.totalSubmissions) * 100
                        return (
                          <div key={platform} className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">{platform}</span>
                              <span>{count} ({percentage.toFixed(1)}%)</span>
                            </div>
                            <Progress value={percentage} className="h-2" />
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Task Type Distribution</CardTitle>
                    <CardDescription>Submissions by task type</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {Object.entries(analyticsData.distributions.taskTypes).map(([taskType, count]) => {
                        const percentage = (count / analyticsData.overview.totalSubmissions) * 100
                        return (
                          <div key={taskType} className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">Task Type {taskType}</span>
                              <span>{count} ({percentage.toFixed(1)}%)</span>
                            </div>
                            <Progress value={percentage} className="h-2" />
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* System Health */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      User Activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span className="text-sm">Active Users (7 days)</span>
                        <Badge variant="outline">
                          {analyticsData.overview.activeUsers}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Activity Rate</span>
                        <Badge variant="outline">
                          {Math.round((analyticsData.overview.activeUsers / analyticsData.overview.totalUsers) * 100)}%
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="h-5 w-5" />
                      Quality Metrics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span className="text-sm">Success Rate</span>
                        <Badge variant="outline">
                          {analyticsData.overview.submissionSuccessRate}%
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Avg Review Score</span>
                        <Badge variant="outline">
                          {analyticsData.overview.avgReviewScore.toFixed(1)}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5" />
                      Moderation
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <span className="text-sm">Pending Flags</span>
                        <Badge variant={analyticsData.overview.pendingFlags > 0 ? 'destructive' : 'outline'}>
                          {analyticsData.overview.pendingFlags}
                        </Badge>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Flag Rate</span>
                        <Badge variant="outline">
                          {analyticsData.overview.totalSubmissions > 0 
                            ? ((analyticsData.overview.pendingFlags / analyticsData.overview.totalSubmissions) * 100).toFixed(2)
                            : 0}%
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Users Tab */}
            <TabsContent value="users" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>User Role Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {Object.entries(analyticsData.distributions.roles).map(([role, count]) => {
                        const percentage = (count / analyticsData.overview.totalUsers) * 100
                        return (
                          <div key={role} className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">{role}</span>
                              <span>{count} ({percentage.toFixed(1)}%)</span>
                            </div>
                            <Progress value={percentage} className="h-2" />
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>XP Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {Object.entries(analyticsData.distributions.xpRanges).map(([range, count]) => {
                        const percentage = (count / analyticsData.overview.totalUsers) * 100
                        return (
                          <div key={range} className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="font-medium">{range} XP</span>
                              <span>{count} ({percentage.toFixed(1)}%)</span>
                            </div>
                            <Progress value={percentage} className="h-2" />
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Top Performers */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Top Submitters</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {analyticsData.topPerformers.submitters.slice(0, 5).map((user, index) => (
                        <div key={user.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="w-8 h-8 rounded-full flex items-center justify-center">
                              {index + 1}
                            </Badge>
                            <div>
                              <p className="font-medium">{user.username}</p>
                              <p className="text-sm text-muted-foreground">
                                {user._count.submissions} submissions
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline">
                            {user.totalXp} XP
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Top Reviewers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {analyticsData.topPerformers.reviewers.slice(0, 5).map((user, index) => (
                        <div key={user.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="w-8 h-8 rounded-full flex items-center justify-center">
                              {index + 1}
                            </Badge>
                            <div>
                              <p className="font-medium">{user.username}</p>
                              <p className="text-sm text-muted-foreground">
                                {user._count.peerReviews} reviews
                              </p>
                            </div>
                          </div>
                          <Badge variant="outline">
                            {user.totalXp} XP
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Content Tab */}
            <TabsContent value="content" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Task Type Success Rates</CardTitle>
                  <CardDescription>Completion rates by task type</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {analyticsData.qualityMetrics.taskTypeSuccessRates.map((taskType) => (
                      <div key={taskType.taskType} className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">Task Type {taskType.taskType}</span>
                          <span>{taskType.completed}/{taskType.total} ({taskType.successRate}%)</span>
                        </div>
                        <Progress value={taskType.successRate} className="h-2" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Performance Tab */}
            <TabsContent value="performance" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Review Quality</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-primary">
                          {analyticsData.qualityMetrics.avgReviewScore.toFixed(1)}
                        </div>
                        <div className="text-sm text-muted-foreground">Average Score</div>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Min Score:</span>
                        <span>{analyticsData.qualityMetrics.minReviewScore}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span>Max Score:</span>
                        <span>{analyticsData.qualityMetrics.maxReviewScore}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Growth Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">User Growth</span>
                        <div className={`flex items-center gap-1 ${getGrowthColor(analyticsData.growthRates.users)}`}>
                          {getGrowthIcon(analyticsData.growthRates.users)}
                          <span className="text-sm font-medium">
                            {analyticsData.growthRates.users.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Submission Growth</span>
                        <div className={`flex items-center gap-1 ${getGrowthColor(analyticsData.growthRates.submissions)}`}>
                          {getGrowthIcon(analyticsData.growthRates.submissions)}
                          <span className="text-sm font-medium">
                            {analyticsData.growthRates.submissions.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Review Growth</span>
                        <div className={`flex items-center gap-1 ${getGrowthColor(analyticsData.growthRates.reviews)}`}>
                          {getGrowthIcon(analyticsData.growthRates.reviews)}
                          <span className="text-sm font-medium">
                            {analyticsData.growthRates.reviews.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Date Range</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Period</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <div>From: {new Date(analyticsData.dateRange.start).toLocaleDateString()}</div>
                        <div>To: {new Date(analyticsData.dateRange.end).toLocaleDateString()}</div>
                      </div>
                      <Badge variant="outline" className="w-full justify-center">
                        {analyticsData.timeframe.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No analytics data available</p>
          </div>
        )}
      </div>
    </div>
  )
}
