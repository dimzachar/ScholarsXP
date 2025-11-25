'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/contexts/AuthContext'
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout'
import { MobileLayout, MobileSection, MobileHeader } from '@/components/layout/MobileLayout'
import { ENABLE_ACHIEVEMENTS } from '@/config/feature-flags'
import {
  ArrowLeft,
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
  const { user, userProfile: _userProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const { isMobile, isTablet: _isTablet } = useResponsiveLayout()

  const [profileData, setProfileData] = useState<UserProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && user) {
      fetchCompleteProfile()
    }
  }, [user, authLoading])

  const fetchCompleteProfile = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/user/profile/complete')

      if (!response.ok) {
        throw new Error('Failed to fetch profile data')
      }

      const data = await response.json()
      setProfileData(data)
    } catch (error) {
      console.error('Error fetching profile:', error)
      setError('Failed to load profile data')
    } finally {
      setLoading(false)
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'ADMIN': return <Crown className="h-4 w-4 text-yellow-500" />
      case 'REVIEWER': return <Shield className="h-4 w-4 text-blue-500" />
      default: return <User className="h-4 w-4 text-gray-500" />
    }
  }

  const getRoleBadgeColor = (role: string) => {
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

  if (authLoading || loading) {
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
      {/* Header */}
      <MobileSection spacing="tight">
        <div className={isMobile ? "space-y-4" : "flex items-center justify-between"}>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              className={isMobile ? "min-h-11 px-3" : ""}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className={isMobile ? "text-xl font-bold" : "text-2xl font-bold"}>
                My Profile
              </h1>
              <p className={isMobile ? "text-sm text-muted-foreground" : "text-muted-foreground"}>
                Your learning journey and achievements
              </p>
            </div>
          </div>
        </div>
      </MobileSection>

      {/* Profile Overview */}
      <MobileSection spacing="normal">
        <Card>
          <CardContent className={isMobile ? "p-4" : "p-6"}>
            <div className={isMobile ? "space-y-4" : "flex items-start gap-6"}>
              <Avatar className={isMobile ? "h-16 w-16 mx-auto" : "h-20 w-20"}>
                <AvatarImage src={user?.user_metadata?.avatar_url} />
                <AvatarFallback className={isMobile ? "text-base" : "text-lg"}>
                  {profile.username?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-4">
                <div>
                  <div className={isMobile ? "text-center space-y-2 mb-3" : "flex items-center gap-3 mb-2"}>
                    <h2 className={isMobile ? "text-xl font-bold" : "text-2xl font-bold"}>
                      {profile.username}
                    </h2>
                    <div className={isMobile ? "flex justify-center gap-2" : "flex gap-3"}>
                      <Badge className={`${getRoleBadgeColor(profile.role)} flex items-center gap-1`}>
                        {getRoleIcon(profile.role)}
                        {profile.role}
                      </Badge>
                      <Badge variant="outline" className="flex items-center gap-1 border-yellow-500/50 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                        <Trophy className="h-3 w-3" />
                        #{statistics?.rank?.allTime || 'N/A'} All-Time
                      </Badge>
                    </div>
                  </div>
                  <p className={isMobile ? "text-center text-sm text-muted-foreground" : "text-muted-foreground"}>
                    Joined in {formatDate(profile.joinedAt || profile.createdAt)}
                  </p>
                </div>

                <div className={isMobile ? "grid grid-cols-2 gap-3" : "grid grid-cols-3 gap-6"}>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Zap className="h-4 w-4 text-primary" />
                      <span className="text-2xl font-bold text-primary">{profile.totalXp}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Total XP</p>
                  </div>

                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Calendar className="h-4 w-4 text-green-500" />
                      <span className="text-2xl font-bold">{profile.streakWeeks}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Week Streak</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <FileText className="h-4 w-4 text-blue-500" />
                      <span className="text-2xl font-bold">{statistics?.totalSubmissions || 0}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Submissions</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      <span className="text-2xl font-bold">{profile.currentWeekXp} XP</span>
                    </div>
                    <p className="text-xs text-muted-foreground">This Week</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Users className="h-4 w-4 text-blue-500" />
                      <span className="text-2xl font-bold">{statistics?.totalReviews ?? 0}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Total Reviews</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
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



      {/* Recent Submissions */}
      <MobileSection spacing="normal">
        <Card>
          <CardHeader className={isMobile ? 'p-4 pb-2' : ''}>
            <CardTitle className={isMobile ? 'text-base' : 'text-lg'}>Recent Submissions</CardTitle>
          </CardHeader>
          <CardContent className={isMobile ? 'p-4 pt-0' : ''}>
            {recentSubmissions && recentSubmissions.length > 0 ? (
              <div className="space-y-3">
                {recentSubmissions.map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="min-w-0 mr-3">
                      <p className="font-medium truncate">{sub.title || sub.url || 'Untitled Submission'}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(sub.createdAt)}
                        {sub.platform ? ` • ${sub.platform}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{(sub.xpAwarded ?? sub.finalXp ?? 0)} XP</p>
                      <p className="text-xs text-muted-foreground">{sub.status}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No recent submissions</p>
            )}
          </CardContent>
        </Card>
      </MobileSection>
    </MobileLayout>
  )
}
