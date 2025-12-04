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
import { ENABLE_ACHIEVEMENTS } from '@/config/feature-flags'

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
      // console.log('🔍 Profile data received in ProgressTab:', {
      //   statistics: profileData.statistics,
      //   rank: profileData.statistics?.rank
      // })
    }
  }, [profileData])

  const timeframeKey = analyticsData?.timeframe || selectedTimeframe
  const weeklyTrends = analyticsData?.weeklyTrends || []

  const timeframeCounts = React.useMemo(() => {
    const aggregateMetric = (metric: 'submissions' | 'reviews' | 'streaks') =>
      weeklyTrends.reduce((sum: number, week: any) => sum + (week?.[metric] || 0), 0)

    const latestWeek = weeklyTrends[weeklyTrends.length - 1] || {}

    switch (timeframeKey) {
      case 'current_week':
        return {
          submissions: latestWeek.submissions || 0,
          reviews: latestWeek.reviews || 0,
          streaks: latestWeek.streaks || 0
        }
      case 'last_12_weeks':
        return {
          submissions: aggregateMetric('submissions'),
          reviews: aggregateMetric('reviews'),
          streaks: aggregateMetric('streaks')
        }
      case 'all_time':
      default:
        return {
          submissions: Math.max(
            profileData?.statistics?.totalSubmissions || 0,
            aggregateMetric('submissions')
          ),
          reviews: aggregateMetric('reviews'),
          streaks: aggregateMetric('streaks')
        }
    }
  }, [timeframeKey, weeklyTrends, profileData])

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Analytics Dashboard</h2>
            <p className="text-muted-foreground text-sm sm:text-base">Track your learning progress and achievements</p>
          </div>
          <Select value={selectedTimeframe} onValueChange={onTimeframeChange}>
            <SelectTrigger className="w-full sm:w-48 shrink-0">
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
            <Card className="p-3 sm:p-4">
              <div className="flex items-center space-x-2">
                <BarChart3 className="h-4 w-4 text-blue-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium truncate">
                    {selectedTimeframe === 'current_week' 
                      ? 'Week XP' 
                      : selectedTimeframe === 'last_12_weeks'
                      ? '12 Weeks XP'
                      : 'Total XP'}
                  </p>
                  <p className="text-xl sm:text-2xl font-bold dark:text-accent">
                    {(() => {
                      // Show different XP based on timeframe
                      if (selectedTimeframe === 'current_week') {
                        // Try to get currentWeekXp from profile, but if it's not available or 0, 
                        // check if we have current week data from analytics
                        const currentWeekXp = profileData?.profile?.currentWeekXp
                        if (currentWeekXp !== undefined && currentWeekXp > 0) {
                          return currentWeekXp
                        }
                        // If currentWeekXp is not available or 0, use analytics breakdown total
                        // but only if we have current week analytics data
                        return analyticsData?.breakdown?.total || 0
                      } else if (selectedTimeframe === 'last_12_weeks') {
                        return analyticsData?.breakdown?.total || 0
                      } else {
                        // all_time - use authoritative User.totalXp
                        return profileData?.profile?.totalXp || analyticsData?.breakdown?.total || 0
                      }
                    })()}
                  </p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4">
              <div className="flex items-center space-x-2">
                <Target className="h-4 w-4 text-green-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium truncate">Goals</p>
                  <p className="text-xl sm:text-2xl font-bold">
                    {analyticsData?.goalProgress?.filter((g: unknown) => g.percentage >= 100).length || 0}
                  </p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-4 w-4 text-purple-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium truncate">Submissions</p>
                  <p className="text-xl sm:text-2xl font-bold">{timeframeCounts.submissions || 0}</p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4">
              <div className="flex items-center space-x-2">
                <Trophy className="h-4 w-4 text-yellow-500 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm font-medium truncate">Rank</p>
                  <p className="text-xl sm:text-2xl font-bold">#{profileData?.statistics?.rank?.allTime || 'N/A'}</p>
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
              data={{ 
                ...analyticsData?.breakdown,
                // Ensure total XP is consistent across all timeframes
                total: (() => {
                  if (selectedTimeframe === 'current_week') {
                    // Try to get currentWeekXp from profile, but if it's not available or 0, 
                    // check if we have current week data from analytics
                    const currentWeekXp = profileData?.profile?.currentWeekXp
                    if (currentWeekXp !== undefined && currentWeekXp > 0) {
                      return currentWeekXp
                    }
                    // If currentWeekXp is not available or 0, use analytics breakdown total
                    // but only if we have current week analytics data
                    return analyticsData?.breakdown?.total || 0
                  } else if (selectedTimeframe === 'last_12_weeks') {
                    return analyticsData?.breakdown?.total || 0
                  } else {
                    // all_time - use authoritative User.totalXp
                    return profileData?.profile?.totalXp || analyticsData?.breakdown?.total || 0
                  }
                })()
              }}
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
              totalXpOverride={analyticsData?.breakdown?.total}
              timeframe={timeframeKey}
              summaryCounts={timeframeCounts}
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
      {ENABLE_ACHIEVEMENTS && (
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
      )}
    </div>
  )
}
