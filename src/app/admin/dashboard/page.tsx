'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  FileText,
  Users,
  Shield,
  BarChart3,
  AlertTriangle,
  TrendingUp,
  MessageSquare,
  Settings,
  RefreshCw,
  ArrowRight,
  Award,
  Trophy
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface AdminStats {
  totalUsers: number
  activeUsers: number
  totalSubmissions: number
  pendingSubmissions: number
  totalReviews: number
  pendingFlags: number
  totalXpAwarded: number
  systemHealth: {
    submissionSuccessRate: number
    avgReviewScore: number
    flagRate: number
  }
}

export default function AdminDashboardPage() {
  const { user: _user, loading } = useAuth()
  const _router = useRouter()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)

  useEffect(() => {
    fetchAdminStats()
  }, [])

  const fetchAdminStats = async () => {
    try {
      setLoadingStats(true)

      // Fetch all-time stats (includes legacy data)
      const statsResponse = await fetch('/api/admin/stats', { credentials: 'include' })

      if (statsResponse.ok) {
        const statsData = await statsResponse.json()

        // Also fetch recent analytics for additional metrics
        const analyticsResponse = await fetch('/api/admin/analytics?timeframe=last_30_days', { credentials: 'include' })
        const analyticsData = analyticsResponse.ok ? await analyticsResponse.json() : null

        setStats({
          totalUsers: statsData.data.totalUsers,
          activeUsers: analyticsData?.data?.overview?.activeUsers || 0,
          totalSubmissions: statsData.data.totalSubmissions, // Includes legacy
          pendingSubmissions: statsData.data.pendingReviews,
          totalReviews: statsData.data.totalPeerReviews,
          pendingFlags: statsData.data.flaggedSubmissions,
          totalXpAwarded: analyticsData?.data?.overview?.totalXpAwarded || 0,
          systemHealth: {
            submissionSuccessRate: analyticsData?.data?.overview?.submissionSuccessRate || 0,
            avgReviewScore: analyticsData?.data?.overview?.avgReviewScore || 0,
            flagRate: statsData.data.totalSubmissions > 0
              ? (statsData.data.flaggedSubmissions / statsData.data.totalSubmissions) * 100
              : 0
          }
        })
      }
    } catch (error) {
      console.error('Error fetching admin stats:', error)
    } finally {
      setLoadingStats(false)
    }
  }

  const adminModules = [
    {
      title: 'Submission Management',
      description: 'Manage and moderate all platform submissions',
      icon: FileText,
      href: '/admin/submissions',
      color: 'bg-info/10 border-info/20 hover:bg-info/20',
      iconColor: 'text-info',
      stats: stats ? [
        { label: 'Total', value: stats.totalSubmissions },
        { label: 'Pending', value: stats.pendingSubmissions },
        { label: 'Success Rate', value: `${stats.systemHealth.submissionSuccessRate}%` }
      ] : []
    },
    {
      title: 'XP Management',
      description: 'Detailed XP oversight and modification tools',
      icon: Award,
      href: '/admin/xp-management',
      color: 'bg-yellow/10 border-yellow/20 hover:bg-yellow/20',
      iconColor: 'text-yellow',
      stats: stats ? [
        { label: 'Total XP', value: stats.totalXpAwarded.toLocaleString() },
        { label: 'Pending Reviews', value: stats.pendingSubmissions },
        { label: 'Avg Score', value: stats.systemHealth.avgReviewScore.toFixed(1) }
      ] : []
    },
    {
      title: 'User Management',
      description: 'Manage user accounts, roles, and permissions',
      icon: Users,
      href: '/admin/users',
      color: 'bg-success/10 border-success/20 hover:bg-success/20',
      iconColor: 'text-success',
      stats: stats ? [
        { label: 'Total Users', value: stats.totalUsers },
        { label: 'Active (7d)', value: stats.activeUsers },
        { label: 'Activity Rate', value: `${Math.round((stats.activeUsers / stats.totalUsers) * 100)}%` }
      ] : []
    },
    {
      title: 'Content Moderation',
      description: 'Review and moderate flagged content',
      icon: Shield,
      href: '/admin/moderation',
      color: 'bg-destructive/10 border-destructive/20 hover:bg-destructive/20',
      iconColor: 'text-destructive',
      stats: stats ? [
        { label: 'Pending Flags', value: stats.pendingFlags },
        { label: 'Flag Rate', value: `${stats.systemHealth.flagRate.toFixed(2)}%` },
        { label: 'Reviews', value: stats.totalReviews }
      ] : []
    },
    {
      title: 'System Analytics',
      description: 'Comprehensive platform insights and metrics',
      icon: BarChart3,
      href: '/admin/analytics',
      color: 'bg-purple/10 border-purple/20 hover:bg-purple/20',
      iconColor: 'text-purple',
      stats: stats ? [
        { label: 'Total XP', value: stats.totalXpAwarded.toLocaleString() },
        { label: 'Avg Review', value: stats.systemHealth.avgReviewScore.toFixed(1) },
        { label: 'Health Score', value: `${Math.round((stats.systemHealth.submissionSuccessRate + (stats.systemHealth.avgReviewScore * 20) + (100 - stats.systemHealth.flagRate)) / 3)}%` }
      ] : []
    }
  ]

  const quickActions = [
    {
      title: 'Review Pending Flags',
      description: 'Address content moderation issues',
      icon: AlertTriangle,
      href: '/admin/moderation?status=PENDING',
      urgent: stats ? stats.pendingFlags > 0 : false
    },
    {
      title: 'View Detailed Leaderboard',
      description: 'Transparent XP breakdown by submission',
      icon: Trophy,
      href: '/leaderboard/detailed',
      urgent: false
    },
    {
      title: 'Monitor System Health',
      description: 'Check platform performance metrics',
      icon: TrendingUp,
      href: '/admin/analytics'
    },
    {
      title: 'Manage User Roles',
      description: 'Update user permissions and access',
      icon: Settings,
      href: '/admin/users'
    }
  ]

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }



  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Admin Dashboard</h1>
            <p className="text-muted-foreground">
              Comprehensive platform management and oversight
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchAdminStats}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </div>

        {/* System Health Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card className="bg-gradient-to-br from-info/10 to-info/20 border-info/20">
              <CardContent className="p-4 text-center">
                <Users className="h-8 w-8 text-info mx-auto mb-2" />
                <div className="text-2xl font-bold text-foreground">
                  {stats.totalUsers}
                </div>
                <div className="text-sm text-info">Total Users</div>
                <div className="text-xs text-info/80 mt-1">
                  {stats.activeUsers} active (7d)
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-success/10 to-success/20 border-success/20">
              <CardContent className="p-4 text-center">
                <FileText className="h-8 w-8 text-success mx-auto mb-2" />
                <div className="text-2xl font-bold text-foreground">
                  {stats.totalSubmissions}
                </div>
                <div className="text-sm text-success">Submissions</div>
                <div className="text-xs text-success/80 mt-1">
                  {stats.systemHealth.submissionSuccessRate}% success rate
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-purple/10 to-purple/20 border-purple/20">
              <CardContent className="p-4 text-center">
                <MessageSquare className="h-8 w-8 text-purple mx-auto mb-2" />
                <div className="text-2xl font-bold text-foreground">
                  {stats.totalReviews}
                </div>
                <div className="text-sm text-purple">Reviews</div>
                <div className="text-xs text-purple/80 mt-1">
                  {stats.systemHealth.avgReviewScore.toFixed(1)} avg score
                </div>
              </CardContent>
            </Card>
            
            <Card className={`bg-gradient-to-br ${stats.pendingFlags > 0 ? 'from-destructive/10 to-destructive/20 border-destructive/20' : 'from-muted/50 to-muted border-border'}`}>
              <CardContent className="p-4 text-center">
                <Shield className={`h-8 w-8 ${stats.pendingFlags > 0 ? 'text-destructive' : 'text-muted-foreground'} mx-auto mb-2`} />
                <div className={`text-2xl font-bold ${stats.pendingFlags > 0 ? 'text-destructive' : 'text-foreground'}`}>
                  {stats.pendingFlags}
                </div>
                <div className={`text-sm ${stats.pendingFlags > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  Pending Flags
                </div>
                {stats.pendingFlags > 0 && (
                  <Badge variant="destructive" className="text-xs mt-1">
                    Needs Attention
                  </Badge>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Quick Actions */}
        {stats && stats.pendingFlags > 0 && (
          <Card className="mb-8 border-destructive/20 bg-destructive/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Urgent Actions Required
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-destructive font-medium">
                    {stats.pendingFlags} content flag{stats.pendingFlags !== 1 ? 's' : ''} pending review
                  </p>
                  <p className="text-destructive/80 text-sm">
                    Review and resolve flagged content to maintain platform quality
                  </p>
                </div>
                <Link href="/admin/moderation?status=PENDING">
                  <Button variant="destructive">
                    Review Flags
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Admin Modules */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {adminModules.map((module) => (
            <Link key={module.title} href={module.href}>
              <Card className={`transition-all duration-200 cursor-pointer ${module.color}`}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <module.icon className={`h-8 w-8 ${module.iconColor}`} />
                      <div>
                        <CardTitle className="text-lg">{module.title}</CardTitle>
                        <CardDescription>{module.description}</CardDescription>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardHeader>
                {!loadingStats && module.stats.length > 0 && (
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      {module.stats.map((stat, index) => (
                        <div key={index} className="text-center">
                          <div className="font-bold text-lg">{stat.value}</div>
                          <div className="text-xs text-muted-foreground">{stat.label}</div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
                {loadingStats && (
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="text-center">
                          <div className="h-6 bg-muted rounded animate-pulse mb-1"></div>
                          <div className="h-3 bg-muted rounded animate-pulse"></div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                )}
              </Card>
            </Link>
          ))}
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common administrative tasks and shortcuts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {quickActions.map((action) => (
                <Link key={action.title} href={action.href}>
                  <Card className={`transition-all duration-200 cursor-pointer hover:shadow-md ${
                    action.urgent ? 'border-destructive/20 bg-destructive/10' : 'hover:bg-muted/50'
                  }`}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <action.icon className={`h-6 w-6 ${
                          action.urgent ? 'text-destructive' : 'text-muted-foreground'
                        }`} />
                        <div className="flex-1">
                          <h4 className={`font-medium ${action.urgent ? 'text-destructive' : ''}`}>
                            {action.title}
                          </h4>
                          <p className={`text-sm ${
                            action.urgent ? 'text-destructive/80' : 'text-muted-foreground'
                          }`}>
                            {action.description}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
