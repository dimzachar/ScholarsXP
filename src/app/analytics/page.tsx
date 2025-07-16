'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import XpTrendChart from '@/components/charts/XpTrendChart'
import XpBreakdownChart from '@/components/charts/XpBreakdownChart'
import {
  BarChart3,
  TrendingUp,
  Target,
  Award,
  Calendar,
  Download,
  RefreshCw,
  ArrowLeft
} from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function AnalyticsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [analyticsData, setAnalyticsData] = useState<any>(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(true)
  const [selectedTimeframe, setSelectedTimeframe] = useState('current_week')

  useEffect(() => {
    if (user) {
      fetchAnalyticsData()
    }
  }, [user, selectedTimeframe])

  const fetchAnalyticsData = async () => {
    try {
      setLoadingAnalytics(true)
      
      const [xpBreakdownResponse, profileResponse] = await Promise.all([
        fetch(`/api/user/xp-breakdown?timeframe=${selectedTimeframe}`),
        fetch('/api/user/profile/complete')
      ])

      if (xpBreakdownResponse.ok && profileResponse.ok) {
        const [xpData, profileData] = await Promise.all([
          xpBreakdownResponse.json(),
          profileResponse.json()
        ])

        setAnalyticsData({
          xpBreakdown: xpData,
          profile: profileData,
          weeklyTrends: profileData.xpAnalytics?.weeklyTrends || [],
          goalProgress: profileData.xpAnalytics?.goalProgress || []
        })
      }
    } catch (error) {
      console.error('Error fetching analytics data:', error)
    } finally {
      setLoadingAnalytics(false)
    }
  }

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
                <BarChart3 className="h-8 w-8 text-primary" />
                Analytics Dashboard
              </h1>
              <p className="text-muted-foreground">
                Comprehensive insights into your XP progression and performance
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
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

        {/* Timeframe Selector */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-sm font-medium">Timeframe:</span>
          {[
            { value: 'current_week', label: 'Current Week' },
            { value: 'last_12_weeks', label: 'Last 12 Weeks' },
            { value: 'all_time', label: 'All Time' }
          ].map(option => (
            <Button
              key={option.value}
              variant={selectedTimeframe === option.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedTimeframe(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {loadingAnalytics ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map(i => (
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
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="trends">Trends</TabsTrigger>
              <TabsTrigger value="breakdown">Breakdown</TabsTrigger>
              <TabsTrigger value="goals">Goals</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* XP Breakdown Chart */}
                {analyticsData?.xpBreakdown?.breakdown && (
                  <XpBreakdownChart
                    data={analyticsData.xpBreakdown.breakdown}
                    title="XP Sources"
                    timeframe={selectedTimeframe === 'current_week' ? 'Current Week' : 
                              selectedTimeframe === 'last_12_weeks' ? 'Last 12 Weeks' : 'All Time'}
                  />
                )}

                {/* Quick Stats */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Quick Stats
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-4 bg-blue-50 rounded-lg">
                          <div className="text-2xl font-bold text-blue-600">
                            {analyticsData?.profile?.totalXp?.toLocaleString() || '0'}
                          </div>
                          <div className="text-sm text-blue-600">Total XP</div>
                        </div>
                        <div className="text-center p-4 bg-green-50 rounded-lg">
                          <div className="text-2xl font-bold text-green-600">
                            #{analyticsData?.profile?.xpAnalytics?.rank?.weekly || '—'}
                          </div>
                          <div className="text-sm text-green-600">Weekly Rank</div>
                        </div>
                        <div className="text-center p-4 bg-orange-50 rounded-lg">
                          <div className="text-2xl font-bold text-orange-600">
                            {analyticsData?.profile?.streakWeeks || '0'}
                          </div>
                          <div className="text-sm text-orange-600">Streak Weeks</div>
                        </div>
                        <div className="text-center p-4 bg-purple-50 rounded-lg">
                          <div className="text-2xl font-bold text-purple-600">
                            {analyticsData?.profile?.achievements?.earned || '0'}
                          </div>
                          <div className="text-sm text-purple-600">Achievements</div>
                        </div>
                      </div>

                      {/* Performance Metrics */}
                      <div className="space-y-3">
                        <h4 className="font-medium">Performance Metrics</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Submission Success Rate</span>
                            <span>{analyticsData?.profile?.stats?.metrics?.submissionSuccessRate || 0}%</span>
                          </div>
                          <Progress value={analyticsData?.profile?.stats?.metrics?.submissionSuccessRate || 0} className="h-2" />
                          
                          <div className="flex justify-between text-sm">
                            <span>Review Completion Rate</span>
                            <span>{analyticsData?.profile?.stats?.metrics?.reviewCompletionRate || 0}%</span>
                          </div>
                          <Progress value={analyticsData?.profile?.stats?.metrics?.reviewCompletionRate || 0} className="h-2" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Insights */}
              {analyticsData?.xpBreakdown?.insights && (
                <Card>
                  <CardHeader>
                    <CardTitle>Insights & Recommendations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {analyticsData.xpBreakdown.insights.map((insight: any, index: number) => (
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
            </TabsContent>

            {/* Trends Tab */}
            <TabsContent value="trends" className="mt-6">
              {analyticsData?.weeklyTrends && analyticsData.weeklyTrends.length > 0 ? (
                <XpTrendChart 
                  data={analyticsData.weeklyTrends}
                  title="XP Progression Over Time"
                  showDetails={true}
                />
              ) : (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground">
                      Not enough data to show trends. Keep submitting and reviewing to see your progression!
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Breakdown Tab */}
            <TabsContent value="breakdown" className="space-y-6 mt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Detailed XP Breakdown */}
                {analyticsData?.xpBreakdown?.breakdown && (
                  <XpBreakdownChart
                    data={analyticsData.xpBreakdown.breakdown}
                    title="Detailed XP Breakdown"
                    timeframe={selectedTimeframe === 'current_week' ? 'Current Week' : 
                              selectedTimeframe === 'last_12_weeks' ? 'Last 12 Weeks' : 'All Time'}
                  />
                )}

                {/* Transaction Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle>Transaction Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analyticsData?.xpBreakdown?.summary ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="text-center p-3 bg-green-50 rounded-lg">
                            <div className="text-lg font-bold text-green-600">
                              {analyticsData.xpBreakdown.summary.positiveTransactions}
                            </div>
                            <div className="text-xs text-green-600">Positive</div>
                          </div>
                          <div className="text-center p-3 bg-red-50 rounded-lg">
                            <div className="text-lg font-bold text-red-600">
                              {analyticsData.xpBreakdown.summary.negativeTransactions}
                            </div>
                            <div className="text-xs text-red-600">Negative</div>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Total Transactions</span>
                            <span>{analyticsData.xpBreakdown.summary.totalTransactions}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Average Transaction</span>
                            <span>{analyticsData.xpBreakdown.summary.averageTransactionValue} XP</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No transaction data available</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* Goals Tab */}
            <TabsContent value="goals" className="mt-6">
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
                  {analyticsData?.goalProgress && analyticsData.goalProgress.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {analyticsData.goalProgress.map((goal: any) => (
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
                              ✅ Goal completed! Maximum XP earned.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      No goal data available. Start submitting content to track your progress!
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
