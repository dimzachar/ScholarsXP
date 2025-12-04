'use client'
/* eslint @typescript-eslint/no-explicit-any: off */

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useDashboardData } from '@/hooks/useDashboardData'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent } from '@/components/ui/tabs'


import { WeeklyProgressIndicator } from '@/components/dashboard/MiniChart'

import { ProgressTab } from '@/components/dashboard/ProgressTab'
import { ResponsiveStatCard, createStatCardData } from '@/components/ui/responsive-stat-card'
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
  Calendar,
  Flame,
  ArrowUp
} from 'lucide-react'

export default function DashboardPage() {
  const { user, loading, isAdmin, isReviewer } = useAuth()
  const router = useRouter()
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
  } = useDashboardData(user?.id, 'progress', selectedTimeframe) // Always use 'progress' to load analytics

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
          <StatCardsSection profileData={profileData} />
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

// Mobile-optimized stat cards section
function StatCardsSection({ profileData }: { profileData: any }) {

  // Create stat card data using the new responsive format
  // Fix: Access correct data paths from API response
  const userProfile = profileData?.profile || {}
  // const userStats = profileData?.statistics || {}

  const totalXpData = createStatCardData(
    'Total XP',
    userProfile?.totalXp || 0,
    {
      color: 'primary',
      icon: BarChart3,
      progress: {
        current: userProfile?.totalXp || 0,
        max: Math.max(userProfile?.totalXp || 1000, 1000),
        label: 'Lifetime'
      },
      trend: userProfile?.xpAnalytics?.weeklyTrends?.length > 1 ? {
        data: userProfile.xpAnalytics.weeklyTrends,
        direction: 'up' as const,
        percentage: userProfile.xpAnalytics.projectedWeeklyXp
      } : undefined,
      additionalInfo: userProfile?.xpAnalytics?.projectedWeeklyXp && (
        <div className="flex items-center">
          <ArrowUp className="h-4 w-4 mr-1" />
          <span className="text-sm">+{userProfile.xpAnalytics.projectedWeeklyXp} this week</span>
        </div>
      )
    }
  )

  // FIXED: Use stored currentWeekXp value (now correctly calculated from transactions)
  // The root cause was fixed in weekly-manager.ts - it now calculates weekly XP from transactions
  // instead of using the outdated stored value
  const weeklyXpDisplay = userProfile?.currentWeekXp || 0
  
  // Debug logging removed - XP fix is complete and dashboard shows correct values
  // console.log(`✅ Dashboard weekly XP: ${weeklyXpDisplay}`)
  // console.log(`👤 Using stored currentWeekXp (now correctly calculated): ${weeklyXpDisplay}`)

  const weeklyXpData = createStatCardData(
    'This Week',
    weeklyXpDisplay,
    {
      color: 'secondary',
      icon: Calendar,
      progress: {
        current: weeklyXpDisplay,
        max: Math.max(weeklyXpDisplay || 100, 100),
        label: 'Activity'
      },
      subtitle: `Week ${getWeekNumber(new Date())}`,
      additionalInfo: (
        <div className="space-y-2">
          {userProfile?.streakWeeks && userProfile.streakWeeks > 0 && (
            <div className="flex items-center">
              <Flame className="h-4 w-4 mr-1" />
              <span className="text-sm">{userProfile.streakWeeks}w streak</span>
            </div>
          )}
          <WeeklyProgressIndicator
            currentWeek={getWeekNumber(new Date())}
            totalWeeks={52}
          />
        </div>
      )
    }
  )

  // Get weekly rank from statistics
  const weeklyRank = profileData?.statistics?.rank?.weekly
  const totalScholars = profileData?.statistics?.rank?.totalUsers || 0
  const currentWeekXp = profileData?.profile?.currentWeekXp || 0
  
  const rankData = createStatCardData(
    'Weekly Rank',
    weeklyRank || 0,
    {
      color: 'accent',
      icon: Users,
      progress: {
        current: weeklyRank || 0,
        max: Math.max(totalScholars, 100),
        label: 'Community'
      },
      subtitle: totalScholars > 0 ? `of ${totalScholars} scholars` : 'of — scholars',
      additionalInfo: weeklyRank ? (
        <div className="flex items-center text-sm">
          <Trophy className="h-4 w-4 mr-1 text-yellow-500" />
          <span>#{weeklyRank}</span>
        </div>
      ) : (
        <div className="flex items-center text-sm text-muted-foreground">
          <span>No activity this week</span>
        </div>
      )
    }
  )

  return (
    <MobileCardGrid
      columns={{ mobile: 1, tablet: 2, desktop: 3 }}
      gap="md"
    >
      <ResponsiveStatCard data={totalXpData} />
      <ResponsiveStatCard data={weeklyXpData} />
      <ResponsiveStatCard data={rankData} />
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
