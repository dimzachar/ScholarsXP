'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api-client'
import {
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Activity,
  Calendar,
  Zap,
  Database
} from 'lucide-react'

interface AutomationStatus {
  configured?: boolean
  setupRequired?: boolean
  setupInstructions?: string
  message?: string
  jobTypes: Record<string, {
    totalRuns: number
    successfulRuns: number
    failedRuns: number
    runningJobs: number
    lastRun: string | null
    lastSuccess: string | null
    lastFailure: string | null
    health: 'healthy' | 'warning' | 'critical' | 'unknown' | 'running'
    successRate: number
    avgDuration?: number
    lastError?: string
  }>
  recentRuns: Array<{
    id: string
    jobName: string
    jobType: string
    triggeredBy: string
    startedAt: string
    completedAt: string | null
    status: string
    duration: string | null
    errorMessage: string | null
  }>
  runningJobs: Array<{
    id: string
    jobName: string
    jobType: string
    startedAt: string
    triggeredBy: string
  }>
  queueStatus: {
    submissionsAwaitingAggregation: number
    submissionsWithEnoughReviews: number
  }
  summary: {
    totalAutomationRuns: number
    healthyJobs: number
    warningJobs: number
    criticalJobs: number
    runningJobs: number
  }
  lastUpdated: string
}

const getHealthIcon = (health: string) => {
  switch (health) {
    case 'healthy': return <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
    case 'warning': return <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
    case 'critical': return <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
    case 'running': return <RefreshCw className="h-4 w-4 text-blue-600 dark:text-blue-400 animate-spin" />
    default: return <Clock className="h-4 w-4 text-muted-foreground" />
  }
}

const getHealthBadgeVariant = (health: string) => {
  switch (health) {
    case 'healthy': return 'default'
    case 'warning': return 'secondary'
    case 'critical': return 'destructive'
    case 'running': return 'outline'
    default: return 'outline'
  }
}

const getJobTypeIcon = (jobType: string) => {
  switch (jobType) {
    case 'weekly_operations': return <Calendar className="h-4 w-4" />
    case 'xp_aggregation': return <Zap className="h-4 w-4" />
    case 'data_refresh': return <Database className="h-4 w-4" />
    default: return <Activity className="h-4 w-4" />
  }
}

const getJobTypeDisplayName = (jobType: string) => {
  switch (jobType) {
    case 'weekly_operations': return 'Weekly Operations'
    case 'xp_aggregation': return 'XP Aggregation'
    case 'data_refresh': return 'Data Refresh'
    default: return jobType
  }
}

const formatRelativeTime = (dateString: string | null) => {
  if (!dateString) return 'Never'
  
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

export default function AutomationStatus() {
  const [status, setStatus] = useState<AutomationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchStatus = async () => {
    try {
      setError(null)
      const response = await api.get('/api/admin/automation/status')
      setStatus(response.data || response)
    } catch (err: any) {
      console.error('Failed to fetch automation status:', err)

      // Handle different error formats
      let errorMessage = 'Failed to fetch automation status'

      if (err?.response?.data?.error?.error) {
        errorMessage = err.response.data.error.error
      } else if (err?.response?.data?.error?.message) {
        errorMessage = err.response.data.error.message
      } else if (err?.message) {
        errorMessage = err.message
      }

      // Check if this is a database/migration issue
      if (errorMessage.includes('AutomationLog') || errorMessage.includes('relation') || errorMessage.includes('does not exist')) {
        errorMessage = 'Automation monitoring not yet configured. Please run the database migration to enable automation tracking.'
      }

      setError(errorMessage)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchStatus()
  }

  useEffect(() => {
    fetchStatus()
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Automation Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading automation status...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Automation Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400 mx-auto mb-2" />
            <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
            <Button onClick={handleRefresh} variant="outline" className="mt-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!status) return null

  // Show setup required message if automation is not configured
  if (status.setupRequired || status.configured === false) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Automation Status
          </CardTitle>
          <CardDescription>
            Automated system operations monitoring
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Automation Not Configured</h3>
            <p className="text-muted-foreground mb-4 max-w-md mx-auto">
              The automation monitoring system is not yet set up. Run the database migration to enable automated operations tracking.
            </p>

            {status.setupInstructions && (
              <div className="bg-muted/50 rounded-lg p-4 mb-4 text-left max-w-2xl mx-auto">
                <h4 className="font-medium mb-2">Setup Instructions:</h4>
                <code className="text-sm bg-background px-2 py-1 rounded">
                  {status.setupInstructions}
                </code>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 max-w-2xl mx-auto">
              <div className="p-4 bg-muted/30 rounded-lg">
                <Calendar className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <h4 className="font-medium text-sm">Weekly Operations</h4>
                <p className="text-xs text-muted-foreground">Not automated</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <Zap className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <h4 className="font-medium text-sm">XP Aggregation</h4>
                <p className="text-xs text-muted-foreground">Not automated</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <Database className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                <h4 className="font-medium text-sm">Data Refresh</h4>
                <p className="text-xs text-muted-foreground">Not automated</p>
              </div>
            </div>

            <Button onClick={handleRefresh} variant="outline" className="mt-6">
              <RefreshCw className="h-4 w-4 mr-2" />
              Check Again
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{status.summary.healthyJobs}</p>
                <p className="text-sm text-muted-foreground">Healthy Jobs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <div>
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{status.summary.warningJobs}</p>
                <p className="text-sm text-muted-foreground">Warning Jobs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              <div>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">{status.summary.criticalJobs}</p>
                <p className="text-sm text-muted-foreground">Critical Jobs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <RefreshCw className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{status.summary.runningJobs}</p>
                <p className="text-sm text-muted-foreground">Running Jobs</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Job Status Details */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Automation Jobs
            </CardTitle>
            <CardDescription>
              Status and performance of automated system operations
            </CardDescription>
          </div>
          <Button 
            onClick={handleRefresh} 
            variant="outline" 
            size="sm"
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(status.jobTypes).map(([jobType, jobStatus]) => (
              <div key={jobType} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-3">
                  {getJobTypeIcon(jobType)}
                  <div>
                    <h3 className="font-medium">{getJobTypeDisplayName(jobType)}</h3>
                    <p className="text-sm text-muted-foreground">
                      Last run: {formatRelativeTime(jobStatus.lastRun)}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <p className="text-sm font-medium">{jobStatus.successRate}% success</p>
                    <p className="text-xs text-muted-foreground">
                      {jobStatus.successfulRuns}/{jobStatus.totalRuns} runs
                    </p>
                  </div>
                  
                  <Badge variant={getHealthBadgeVariant(jobStatus.health)}>
                    <div className="flex items-center gap-1">
                      {getHealthIcon(jobStatus.health)}
                      {jobStatus.health}
                    </div>
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Queue Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Queue Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <h3 className="font-medium mb-2">Submissions Awaiting Aggregation</h3>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {status.queueStatus.submissionsAwaitingAggregation}
              </p>
              <p className="text-sm text-muted-foreground">
                Submissions in peer review process
              </p>
            </div>
            
            <div className="p-4 bg-muted/50 rounded-lg">
              <h3 className="font-medium mb-2">Ready for Processing</h3>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {status.queueStatus.submissionsWithEnoughReviews}
              </p>
              <p className="text-sm text-muted-foreground">
                Submissions with sufficient reviews
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground text-center">
        Last updated: {formatRelativeTime(status.lastUpdated)}
      </div>
    </div>
  )
}
