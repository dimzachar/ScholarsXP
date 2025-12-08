'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout'
import { MobileLayout, MobileSection, MobileHeader } from '@/components/layout/MobileLayout'
import { ENABLE_ACHIEVEMENTS } from '@/config/feature-flags'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'
import {
  User,
  Trophy,
  Zap,
  Calendar,
  TrendingUp,
  FileText,
  Users,
  Award,
  Crown,
  Shield
} from 'lucide-react'
import { SubmissionsList } from '@/components/profile/SubmissionsList'
import { GamifiedRankDisplay, GamifiedRankBadge } from '@/components/gamified'
import { getGamifiedRank } from '@/lib/gamified-ranks'
import { WalletBadge } from '@/components/wallet'

interface UserProfileData {
  profile: {
    id: string
    username: string
    email: string
    role: string
    totalXp: number
    currentWeekXp: number
    streakWeeks: number
    // Optimized API returns joinedAt; keep createdAt optional for backward compat
    joinedAt?: string
    createdAt?: string
    updatedAt?: string
  }
  statistics: {
    totalSubmissions: number
    completedSubmissions: number
    totalReviews: number
    totalAchievements: number
    avgScore: number
    rank: {
      weekly: number
      allTime: number
    }
    xpBreakdown: {
      total: number
      submissions: number
      reviews: number
      achievements: number
      other: number
    }
  }
  recentSubmissions: Array<{
    id: string
    title: string
    url?: string
    platform?: string
    status: string
    // Optimized API uses xpAwarded; legacy may use finalXp
    xpAwarded?: number
    finalXp?: number
    createdAt: string
    aiSummary?: string
    summaryGeneratedAt?: string
    isLegacy?: boolean
  }>
  recentReviews: Array<{
    id: string
    submissionTitle: string
    xpScore: number
    createdAt: string
  }>
  achievements: Array<{
    id: string
    title: string
    description: string
    earnedAt: string
  }>
}

