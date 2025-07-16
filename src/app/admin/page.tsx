'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
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
  Database
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

// Helper functions for system health display
const getHealthIcon = (health: { submissionSuccessRate: number; avgReviewScore: number; flagRate: number }) => {
  const overallScore = (health.submissionSuccessRate + health.avgReviewScore - health.flagRate) / 2
  if (overallScore >= 80) return <CheckCircle className="h-4 w-4 text-green-500" />
  if (overallScore >= 60) return <AlertTriangle className="h-4 w-4 text-yellow-500" />
  return <AlertTriangle className="h-4 w-4 text-red-500" />
}

const getHealthColor = (health: { submissionSuccessRate: number; avgReviewScore: number; flagRate: number }) => {
  const overallScore = (health.submissionSuccessRate + health.avgReviewScore - health.flagRate) / 2
  if (overallScore >= 80) return 'text-green-600'
  if (overallScore >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

export default function AdminDashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)
  const [message, setMessage] = useState<string>('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [submissions, setSubmissions] = useState<any[]>([])

  useEffect(() => {
    fetchAdminStats()
    fetchSubmissions() // Also load submissions on component mount
  }, [])

  const fetchAdminStats = async () => {
    try {
      setLoadingStats(true)

      // Fetch overview analytics using authenticated API client
      const data = await api.get('/api/admin/analytics?timeframe=last_30_days')

      setStats({
        totalUsers: data.overview.totalUsers,
        activeUsers: data.overview.activeUsers,
        totalSubmissions: data.overview.totalSubmissions,
        pendingSubmissions: data.overview.totalSubmissions - data.overview.completedSubmissions,
        totalReviews: data.overview.totalReviews,
        pendingFlags: data.overview.pendingFlags,
        totalXpAwarded: data.overview.totalXpAwarded,
        systemHealth: {
          submissionSuccessRate: data.overview.submissionSuccessRate,
          avgReviewScore: data.overview.avgReviewScore,
          flagRate: data.overview.totalSubmissions > 0
            ? (data.overview.pendingFlags / data.overview.totalSubmissions) * 100
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
    try {
      setActionLoading(action)
      setMessage('')

      await api.post(`/api/admin/system/${action}`)

      setMessage(`${action} action completed successfully`)
      if (action === 'refresh') {
        await fetchAdminStats()
      }
    } catch (error) {
      setMessage(`Error executing ${action} action`)
    } finally {
      setActionLoading(null)
    }
  }

  const fetchSubmissions = async () => {
    try {
      setSubmissionsLoading(true)
      console.log('🔄 Fetching submissions...')

      // Fetch submissions from the admin API using authenticated client
      const data = await api.get('/api/admin/submissions?limit=10')
      console.log('📊 Submissions data:', data)

      setSubmissions(data.submissions || [])
      setMessage(`Loaded ${data.submissions?.length || 0} submissions`)
      console.log('✅ Submissions loaded:', data.submissions?.length || 0)
    } catch (error) {
      console.error('💥 Error fetching submissions:', error)
      setMessage('Failed to fetch submissions')
    } finally {
      setSubmissionsLoading(false)
    }
  }

  const adminModules = [
    {
      title: 'Submission Management',
      description: 'Manage and moderate all platform submissions',
      icon: FileText,
      href: '/admin/submissions',
      color: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
      iconColor: 'text-blue-600',
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
      color: 'bg-green-50 border-green-200 hover:bg-green-100',
      iconColor: 'text-green-600',
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
      color: 'bg-red-50 border-red-200 hover:bg-red-100',
      iconColor: 'text-red-600',
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
      color: 'bg-purple-50 border-purple-200 hover:bg-purple-100',
      iconColor: 'text-purple-600',
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
          <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50">
            <div className="container mx-auto px-4 py-8">
              <div className="text-center">
                <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
                  <Settings className="h-4 w-4" />
                  <span>Loading Admin Panel</span>
                </div>
                <h1 className="text-3xl font-bold text-gray-900 mb-4">Admin Dashboard</h1>
                <p className="text-gray-600">Loading system statistics...</p>
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
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-blue-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center space-x-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Settings className="h-4 w-4" />
            <span>System Administration</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
                Admin{' '}
                <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Dashboard
                </span>
              </h1>
              <p className="text-lg text-gray-600">
                Manage submissions, review flags, and oversee system operations
              </p>
            </div>
            
            {stats && (
              <div className="flex items-center gap-2">
                {getHealthIcon(stats.systemHealth)}
                <span className={`font-medium ${getHealthColor(stats.systemHealth)}`}>
                  System {stats.systemHealth}
                </span>
              </div>
            )}
          </div>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg border flex items-center gap-3 ${
            message.includes('successfully') 
              ? 'bg-green-50 border-green-200 text-green-800' 
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {message.includes('successfully') ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            )}
            <p className="font-medium">{message}</p>
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
                  <div className="p-3 bg-secondary/20 rounded-lg">
                    <Clock className="h-6 w-6 text-secondary-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stats.pendingReviews}</p>
                    <p className="text-muted-foreground">Pending Reviews</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-destructive/20 rounded-lg">
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stats.flaggedContent}</p>
                    <p className="text-muted-foreground">Flagged Content</p>
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
          <TabsList className="grid w-full grid-cols-4 max-w-2xl mx-auto">
            <TabsTrigger value="actions" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Actions
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="submissions" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Submissions
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

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
                    <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                      <h3 className="font-semibold text-primary mb-2 flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Weekly Operations
                      </h3>
                      <p className="text-sm text-primary/80 mb-4">
                        Process weekly streaks, penalties, and leaderboard generation
                      </p>
                      <Button 
                        onClick={() => handleSystemAction('weekly')}
                        disabled={actionLoading === 'weekly'}
                        className="w-full"
                      >
                        {actionLoading === 'weekly' ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Calendar className="mr-2 h-4 w-4" />
                            Trigger Weekly Reset
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <h3 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        XP Aggregation
                      </h3>
                      <p className="text-sm text-green-700 mb-4">
                        Process pending XP calculations and finalize scores
                      </p>
                      <Button 
                        onClick={() => handleSystemAction('aggregate')}
                        disabled={actionLoading === 'aggregate'}
                        variant="outline"
                        className="w-full"
                      >
                        {actionLoading === 'aggregate' ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Processing...
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
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        Data Refresh
                      </h3>
                      <p className="text-sm text-gray-700 mb-4">
                        Refresh dashboard statistics and system metrics
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
                            Refreshing...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Refresh Data
                          </>
                        )}
                      </Button>
                    </div>

                    <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                      <h3 className="font-semibold text-purple-900 mb-2 flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        System Health
                      </h3>
                      <p className="text-sm text-purple-700 mb-4">
                        Monitor system performance and security status
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Status:</span>
                        <Badge variant={stats?.systemHealth === 'healthy' ? 'default' : 'destructive'}>
                          {stats?.systemHealth || 'Unknown'}
                        </Badge>
                      </div>
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
              <CardContent>
                <p className="text-gray-600">User management interface coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="submissions" className="space-y-6">
            <Card className="border-0 shadow-xl">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Submissions Management
                  </CardTitle>
                  <CardDescription>
                    Review and manage all submissions in the system
                  </CardDescription>
                </div>
                <Button
                  onClick={fetchSubmissions}
                  disabled={submissionsLoading}
                  variant="outline"
                  size="sm"
                >
                  {submissionsLoading ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Refresh
                    </>
                  )}
                </Button>
              </CardHeader>
              <CardContent>
                {submissionsLoading ? (
                  <div className="text-center py-8">
                    <RefreshCw className="h-8 w-8 text-gray-400 mx-auto mb-4 animate-spin" />
                    <p className="text-gray-600">Loading submissions...</p>
                  </div>
                ) : submissions.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 mb-2">No submissions found</p>
                    <p className="text-sm text-gray-500">
                      Submissions will appear here once users start submitting content.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {submissions.map((submission) => (
                      <div key={submission.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <Badge variant={submission.status === 'PENDING' ? 'secondary' : 'default'}>
                                {submission.status}
                              </Badge>
                              <Badge variant="outline">
                                {submission.platform}
                              </Badge>
                              <Badge variant="outline">
                                Task {submission.taskTypes}
                              </Badge>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-muted-foreground">URL:</span>
                                <a
                                  href={submission.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:text-primary/80 text-sm truncate max-w-md"
                                >
                                  {submission.url}
                                </a>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span>User: {submission.user.username}</span>
                                <span>Week: {submission.weekNumber}</span>
                                <span>Submitted: {new Date(submission.createdAt).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-gray-600 mb-1">XP Breakdown</div>
                            <div className="space-y-1 text-sm">
                              <div>AI: {submission.aiXp}</div>
                              <div>Peer: {submission.peerXp || 'N/A'}</div>
                              <div className="font-semibold">Final: {submission.finalXp || 'Pending'}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
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
                    <h3 className="font-semibold text-gray-900">Weekly Performance</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">XP Awarded This Week</span>
                        <span className="font-medium">{stats?.weeklyXpAwarded || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Active Participants</span>
                        <span className="font-medium">{stats?.activeUsers || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Pending Reviews</span>
                        <span className="font-medium">{stats?.pendingReviews || 0}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-gray-900">System Health</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Total Submissions</span>
                        <span className="font-medium">{stats?.totalSubmissions || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Flagged Content</span>
                        <span className="font-medium text-red-600">{stats?.flaggedContent || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">System Status</span>
                        <Badge variant={stats?.systemHealth === 'healthy' ? 'default' : 'destructive'}>
                          {stats?.systemHealth || 'Unknown'}
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

