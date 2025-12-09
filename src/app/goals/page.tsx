'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
// Tabs not used in this view
import WeeklyGoalsWidget from '@/components/WeeklyGoalsWidget'
import {
  Target,
  Calendar,
  TrendingUp,
  Award,
  Clock,
  ArrowLeft,
  RefreshCw,
  BarChart3,
  Zap,
  CheckCircle,
  AlertTriangle
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { getTaskDisplayInfo } from '@/lib/xp-rules-v2'

// Helper function to get task type display name
const getTaskTypeDisplayName = (taskType: string): string => {
  const taskConfig = getTaskDisplayInfo(taskType)
  return taskConfig.name
}

export default function GoalsPage() {
  const { user, isLoading: loading } = usePrivyAuthSync()
  const router = useRouter()
  const { authenticatedFetch } = useAuthenticatedFetch()
  type GoalProgressItem = { taskType: string; current: number; maximum: number; percentage: number }
  type GoalsData = {
    goalProgress: GoalProgressItem[]
    currentWeekXp: number
    projectedWeeklyXp: number
    weeklyTrends: unknown[]
    profile: unknown
    insights?: Array<{ type: 'positive' | 'warning' | 'info'; title: string; description: string }>
  }
  const [goalsData, setGoalsData] = useState<GoalsData | null>(null)
  const [loadingGoals, setLoadingGoals] = useState(true)
  const [selectedTimeframe] = useState('current_week')

  const fetchGoalsData = useCallback(async () => {
    try {
      setLoadingGoals(true)
      
      const [xpBreakdownResponse, profileResponse] = await Promise.all([
        authenticatedFetch(`/api/user/xp-breakdown?timeframe=${selectedTimeframe}&_t=${Date.now()}`),
        authenticatedFetch(`/api/user/profile/complete?_t=${Date.now()}`)
      ])

      if (xpBreakdownResponse.ok && profileResponse.ok) {
        const [xpData, profileData] = await Promise.all([
          xpBreakdownResponse.json(),
          profileResponse.json()
        ])

        setGoalsData({
          goalProgress: xpData.goalProgress || [],
          insights: xpData.insights || [],
          currentWeekXp: profileData.currentWeekXp || 0,
          projectedWeeklyXp: profileData.xpAnalytics?.projectedWeeklyXp || 0,
          weeklyTrends: profileData.xpAnalytics?.weeklyTrends || [],
          profile: profileData
        })
      }
    } catch (error) {
      console.error('Error fetching goals data:', error)
    } finally {
      setLoadingGoals(false)
    }
  }, [selectedTimeframe])

  useEffect(() => {
    if (user) {
      fetchGoalsData()
    }
  }, [user, fetchGoalsData])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!user) {
    router.push('/auth')
    return null
  }

  // Calculate statistics
  const completedGoals = goalsData?.goalProgress?.filter((g) => g.percentage >= 100).length || 0
  const totalGoals = goalsData?.goalProgress?.length || 0
  const overallProgress = totalGoals > 0 ? (completedGoals / totalGoals) * 100 : 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Target className="h-8 w-8 text-primary" />
                Goals & Progress
              </h1>
              <p className="text-muted-foreground">
                Track your weekly goals and monitor your progress
              </p>
            </div>
          </div>
          
          <Button variant="outline" size="sm" onClick={fetchGoalsData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <CardContent className="p-4 text-center">
              <Target className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-blue-700">
                {Math.round(overallProgress)}%
              </div>
              <div className="text-sm text-blue-600">Goals Complete</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <CardContent className="p-4 text-center">
              <Zap className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-green-700">
                {goalsData?.currentWeekXp || 0}
              </div>
              <div className="text-sm text-green-600">Week XP</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <CardContent className="p-4 text-center">
              <TrendingUp className="h-8 w-8 text-purple-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-purple-700">
                {goalsData?.projectedWeeklyXp || 0}
              </div>
              <div className="text-sm text-purple-600">Projected XP</div>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
            <CardContent className="p-4 text-center">
              <Award className="h-8 w-8 text-orange-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-orange-700">
                {completedGoals}/{totalGoals}
              </div>
              <div className="text-sm text-orange-600">Completed</div>
            </CardContent>
          </Card>
        </div>

        {loadingGoals ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[1, 2].map(i => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                    <div className="h-32 bg-gray-200 rounded"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Weekly Goals Widget */}
            <WeeklyGoalsWidget
              goalProgress={goalsData?.goalProgress || []}
              currentWeekXp={goalsData?.currentWeekXp || 0}
              projectedWeeklyXp={goalsData?.projectedWeeklyXp || 0}
              showDetails={true}
            />

            {/* Progress Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Progress Summary
                </CardTitle>
                <CardDescription>
                  Your performance this week
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Overall Progress */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Overall Goal Completion</span>
                      <span>{Math.round(overallProgress)}%</span>
                    </div>
                    <Progress value={overallProgress} className="h-3" />
                  </div>

                  {/* Task Type Breakdown */}
                  {goalsData?.goalProgress && goalsData.goalProgress.length > 0 ? (
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Task Type Progress</h4>
                      {goalsData.goalProgress.map((goal) => (
                        <div key={goal.taskType} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                              <span className="text-sm font-bold text-primary">{goal.taskType}</span>
                            </div>
                            <div>
                              <p className="font-medium text-sm">{getTaskTypeDisplayName(goal.taskType)}</p>
                              <p className="text-xs text-muted-foreground">
                                {goal.current} of {goal.maximum} completed
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={goal.percentage >= 100 ? 'default' : 'secondary'}>
                              {goal.percentage}%
                            </Badge>
                            {goal.percentage >= 100 ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : goal.percentage >= 50 ? (
                              <Clock className="h-4 w-4 text-orange-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-red-600" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Target className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-muted-foreground">No goal data available</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Start submitting content to track your progress!
                      </p>
                    </div>
                  )}

                  {/* Quick Actions */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Quick Actions</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => router.push('/dashboard?tab=submit')}
                        className="justify-start"
                      >
                        Submit Content
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => router.push('/review')}
                        className="justify-start"
                      >
                        Review Content
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Insights Section */}
        {goalsData?.insights && goalsData.insights.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Insights & Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {goalsData.insights?.map((insight, index: number) => (
                  <div 
                    key={index}
                    className={`p-4 rounded-lg border ${
                      insight.type === 'positive' ? 'bg-green-50 border-green-200' :
                      insight.type === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-blue-50 border-blue-200'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Badge 
                        variant={insight.type === 'positive' ? 'default' : 'secondary'}
                        className="mt-1"
                      >
                        {insight.category}
                      </Badge>
                      <div className="flex-1">
                        <p className="text-sm">{insight.message}</p>
                        {insight.value && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Value: {insight.value}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Historical Performance */}
        {goalsData?.weeklyTrends && goalsData.weeklyTrends.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Historical Performance
              </CardTitle>
              <CardDescription>
                Your goal completion over the last few weeks
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {goalsData.weeklyTrends.slice(-4).map((week: { week: number; weekStart: string; weekEnd: string; xpEarned: number }) => (
                  <div key={week.week} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="font-medium text-sm">Week {week.week}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(week.weekStart).toLocaleDateString()} - {new Date(week.weekEnd).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{week.xpEarned} XP</p>
                      <p className="text-xs text-muted-foreground">
                        {week.submissions} submissions, {week.reviews} reviews
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