export default function ProfilePage() {
  const { user, isLoading: authLoading } = usePrivyAuthSync()
  const _router = useRouter()
  const { isMobile: _isMobile, isTablet: _isTablet } = useResponsiveLayout()
  const { authenticatedFetch } = useAuthenticatedFetch()

  const [profileData, setProfileData] = useState<UserProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCompleteProfile = useCallback(async () => {
    try {
      setLoading(true)
      
      // Add cache-busting timestamp to ensure fresh data
      const response = await authenticatedFetch(`/api/user/profile/complete?_t=${Date.now()}`)

      if (!response.ok) {
        throw new Error('Failed to fetch profile data')
      }

      const data = await response.json()
      setProfileData(data)
      setError(null)
    } catch (error) {
      console.error('Error fetching profile:', error)
      setError('Failed to load profile data')
    } finally {
      setLoading(false)
      setIsInitialLoad(false)
    }
  }, [authenticatedFetch])

  useEffect(() => {
    if (!authLoading && user) {
      fetchCompleteProfile()
    }
  }, [user, authLoading, fetchCompleteProfile])

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'ADMIN': return <Crown className="h-4 w-4 text-yellow-500" />
      case 'REVIEWER': return <Shield className="h-4 w-4 text-blue-500" />
      default: return <User className="h-4 w-4 text-gray-500" />
    }
  }

  const _getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'REVIEWER': return 'bg-blue-100 text-blue-800 border-blue-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return '—'
    const d = new Date(dateString)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  if (authLoading || (loading && isInitialLoad)) {
    return (
      <MobileLayout>
        <MobileHeader
          title="My Profile"
          subtitle="Loading your profile information..."
          variant="default"
        />
        <MobileSection spacing="normal">
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-gray-200 rounded-lg"></div>
            <div className="h-24 bg-gray-200 rounded-lg"></div>
            <div className="h-24 bg-gray-200 rounded-lg"></div>
          </div>
        </MobileSection>
      </MobileLayout>
    )
  }

  if (error || !profileData) {
    return (
      <MobileLayout>
        <MobileHeader
          title="My Profile"
          subtitle="Error loading profile"
          variant="default"
        />
        <MobileSection spacing="normal">
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-red-500 mb-4">{error || 'Profile data not available'}</p>
              <Button onClick={fetchCompleteProfile} variant="outline">
                Try Again
              </Button>
            </CardContent>
          </Card>
        </MobileSection>
      </MobileLayout>
    )
  }

  const { profile, statistics, recentSubmissions, recentReviews: _recentReviews, achievements: _achievements } = profileData

  return (
    <MobileLayout>
      {/* Hero Section */}
      <MobileSection spacing="normal">
        <div className="p-8 flex flex-col md:flex-row items-center gap-8 text-center md:text-left">
          <div>
            <Avatar className="h-32 w-32 border-4 border-background shadow-xl">
              <AvatarImage src={user?.discordAvatarUrl || undefined} className="object-cover" />
              <AvatarFallback className="text-4xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900">
                {profile.username?.charAt(0)?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <h2 className="text-4xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
                {profile.username}
              </h2>
              <p className="text-muted-foreground mt-1 flex items-center justify-center md:justify-start gap-2">
                <span>Joined {formatDate(profile.joinedAt || profile.createdAt)}</span>
                {/* System permission role (ADMIN, REVIEWER) - only show for elevated permissions */}
                {profile.role !== 'USER' && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-border"></span>
                    <span className="text-primary font-medium flex items-center gap-1">
                      {getRoleIcon(profile.role)}
                      {profile.role}
                    </span>
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-wrap justify-center md:justify-start gap-3">
              {/* Gamified Rank Badge */}
              {getGamifiedRank(profile.totalXp) && (
                <GamifiedRankBadge
                  rank={getGamifiedRank(profile.totalXp)!}
                  size="lg"
                  animated={true}
                />
              )}

              <Badge variant="outline" className="px-3 py-1.5 text-sm border-yellow-500/30 bg-yellow-500/5 text-yellow-600 dark:text-yellow-400 backdrop-blur-sm shadow-sm">
                <Trophy className="h-3.5 w-3.5 mr-1.5 text-yellow-500" />
                Rank #{statistics?.rank?.allTime || 'N/A'}
              </Badge>
              <Badge variant="outline" className="px-3 py-1.5 text-sm border-green-500/30 bg-green-500/5 text-green-600 dark:text-green-400 backdrop-blur-sm shadow-sm">
                <TrendingUp className="h-3.5 w-3.5 mr-1.5 text-green-500" />
                Weekly {statistics?.rank?.weekly && statistics.rank.weekly > 0 ? `#${statistics.rank.weekly}` : '—'}
              </Badge>
              <WalletBadge />
            </div>
          </div>
        </div>
      </MobileSection>

      {/* Gamified Rank Progress */}
      <MobileSection spacing="normal">
        <GamifiedRankDisplay
          totalXp={profile.totalXp}
          variant="card"
          showProgress={true}
          animated={true}
        />
      </MobileSection>

      {/* Stats Grid */}
      <MobileSection spacing="normal">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card className="hover-lift">
            <CardContent className="p-3 flex flex-col items-center justify-center text-center space-y-2">
              <div className="p-3 rounded-full bg-primary/10 text-primary mb-1">
                <Zap className="h-6 w-6" />
              </div>
              <div>
                <span className="text-3xl font-bold tracking-tight">{profile.totalXp}</span>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">Total XP</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift">
            <CardContent className="p-3 flex flex-col items-center justify-center text-center space-y-2">
              <div className="p-3 rounded-full bg-green-500/10 text-green-500 mb-1">
                <Calendar className="h-6 w-6" />
              </div>
              <div>
                <span className="text-3xl font-bold tracking-tight">{profile.streakWeeks}</span>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">Week Streak</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift">
            <CardContent className="p-3 flex flex-col items-center justify-center text-center space-y-2">
              <div className="p-3 rounded-full bg-blue-500/10 text-blue-500 mb-1">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <span className="text-3xl font-bold tracking-tight">{statistics?.totalSubmissions || 0}</span>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">Submissions</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift">
            <CardContent className="p-3 flex flex-col items-center justify-center text-center space-y-2">
              <div className="p-3 rounded-full bg-purple-500/10 text-purple-500 mb-1">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <span className="text-3xl font-bold tracking-tight">{profile.currentWeekXp}</span>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">Week XP</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover-lift">
            <CardContent className="p-3 flex flex-col items-center justify-center text-center space-y-2">
              <div className="p-3 rounded-full bg-orange-500/10 text-orange-500 mb-1">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <span className="text-3xl font-bold tracking-tight">{statistics?.totalReviews ?? 0}</span>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-1">Reviews</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </MobileSection>



      {ENABLE_ACHIEVEMENTS && (
        <MobileSection spacing="normal">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Award className="h-4 w-4 text-purple-500" />
                Achievements
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statistics?.totalAchievements || 0}</div>
              <p className="text-xs text-muted-foreground">Unlocked</p>
            </CardContent>
          </Card>
        </MobileSection>
      )}



      {/* Submissions List */}
      <MobileSection spacing="normal">
        <SubmissionsList submissions={recentSubmissions} />
      </MobileSection>
    </MobileLayout>
  )
}
