'use client'
/* eslint @typescript-eslint/no-explicit-any: off */

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { useDashboardData, useMonthlyStats } from '@/hooks/useDashboardData'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent } from '@/components/ui/tabs'


import { ProgressTab } from '@/components/dashboard/ProgressTab'
import { StatCard, PeriodStatCard, StreakBadge } from '@/components/dashboard/StatCard'
import { MobileTabNavigation, createTabItem } from '@/components/dashboard/MobileTabNavigation'
import { MobileActionCard, createActionCardData } from '@/components/dashboard/MobileActionCard'
import { GestureWrapper } from '@/components/ui/gesture-wrapper'
import { MobileLayout, MobileSection, MobileCardGrid, MobileHeader } from '@/components/layout/MobileLayout'
import { LazyWrapper, MobileLazyComponents, usePerformanceMonitor } from '@/components/optimization/LazyLoader'
import { useResponsiveLayout, getResponsiveGridClasses } from '@/hooks/useResponsiveLayout'
import { cn, getWeekNumber } from '@/lib/utils'
import {
  Zap,
  BookOpen,
  Users,
  Trophy,
  Star,
  TrendingUp,
  User,
  BarChart3,
  Calendar
} from 'lucide-react'

export default function DashboardPage() {
  const { user, isLoading: loading, isAdmin, isReviewer } = usePrivyAuthSync()
  const router = useRouter()
  
  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [loading, user, router])
  // Hooks must be called unconditionally
  const { isMobile } = useResponsiveLayout()
  usePerformanceMonitor()
  const [activeTab, setActiveTab] = useState('overview')
  const [selectedTimeframe, setSelectedTimeframe] = useState('current_week')

  // Use optimized data fetching hooks - Always load analytics for weekly XP accuracy
  const {
    profile: { data: profileData, loading: _loadingProfile },
    analytics: { data: analyticsData, loading: loadingAnalytics, error: analyticsError },
    refetchAll
  } = useDashboardData(user?.id || undefined, 'progress', selectedTimeframe, user?.privyUserId) // Always use 'progress' to load analytics

  // Handle timeframe changes for analytics
  const handleTimeframeChange = (newTimeframe: string) => {
    setSelectedTimeframe(newTimeframe)
    // The analytics hook will automatically refetch when timeframe changes
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

  

  // Pull to refresh handler
  const handleRefresh = async () => {
    // Refetch fresh data using the optimized hooks
    refetchAll()
  }

  return (
    <MobileLayout>
      <GestureWrapper
        enablePullToRefresh={isMobile}
        onPullToRefresh={handleRefresh}
        className="min-h-screen"
      >
        <MobileHeader
          title={profileData?.displayName ? `Welcome back, ${profileData.displayName}!` : 'Welcome back, Scholar!'}
          subtitle="Track your progress and continue your learning journey"
          variant="default"
        />

        <MobileSection
          title="Your Progress"
          icon={BarChart3}
          spacing="normal"
        >
          <StatCardsSection profileData={profileData} analyticsData={analyticsData} />
        </MobileSection>

        {/* Mobile-Optimized Tabbed Interface */}
        <Tabs defaultValue="overview" className="w-full" value={activeTab} onValueChange={setActiveTab}>
          <MobileTabNavigation
            tabs={[
              createTabItem('overview', 'Overview', User),
              createTabItem('submit', 'Submit Content', BookOpen, 'Submit'),
              createTabItem('progress', 'Progress & Analytics', TrendingUp, 'Progress')
            ]}
          />

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Mobile-Optimized Quick Actions */}
              <div className="lg:col-span-2 space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Quick Actions
                </h3>

                <QuickActionsSection
                  isReviewer={isReviewer}
                  isAdmin={isAdmin}
                  profileData={profileData}
                  router={router}
                />

              </div>
            </div>
          </TabsContent>

          {/* Submit Tab */}
          <TabsContent value="submit" className="mt-6">
            <Card className="border-0 shadow-xl">
              <CardHeader className="bg-gradient-to-r from-primary/10 to-primary/5">
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Submit New Content
                </CardTitle>
                <CardDescription>
                  Share your knowledge and earn XP by submitting quality content
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <LazyWrapper minHeight="400px">
                  <MobileLazyComponents.SubmissionForm />
                </LazyWrapper>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Progress Tab */}
          <TabsContent value="progress" className="mt-6">
            <ProgressTab
              analyticsData={analyticsData}
              loadingAnalytics={loadingAnalytics}
              analyticsError={analyticsError}
              selectedTimeframe={selectedTimeframe}
              profileData={profileData}
              onTimeframeChange={handleTimeframeChange}
              onRetryAnalytics={refetchAll}
            />
          </TabsContent>
        </Tabs>
      </GestureWrapper>
    </MobileLayout>
  )
}

