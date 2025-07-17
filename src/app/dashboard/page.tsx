'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import SubmissionForm from '@/components/SubmissionForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'


import { WeeklyProgressIndicator } from '@/components/dashboard/MiniChart'
import { AchievementGallery } from '@/components/dashboard/AchievementGallery'
import { LeaderboardWidget } from '@/components/dashboard/LeaderboardWidget'
import { ResponsiveStatCard, createStatCardData } from '@/components/ui/responsive-stat-card'
import { MobileTabNavigation, createTabItem } from '@/components/dashboard/MobileTabNavigation'
import { MobileActionCard, createActionCardData } from '@/components/dashboard/MobileActionCard'
import { GestureWrapper, SwipeableTabs } from '@/components/ui/gesture-wrapper'
import { MobileLayout, MobileSection, MobileCardGrid, MobileHeader } from '@/components/layout/MobileLayout'
import { LazyWrapper, MobileLazyComponents, usePerformanceMonitor } from '@/components/optimization/LazyLoader'
import { useResponsiveLayout, getResponsiveGridClasses } from '@/hooks/useResponsiveLayout'
import { cn } from '@/lib/utils'
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
  const [profileData, setProfileData] = useState<any>(null)
  const [, setLoadingProfile] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

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

  const { isMobile } = useResponsiveLayout()

  // Performance monitoring for mobile
  usePerformanceMonitor()

  // Pull to refresh handler
  const handleRefresh = async () => {
    // Simulate refresh delay
    await new Promise(resolve => setTimeout(resolve, 1000))
    // In a real app, you would refetch data here
    window.location.reload()
  }

  return (
    <MobileLayout>
      <GestureWrapper
        enablePullToRefresh={isMobile}
        onPullToRefresh={handleRefresh}
        className="min-h-screen"
      >
        <MobileHeader
          title={`Welcome back, ${profileData?.displayName || 'Scholar'}!`}
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

              {/* Leaderboard Widget */}
              <LeaderboardWidget
                onViewFull={() => router.push('/leaderboard')}
              />
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
            <div className="space-y-8">
              {/* Enhanced Achievements Section */}
              <LazyWrapper minHeight="300px">
                <MobileLazyComponents.AchievementGallery />
              </LazyWrapper>
            </div>
          </TabsContent>
        </Tabs>
      </GestureWrapper>
    </MobileLayout>
  )
}

// Mobile-optimized stat cards section
function StatCardsSection({ profileData }: { profileData: any }) {

  // Create stat card data using the new responsive format
  const totalXpData = createStatCardData(
    'Total XP',
    profileData?.totalXp || 0,
    {
      color: 'primary',
      icon: BarChart3,
      progress: {
        current: profileData?.totalXp || 0,
        max: Math.max(profileData?.totalXp || 1000, 1000),
        label: 'Lifetime'
      },
      trend: profileData?.xpAnalytics?.weeklyTrends?.length > 1 ? {
        data: profileData.xpAnalytics.weeklyTrends,
        direction: 'up' as const,
        percentage: profileData.xpAnalytics.projectedWeeklyXp
      } : undefined,
      additionalInfo: profileData?.xpAnalytics?.projectedWeeklyXp && (
        <div className="flex items-center">
          <ArrowUp className="h-4 w-4 mr-1" />
          <span className="text-sm">+{profileData.xpAnalytics.projectedWeeklyXp} this week</span>
        </div>
      )
    }
  )

  const weeklyXpData = createStatCardData(
    'This Week',
    profileData?.currentWeekXp || 0,
    {
      color: 'secondary',
      icon: Calendar,
      progress: {
        current: profileData?.currentWeekXp || 0,
        max: Math.max(profileData?.currentWeekXp || 100, 100),
        label: 'Activity'
      },
      subtitle: `Week ${Math.ceil(new Date().getDate() / 7)}`,
      additionalInfo: (
        <div className="space-y-2">
          {profileData?.streakWeeks && profileData.streakWeeks > 0 && (
            <div className="flex items-center">
              <Flame className="h-4 w-4 mr-1" />
              <span className="text-sm">{profileData.streakWeeks}w streak</span>
            </div>
          )}
          <WeeklyProgressIndicator
            currentWeek={Math.ceil(new Date().getDate() / 7)}
            totalWeeks={52}
          />
        </div>
      )
    }
  )

  const rankData = createStatCardData(
    'Weekly Rank',
    profileData?.xpAnalytics?.rank?.weekly || 0,
    {
      color: 'accent',
      icon: Users,
      progress: {
        current: profileData?.xpAnalytics?.rank?.totalUsers - (profileData?.xpAnalytics?.rank?.weekly || 0) || 0,
        max: profileData?.xpAnalytics?.rank?.totalUsers || 100,
        label: 'Community'
      },
      subtitle: `of ${profileData?.xpAnalytics?.rank?.totalUsers || '—'} scholars`,
      additionalInfo: profileData?.xpAnalytics?.rank?.improvement && (
        <div className="flex items-center">
          {profileData.xpAnalytics.rank.improvement > 0 ? (
            <ArrowUp className="h-4 w-4 mr-1" />
          ) : (
            <ArrowUp className="h-4 w-4 mr-1 rotate-180" />
          )}
          <span className="text-sm">
            {Math.abs(profileData.xpAnalytics.rank.improvement)} positions
          </span>
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
            { text: '+15-25 XP per review', variant: 'outline' },
            { text: 'Community Impact', variant: 'outline' }
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
          { text: `Your Rank: #${profileData?.xpAnalytics?.rank?.weekly || '—'}`, variant: 'outline' }
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
