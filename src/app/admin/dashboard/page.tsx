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
  ArrowRight
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
  const { user, loading } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)

  useEffect(() => {
    fetchAdminStats()
  }, [])

  const fetchAdminStats = async () => {
    try {
      setLoadingStats(true)
      
      // Fetch overview analytics
      const response = await fetch('/api/admin/analytics?timeframe=last_30_days')
      
      if (response.ok) {
        const data = await response.json()
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
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
              <CardContent className="p-4 text-center">
                <Users className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-blue-700">
                  {stats.totalUsers}
                </div>
                <div className="text-sm text-blue-600">Total Users</div>
                <div className="text-xs text-blue-500 mt-1">
                  {stats.activeUsers} active (7d)
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
              <CardContent className="p-4 text-center">
                <FileText className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-green-700">
                  {stats.totalSubmissions}
                </div>
                <div className="text-sm text-green-600">Submissions</div>
                <div className="text-xs text-green-500 mt-1">
                  {stats.systemHealth.submissionSuccessRate}% success rate
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
              <CardContent className="p-4 text-center">
                <MessageSquare className="h-8 w-8 text-purple-600 mx-auto mb-2" />
                <div className="text-2xl font-bold text-purple-700">
                  {stats.totalReviews}
                </div>
                <div className="text-sm text-purple-600">Reviews</div>
                <div className="text-xs text-purple-500 mt-1">
                  {stats.systemHealth.avgReviewScore.toFixed(1)} avg score
                </div>
              </CardContent>
            </Card>
            
            <Card className={`bg-gradient-to-br ${stats.pendingFlags > 0 ? 'from-red-50 to-red-100 border-red-200' : 'from-gray-50 to-gray-100 border-gray-200'}`}>
              <CardContent className="p-4 text-center">
                <Shield className={`h-8 w-8 ${stats.pendingFlags > 0 ? 'text-red-600' : 'text-gray-600'} mx-auto mb-2`} />
                <div className={`text-2xl font-bold ${stats.pendingFlags > 0 ? 'text-red-700' : 'text-gray-700'}`}>
                  {stats.pendingFlags}
                </div>
                <div className={`text-sm ${stats.pendingFlags > 0 ? 'text-red-600' : 'text-gray-600'}`}>
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
          <Card className="mb-8 border-red-200 bg-red-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-5 w-5" />
                Urgent Actions Required
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-red-700 font-medium">
                    {stats.pendingFlags} content flag{stats.pendingFlags !== 1 ? 's' : ''} pending review
                  </p>
                  <p className="text-red-600 text-sm">
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
                          <div className="h-6 bg-gray-200 rounded animate-pulse mb-1"></div>
                          <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
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
                    action.urgent ? 'border-red-200 bg-red-50' : 'hover:bg-muted/50'
                  }`}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <action.icon className={`h-6 w-6 ${
                          action.urgent ? 'text-red-600' : 'text-muted-foreground'
                        }`} />
                        <div className="flex-1">
                          <h4 className={`font-medium ${action.urgent ? 'text-red-700' : ''}`}>
                            {action.title}
                          </h4>
                          <p className={`text-sm ${
                            action.urgent ? 'text-red-600' : 'text-muted-foreground'
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
