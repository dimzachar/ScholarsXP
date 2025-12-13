'use client'
/* eslint @typescript-eslint/no-explicit-any: off */

import React, { useState, useEffect } from 'react'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import AuthGuard from '@/components/Auth/AuthGuard'
import { AdminGuard } from '@/components/Auth/RoleGuard'
import { api } from '@/lib/api-client'
import {
  FileText,
  Users,
  Shield,
  BarChart3,
  AlertTriangle,
  TrendingUp,
  MessageSquare,
  Award,
  Settings,
  RefreshCw,
  ArrowRight,
  CheckCircle,
  Zap,
  Calendar,
  Database,
  Activity,
  PauseCircle
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import AutomationStatus from '@/components/Admin/AutomationStatus'
import SubmissionsManagement from '@/components/Admin/SubmissionsManagement'
import ReviewsManagement from '@/components/Admin/ReviewsManagement'

interface AdminStats {
  totalUsers: number
  activeUsers: number
  totalSubmissions: number
  pendingSubmissions: number
  totalReviews: number
  pendingFlags: number
  totalXpAwarded: number
  finalizedSubmissions: number
  underPeerReview: number
  finalizationRate: number
  systemHealth: {
    submissionSuccessRate: number
    avgReviewScore: number
    flagRate: number
  }
}

// Helper functions for system health display
const getHealthIcon = (health: { submissionSuccessRate: number; avgReviewScore: number; flagRate: number }) => {
  const overallScore = (health.submissionSuccessRate + health.avgReviewScore - health.flagRate) / 2
  if (overallScore >= 80) return <CheckCircle className="h-4 w-4 text-success" />
  if (overallScore >= 60) return <AlertTriangle className="h-4 w-4 text-warning" />
  return <AlertTriangle className="h-4 w-4 text-destructive" />
}

const getHealthColor = (health: { submissionSuccessRate: number; avgReviewScore: number; flagRate: number }) => {
  const overallScore = (health.submissionSuccessRate + health.avgReviewScore - health.flagRate) / 2
  if (overallScore >= 80) return 'text-success'
  if (overallScore >= 60) return 'text-warning'
  return 'text-destructive'
}

export default function AdminDashboardPage() {
  const { user: _user, isLoading: loading } = usePrivyAuthSync()
  const router = useRouter()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [, setLoadingStats] = useState(true)
  const [message, setMessage] = useState<string>('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    // Only fetch stats when user is loaded and authenticated with privyUserId
    if (!loading && _user && _user.privyUserId) {
      fetchAdminStats()
    }
  }, [loading, _user, _user?.privyUserId])

  const fetchAdminStats = async () => {
    try {
      setLoadingStats(true)

      // Fetch all-time stats (includes legacy data)
      const statsData = await api.get('/api/admin/stats')

      // Also fetch recent analytics for additional metrics
      let analyticsData = null
      try {
        analyticsData = await api.get('/api/admin/analytics?timeframe=last_30_days')
      } catch (analyticsError) {
        console.warn('Analytics API failed, using stats only:', analyticsError)
      }

      // Calculate finalization statistics
      const finalized = statsData.finalizedSubmissions || 0
      const underPeerReview = statsData.underPeerReview || 0
      const totalInProgress = finalized + underPeerReview
      const finalizationRate = totalInProgress > 0 ? (finalized / totalInProgress) * 100 : 0

      setStats({
        totalUsers: statsData.totalUsers,
        activeUsers: statsData.activeUsers, // Use direct API field
        totalSubmissions: statsData.totalSubmissions, // Includes legacy
        pendingSubmissions: statsData.pendingReviews,
        totalReviews: statsData.totalPeerReviews,
        pendingFlags: statsData.flaggedSubmissions,
        totalXpAwarded: analyticsData?.overview?.totalXpAwarded || 0,
        finalizedSubmissions: finalized,
        underPeerReview: underPeerReview,
        finalizationRate: finalizationRate,
        systemHealth: {
          submissionSuccessRate: analyticsData?.overview?.submissionSuccessRate || 0,
          avgReviewScore: analyticsData?.overview?.avgReviewScore || 0,
          flagRate: statsData.totalSubmissions > 0
            ? (statsData.flaggedSubmissions / statsData.totalSubmissions) * 100
            : 0
        }
      })
    } catch (error) {
      console.error('Error fetching admin stats:', error)
      // Set default stats if analytics fails
      setStats({
        totalUsers: 0,
        activeUsers: 0,
        totalSubmissions: 0,
        pendingSubmissions: 0,
        totalReviews: 0,
        pendingFlags: 0,
        totalXpAwarded: 0,
        finalizedSubmissions: 0,
        underPeerReview: 0,
        finalizationRate: 0,
        systemHealth: {
          submissionSuccessRate: 0,
          avgReviewScore: 0,
          flagRate: 0
        }
      })
    } finally {
      setLoadingStats(false)
    }
  }

  const handleSystemAction = async (action: string) => {
    // Add confirmation for destructive operations
    if (action === 'weekly') {
      const confirmed = window.confirm(
        'Are you sure you want to process the weekly reset?\n\n' +
        'This will:\n' +
        '• Process streaks for all users\n' +
        '• Apply penalties for missed reviews\n' +
        '• Reset weekly XP counters\n' +
        '• Generate weekly leaderboards\n\n' +
        'This action affects all users and cannot be undone.'
      )
      if (!confirmed) return
    }

    try {
      setActionLoading(action)
      setMessage('')

      console.log(`🔧 [ADMIN UI] Triggering system action: ${action}`)

      const response = await api.post(`/api/admin/system/${action}`)

      // Extract detailed information from response
      const result = response.data || response
      const summary = result.summary || result.message || `${action} action completed successfully`
      const details = result.details

      // Create detailed success message
      let successMessage = summary
      if (details) {
        if (action === 'weekly' && details.usersProcessed !== undefined) {
          successMessage = `Weekly reset completed: ${details.usersProcessed} users processed, ${details.streaksAwarded} streaks awarded, ${details.penaltiesApplied} penalties applied`
        } else if (action === 'aggregate' && details.submissionsProcessed !== undefined) {
          successMessage = `XP aggregation completed: ${details.submissionsProcessed} submissions processed and finalized`
        } else if (action === 'refresh') {
          successMessage = 'Data refresh completed: system cache cleared and statistics updated'
        }
      }

      setMessage(successMessage)

      // Always refresh stats after any system action
      await fetchAdminStats()

      console.log(`✅ [ADMIN UI] System action completed: ${action}`)

    } catch (error: unknown) {
      console.error(`❌ [ADMIN UI] System action failed: ${action}`, error)

      // Extract error details for better user feedback
      let errorMessage = `Error executing ${action} action`

      if ((error as any)?.response?.data?.error) {
        const errorData = (error as any).response.data.error
        if (typeof errorData === 'string') {
          errorMessage = `${getActionDisplayName(action)} failed: ${errorData}`
        } else if (errorData.message) {
          errorMessage = `${getActionDisplayName(action)} failed: ${errorData.message}`
        }
      } else if ((error as any)?.message) {
        errorMessage = `${getActionDisplayName(action)} failed: ${(error as any).message}`
      }

      setMessage(errorMessage)
    } finally {
      setActionLoading(null)
    }
  }

  const getActionDisplayName = (action: string): string => {
    switch (action) {
      case 'weekly': return 'Weekly Operations'
      case 'aggregate': return 'XP Aggregation'
      case 'refresh': return 'Data Refresh'
      default: return action
    }
  }



  const _adminModules = [
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
    },
    {
      title: 'Legacy Data Import',
      description: 'Import Google Forms data for duplicate detection',
      icon: Database,
      href: '/admin/legacy-import',
      color: 'bg-orange/10 border-orange/20 hover:bg-orange/20',
      iconColor: 'text-orange',
      stats: [
        { label: 'Import', value: 'CSV Data' },
        { label: 'Prevent', value: 'Duplicates' },
        { label: 'Status', value: 'Ready' }
      ]
    },
    {
      title: 'XP Management',
      description: 'Manually adjust user XP for legacy sync',
      icon: Award,
      href: '/admin/xp-management',
      color: 'bg-yellow/10 border-yellow/20 hover:bg-yellow/20',
      iconColor: 'text-yellow',
      stats: [
        { label: 'Adjust', value: 'User XP' },
        { label: 'Sync', value: 'Legacy' },
        { label: 'Audit', value: 'Trail' }
      ]
    },
    {
      title: 'Detailed Leaderboard',
      description: 'View comprehensive submission analytics and user performance',
      icon: TrendingUp,
      href: '/leaderboard/detailed',
      color: 'bg-blue/10 border-blue/20 hover:bg-blue/20',
      iconColor: 'text-blue',
      stats: stats ? [
        { label: 'Total Subs', value: stats.totalSubmissions },
        { label: 'Avg XP', value: Math.round(stats.totalXpAwarded / Math.max(stats.totalSubmissions, 1)) },
        { label: 'Users', value: stats.totalUsers }
      ] : []
    }
    ,
    {
      title: 'Audit Logs',
      description: 'View and filter platform actions',
      icon: Activity,
      href: '/admin/logs',
      color: 'bg-slate/10 border-slate/20 hover:bg-slate/20',
      iconColor: 'text-slate',
      stats: [
        { label: 'Filter', value: 'Time & Type' },
        { label: 'Sort', value: 'Columns' },
        { label: 'Search', value: 'Details' }
      ]
    }
  ]

  const _quickActions = [
    {
      title: 'Import Legacy Data',
      description: 'Import Google Forms submissions for duplicate detection',
      icon: Database,
      href: '/admin/legacy-import',
      urgent: false
    },
    {
      title: 'Review Pending Flags',
      description: 'Address content moderation issues',
      icon: AlertTriangle,
      href: '/admin/moderation?status=PENDING',
      urgent: stats ? stats.pendingFlags > 0 : false
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
      <AuthGuard>
        <AdminGuard>
          <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
            <div className="container mx-auto px-4 py-8">
              <div className="text-center">
                <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
                  <Settings className="h-4 w-4" />
                  <span>Loading Admin Panel</span>
                </div>
                <h1 className="text-3xl font-bold text-foreground mb-4">Admin Dashboard</h1>
                <p className="text-muted-foreground">Loading system statistics...</p>
              </div>
            </div>
          </div>
        </AdminGuard>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <AdminGuard>
        <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
          <div className="container mx-auto px-4 py-8 pb-20 md:pb-8">
            {/* Header */}
            <div className="mb-8">
              <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
                <Settings className="h-4 w-4" />
                <span>System Administration</span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2">
                    Admin Dashboard{' '}
                  </h1>
                  <p className="text-lg text-muted-foreground">
                    Manage submissions, review flags, and oversee system operations
                  </p>
                </div>

                {stats && (
                  <div className="flex items-center gap-2">
                    {getHealthIcon(stats.systemHealth)}
                    <span className={`font-medium ${getHealthColor(stats.systemHealth)}`}>
                      System {(() => {
                        const overallScore = (stats.systemHealth.submissionSuccessRate + stats.systemHealth.avgReviewScore - stats.systemHealth.flagRate) / 2
                        if (overallScore >= 80) return 'Healthy'
                        if (overallScore >= 60) return 'Warning'
                        return 'Critical'
                      })()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {message && (
              <div className={`mb-6 p-4 rounded-lg border flex items-start gap-3 ${message.includes('successfully') || message.includes('completed')
                ? 'bg-success/10 border-success/20 text-success'
                : message.includes('failed') || message.includes('Error')
                  ? 'bg-destructive/10 border-destructive/20 text-destructive'
                  : 'bg-warning/10 border-warning/20 text-warning'
                }`}>
                {message.includes('successfully') || message.includes('completed') ? (
                  <CheckCircle className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                ) : message.includes('failed') || message.includes('Error') ? (
                  <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="font-medium">{message}</p>
                  {(message.includes('Weekly reset completed') || message.includes('XP aggregation completed')) && (
                    <p className="text-sm mt-1 opacity-80">
                      Dashboard statistics have been automatically refreshed.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Stats Overview */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <Card className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4">
                      <div className="p-3 bg-primary/20 rounded-lg">
                        <FileText className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">{stats.totalSubmissions}</p>
                        <p className="text-muted-foreground">Total Submissions</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4">
                      <div className="p-3 bg-warning/20 rounded-lg">
                        <MessageSquare className="h-6 w-6 text-warning" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">{stats.totalReviews}</p>
                        <p className="text-muted-foreground">Total Reviews</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4">
                      <div className="p-3 bg-green/20 rounded-lg">
                        <BarChart3 className="h-6 w-6 text-green" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">{stats.finalizationRate.toFixed(0)}%</p>
                        <p className="text-muted-foreground">Finalization Progress</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4">
                      <div className="p-3 bg-primary/20 rounded-lg">
                        <Users className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">{stats.activeUsers}</p>
                        <p className="text-muted-foreground">Active Users</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Main Content */}
            <Tabs defaultValue="actions" className="space-y-6">
              <TabsList className="grid w-full grid-cols-6 max-w-4xl mx-auto">
                <TabsTrigger value="actions" className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Actions
                </TabsTrigger>
                <TabsTrigger value="automation" className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Automation
                </TabsTrigger>
                <TabsTrigger value="users" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Users
                </TabsTrigger>
                <TabsTrigger value="submissions" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Submissions
                </TabsTrigger>
                <TabsTrigger value="reviews" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Reviews
                </TabsTrigger>
                <TabsTrigger value="analytics" className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Analytics
                </TabsTrigger>
              </TabsList>

              <TabsContent value="automation" className="space-y-6">
                <AutomationStatus />
              </TabsContent>

              <TabsContent value="actions" className="space-y-6">
                <Card className="border-0 shadow-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5" />
                      System Actions
                    </CardTitle>
                    <CardDescription>
                      Trigger system-wide operations and maintenance tasks
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="p-4 bg-muted/50 border border-border rounded-lg">
                          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Weekly Operations
                          </h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Process weekly streaks, apply penalties, reset weekly XP counters, and generate leaderboards.
                            <span className="font-medium text-orange-600 dark:text-orange-400"> Use with caution - this affects all users.</span>
                          </p>
                          <Button
                            onClick={() => handleSystemAction('weekly')}
                            disabled={actionLoading === 'weekly'}
                            variant="secondary"
                            className="w-full"
                          >
                            {actionLoading === 'weekly' ? (
                              <>
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                Processing Weekly Reset...
                              </>
                            ) : (
                              <>
                                <Calendar className="mr-2 h-4 w-4" />
                                Process Weekly Reset
                              </>
                            )}
                          </Button>
                        </div>

                        <div className="p-4 bg-muted/50 border border-border rounded-lg">
                          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            XP Aggregation
                          </h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Finalize submissions with 3+ peer reviews, calculate final XP scores, and award XP to users.
                            <span className="font-medium text-blue-600 dark:text-blue-400"> Safe to run multiple times.</span>
                          </p>
                          <Button
                            onClick={() => handleSystemAction('aggregate')}
                            disabled={actionLoading === 'aggregate'}
                            variant="secondary"
                            className="w-full"
                          >
                            {actionLoading === 'aggregate' ? (
                              <>
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                Processing XP Aggregation...
                              </>
                            ) : (
                              <>
                                <Zap className="mr-2 h-4 w-4" />
                                Process XP Aggregation
                              </>
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="p-4 bg-muted/50 border border-border rounded-lg">
                          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                            <Database className="h-4 w-4" />
                            Data Refresh
                          </h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Clear system cache and refresh dashboard statistics. Updates analytics, leaderboards, and admin data.
                            <span className="font-medium text-green-600 dark:text-green-400"> Safe operation - no data changes.</span>
                          </p>
                          <Button
                            onClick={() => handleSystemAction('refresh')}
                            disabled={actionLoading === 'refresh'}
                            variant="secondary"
                            className="w-full"
                          >
                            {actionLoading === 'refresh' ? (
                              <>
                                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                Refreshing Data...
                              </>
                            ) : (
                              <>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Refresh Data
                              </>
                            )}
                          </Button>
                        </div>

                        <div className="p-4 bg-muted/50 border border-border rounded-lg">
                          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            System Health
                          </h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Monitor system performance and security status
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Status:</span>
                            <Badge variant={stats?.systemHealth && (stats.systemHealth.submissionSuccessRate + stats.systemHealth.avgReviewScore - stats.systemHealth.flagRate) / 2 >= 60 ? 'default' : 'destructive'}>
                              {stats?.systemHealth ?
                                (() => {
                                  const overallScore = (stats.systemHealth.submissionSuccessRate + stats.systemHealth.avgReviewScore - stats.systemHealth.flagRate) / 2
                                  if (overallScore >= 80) return 'Healthy'
                                  if (overallScore >= 60) return 'Warning'
                                  return 'Critical'
                                })() : 'Unknown'}
                            </Badge>
                          </div>
                        </div>
                      </div>



                      <div className="space-y-4">
                        <div className="p-4 bg-muted/50 border border-border rounded-lg">
                          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            Detailed Leaderboard
                          </h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            View comprehensive submission analytics and user performance
                          </p>
                          <Button
                            onClick={() => window.open('/leaderboard/detailed', '_blank')}
                            className="w-full"
                            variant="outline"
                          >
                            <ArrowRight className="mr-2 h-4 w-4" />
                            Open Leaderboard
                          </Button>
                        </div>

                        <div className="p-4 bg-muted/50 border border-border rounded-lg">
                          <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                            <Award className="h-4 w-4" />
                            Monthly Leaderboards (Admin)
                          </h3>
                          <p className="text-sm text-muted-foreground mb-4">
                            Preview standings, award winners, manage cooldowns and history
                          </p>
                          <Button
                            onClick={() => window.open('/admin/leaderboards', '_blank')}
                            className="w-full"
                            variant="outline"
                          >
                            <ArrowRight className="mr-2 h-4 w-4" />
                            Open Monthly Leaderboards
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="users" className="space-y-6">
                <Card className="border-0 shadow-xl">
                  <CardHeader>
                    <CardTitle>User Management</CardTitle>
                    <CardDescription>Manage user roles and permissions</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-muted-foreground">
                      Access the comprehensive user management interface to view, filter, and manage all users in the system.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4">
                      <Button
                        onClick={() => router.push('/admin/users')}
                        className="flex items-center gap-2"
                      >
                        <Users className="h-4 w-4" />
                        Open User Management
                      </Button>
                      <Button
                        onClick={() => router.push('/admin/reviewer-availability')}
                        className="flex items-center gap-2"
                        variant="outline"
                      >
                        <PauseCircle className="h-4 w-4" />
                        Manage Reviewer Availability
                      </Button>
                      <div className="text-sm text-muted-foreground space-y-1">
                        <p>• View and search all users</p>
                        <p>• Manage user roles and permissions</p>
                        <p>• Bulk operations and XP adjustments</p>
                        <p>• User activity and performance metrics</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="submissions" className="space-y-6">
                <SubmissionsManagement />
              </TabsContent>

              <TabsContent value="reviews" className="space-y-6">
                <ReviewsManagement />
              </TabsContent>

              <TabsContent value="analytics" className="space-y-6">
                <Card className="border-0 shadow-xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      System Analytics
                    </CardTitle>
                    <CardDescription>
                      Detailed insights and performance metrics
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <h3 className="font-semibold text-foreground">Weekly Performance</h3>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">XP Awarded This Week</span>
                            <span className="font-medium">{stats?.totalXpAwarded || 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Active Participants</span>
                            <span className="font-medium">{stats?.activeUsers || 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Pending Reviews</span>
                            <span className="font-medium">{stats?.totalReviews || 0}</span>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="font-semibold text-foreground">System Health</h3>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Total Submissions</span>
                            <span className="font-medium">{stats?.totalSubmissions || 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">Flagged Content</span>
                            <span className="font-medium text-destructive">{stats?.pendingFlags || 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-muted-foreground">System Status</span>
                            <Badge variant={stats?.systemHealth && (stats.systemHealth.submissionSuccessRate + stats.systemHealth.avgReviewScore - stats.systemHealth.flagRate) / 2 >= 60 ? 'default' : 'destructive'}>
                              {stats?.systemHealth ?
                                (() => {
                                  const overallScore = (stats.systemHealth.submissionSuccessRate + stats.systemHealth.avgReviewScore - stats.systemHealth.flagRate) / 2
                                  if (overallScore >= 80) return 'Healthy'
                                  if (overallScore >= 60) return 'Warning'
                                  return 'Critical'
                                })() : 'Unknown'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </AdminGuard>
    </AuthGuard>
  )
}
