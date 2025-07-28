'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LazyWrapper, MobileLazyComponents } from '@/components/optimization/LazyLoader'
import { MobileCardGrid } from '@/components/layout/MobileLayout'
import { AnalyticsLoadingSkeleton } from '@/components/dashboard/AnalyticsLoadingSkeleton'
import XpBreakdownChart from '@/components/charts/XpBreakdownChart'
import XpTrendChart from '@/components/charts/XpTrendChart'
import { GoalProgressWidget } from '@/components/dashboard/GoalProgressWidget'
import { AnalyticsInsights } from '@/components/dashboard/AnalyticsInsights'
import { BarChart3, TrendingUp, Target, Trophy } from 'lucide-react'

interface ProgressTabProps {
  analyticsData: any
  loadingAnalytics: boolean
  analyticsError: string | null
  selectedTimeframe: string
  profileData: any
  onTimeframeChange: (timeframe: string) => void
  onRetryAnalytics: () => void

}

export function ProgressTab({
  analyticsData,
  loadingAnalytics,
  analyticsError,
  selectedTimeframe,
  profileData,
  onTimeframeChange,
  onRetryAnalytics
}: ProgressTabProps) {
  // Debug logging for rank data
  React.useEffect(() => {
    if (profileData) {
      console.log('🔍 Profile data received in ProgressTab:', {
        statistics: profileData.statistics,
        rank: profileData.statistics?.rank
      })
    }
  }, [profileData])

  return (
    <div className="space-y-6">
      {/* Analytics Error State */}
      {analyticsError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <p className="text-destructive text-sm">{analyticsError}</p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onRetryAnalytics}
              className="mt-2"
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Enhanced Header with Better Visual Hierarchy */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Analytics Dashboard</h2>
            <p className="text-muted-foreground">Track your learning progress and achievements</p>
          </div>
          <Select value={selectedTimeframe} onValueChange={onTimeframeChange}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current_week">This Week</SelectItem>
              <SelectItem value="last_12_weeks">Last 12 Weeks</SelectItem>
              <SelectItem value="all_time">All Time</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Quick Stats Overview */}
        {!loadingAnalytics && analyticsData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center space-x-2">
                <BarChart3 className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-sm font-medium">Total XP</p>
                  <p className="text-2xl font-bold">{analyticsData?.breakdown?.total || 0}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center space-x-2">
                <Target className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-sm font-medium">Goals Complete</p>
                  <p className="text-2xl font-bold">
                    {analyticsData?.goalProgress?.filter((g: any) => g.percentage >= 100).length || 0}
                  </p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-4 w-4 text-purple-500" />
                <div>
                  <p className="text-sm font-medium">Submissions</p>
                  <p className="text-2xl font-bold">{profileData?.statistics?.totalSubmissions || 0}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center space-x-2">
                <Trophy className="h-4 w-4 text-yellow-500" />
                <div>
                  <p className="text-sm font-medium">Rank</p>
                  <p className="text-2xl font-bold">#{profileData?.statistics?.rank?.allTime || 'N/A'}</p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>

      {/* Main Analytics Grid with Improved Spacing */}
      <MobileCardGrid columns={{ mobile: 1, tablet: 2, desktop: 2 }} gap="lg">
        {/* XP Breakdown Chart */}
        <LazyWrapper minHeight="400px">
          {loadingAnalytics ? (
            <AnalyticsLoadingSkeleton variant="chart" />
          ) : (
            <XpBreakdownChart 
              data={analyticsData?.breakdown}
              title="XP Breakdown"
              timeframe={analyticsData?.timeframe}
            />
          )}
        </LazyWrapper>

        {/* Weekly Trends Chart */}
        <LazyWrapper minHeight="400px">
          {loadingAnalytics ? (
            <AnalyticsLoadingSkeleton variant="chart" />
          ) : (
            <XpTrendChart
              data={analyticsData?.weeklyTrends}
              title="Progress Trends"
              showDetails={true}
              totalSubmissions={profileData?.statistics?.totalSubmissions}
            />
          )}
        </LazyWrapper>

        {/* Goal Progress Widget */}
        <LazyWrapper minHeight="350px">
          {loadingAnalytics ? (
            <AnalyticsLoadingSkeleton variant="widget" />
          ) : (
            <GoalProgressWidget 
              goalProgress={analyticsData?.goalProgress || []}
              showDetails={true}
            />
          )}
        </LazyWrapper>


      </MobileCardGrid>

      {/* Analytics Insights - Full Width */}
      <LazyWrapper minHeight="200px">
        {loadingAnalytics ? (
          <AnalyticsLoadingSkeleton variant="insights" />
        ) : (
          <AnalyticsInsights 
            insights={analyticsData?.insights || []}
            maxInsights={4}
            showActions={true}
          />
        )}
      </LazyWrapper>

      {/* Achievements Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Recent Achievements</h3>
        </div>
        <LazyWrapper minHeight="300px">
          <MobileLazyComponents.AchievementGallery
            recentlyEarned={analyticsData?.achievements?.recentlyEarned || []}
            loading={loadingAnalytics}
          />
        </LazyWrapper>
      </div>
    </div>
  )
}