// Stat cards section - 3 cards: Total XP, This Week (XP + rank), This Month (XP + rank)
function StatCardsSection({ profileData, analyticsData }: { profileData: any; analyticsData: any }) {
  const userProfile = profileData?.profile || {}
  const statistics = profileData?.statistics || {}
  const { data: monthlyStats } = useMonthlyStats()
  
  const totalXp = userProfile?.totalXp || 0
  const weeklyXp = userProfile?.currentWeekXp || 0
  const weeklyRank = statistics?.rank?.weekly || 0
  const weeklyActiveUsers = statistics?.rank?.weeklyActiveUsers || 0
  const streakWeeks = userProfile?.streakWeeks || 0

  // Monthly stats
  const monthlyXp = monthlyStats?.xp || 0
  const monthlyRank = monthlyStats?.rank || 0
  const monthlyTotalUsers = monthlyStats?.totalUsers || 0

  // Get weekly trends for sparkline and change
  const weeklyTrends: Array<{ week: number; xpEarned: number }> = analyticsData?.weeklyTrends || []
  const currentWeekNumber = getWeekNumber(new Date())
  
  const sparklineData = weeklyTrends.length > 1 
    ? weeklyTrends.slice(-6).map(w => w.xpEarned || 0)
    : undefined
  
  const previousWeekData = weeklyTrends.find(w => w.week === currentWeekNumber - 1)
  const previousWeekXp = previousWeekData?.xpEarned || 0
  const xpChange = previousWeekXp > 0 ? weeklyXp - previousWeekXp : 0

  return (
    <MobileCardGrid
      columns={{ mobile: 1, tablet: 3, desktop: 3 }}
      gap="md"
    >
      <StatCard
        title="Total XP"
        value={totalXp}
        icon={BarChart3}
        variant="primary"
        subtitle="Lifetime"
        sparklineData={sparklineData}
      />

      <PeriodStatCard
        title="This Week"
        xp={weeklyXp}
        rank={weeklyRank}
        totalUsers={weeklyActiveUsers}
        icon={Calendar}
        variant="secondary"
        subtitle={`Week ${currentWeekNumber}`}
        badge={<StreakBadge weeks={streakWeeks} />}
        change={xpChange}
      />

      <PeriodStatCard
        title="This Month"
        xp={monthlyXp}
        rank={monthlyRank}
        totalUsers={monthlyTotalUsers}
        icon={Calendar}
        variant="accent"
        subtitle={new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
      />
    </MobileCardGrid>
  )
}

// Mobile-optimized quick actions section
function QuickActionsSection({
  isReviewer,
  isAdmin,
  profileData,
  router
}: {
  isReviewer: boolean
  isAdmin: boolean
  profileData: any
  router: any
}) {
  const { currentBreakpoint } = useResponsiveLayout()

  const actions = []

  // Review Submissions action (for reviewers and admins)
  if (isReviewer || isAdmin) {
    actions.push(
      createActionCardData(
        'Review Submissions',
        'Help evaluate peer content and earn XP',
        Users,
        {
          color: 'primary',
          onClick: () => router.push('/review'),
          badges: [
            { text: 'Base 50 XP', variant: 'outline' },
            { text: 'Bonuses up to +55', variant: 'outline' }
          ]
        }
      )
    )
  }

  // Leaderboard action
  actions.push(
    createActionCardData(
      'View Leaderboard',
      'See community rankings and compete with peers',
      Trophy,
      {
        color: 'secondary',
        onClick: () => router.push('/leaderboard'),
        badges: [
          { text: 'Weekly Rankings', variant: 'outline' },
          { text: `Your Rank: #${profileData?.statistics?.rank?.weekly || '—'}`, variant: 'outline' }
        ]
      }
    )
  )

  // Admin Panel action (for admins only)
  if (isAdmin) {
    actions.push(
      createActionCardData(
        'Admin Panel',
        'Platform management and oversight tools',
        Star,
        {
          color: 'accent',
          onClick: () => router.push('/admin'),
          badges: [
            { text: 'Admin Access', variant: 'outline' },
            { text: 'System Control', variant: 'outline' }
          ]
        }
      )
    )
  }

  const gridClasses = getResponsiveGridClasses(currentBreakpoint, 1, 1, 1)

  return (
    <div className={cn(gridClasses, 'gap-4')}>
      {actions.map((action, index) => (
        <MobileActionCard key={index} data={action} />
      ))}
    </div>
  )
}
