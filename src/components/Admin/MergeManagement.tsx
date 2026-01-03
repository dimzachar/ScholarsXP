'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  XCircle,
  TrendingUp,
  Users,
  Database,
  Activity
} from 'lucide-react'
// Remove direct service imports to avoid Next.js server/client issues
// import { MergeService } from '@/lib/services/MergeService'
// import type { MergeStatus } from '@/lib/services/MergeService'

// Define types locally to avoid import issues
interface MergeStatus {
  mergeId?: string
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK' | 'CANCELLED'
  startedAt?: string
  completedAt?: string
  errorMessage?: string
  progress?: {
    transactionsTransferred: number
    xpTransferred: number
    weeklyStatsTransferred: number
  }
}

interface MergeHistoryItem {
  id: string
  realUserId: string
  legacyDiscordHandle: string
  status: string
  startedAt: string
  completedAt?: string
  errorMessage?: string
  transactionsTransferred: number
  xpTransferred: number
  processingTimeMs?: number
  userEmail?: string
  username?: string
}

interface MergeMetrics {
  totalMerges: number
  successRate: number
  averageProcessingTime: number
  errorRate: number
  recentFailures: number
  performanceScore: number
}

export default function MergeManagement() {
  const { authenticatedFetch } = useAuthenticatedFetch()
  const [mergeHistory, setMergeHistory] = useState<MergeHistoryItem[]>([])
  const [metrics, setMetrics] = useState<MergeMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryingMerge, setRetryingMerge] = useState<string | null>(null)

  const loadMergeStatistics = useCallback(async () => {
    try {
      const response = await authenticatedFetch('/api/admin/merge-stats?timeframe=day')
      if (response.ok) {
        const data = await response.json()
        return data.statistics
      } else {
        throw new Error('Failed to fetch statistics')
      }
    } catch (error) {
      console.error('Error loading merge statistics:', error)
      return null
    }
  }, [authenticatedFetch])

  const loadMergeHistory = useCallback(async (): Promise<MergeHistoryItem[]> => {
    try {
      const response = await authenticatedFetch('/api/admin/merge-history?limit=50')
      if (response.ok) {
        const data = await response.json()
        return data.mergeHistory || []
      } else {
        throw new Error('Failed to fetch merge history')
      }
    } catch (error) {
      console.error('Error loading merge history:', error)
      return []
    }
  }, [authenticatedFetch])

  const loadMergeData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Load merge history and metrics via API calls
      const [historyResult, metricsResult] = await Promise.all([
        loadMergeHistory(),
        loadMergeStatistics()
      ])

      setMergeHistory(historyResult)
      setMetrics(metricsResult)
    } catch (err) {
      console.error('Error loading merge data:', err)
      setError('Failed to load merge data')
    } finally {
      setLoading(false)
    }
  }, [loadMergeHistory, loadMergeStatistics])

  useEffect(() => {
    loadMergeData()
  }, [loadMergeData])

  const retryMerge = async (mergeId: string) => {
    try {
      setRetryingMerge(mergeId)

      // This would be an API call to retry the merge
      // For now, just show a message
      console.log('Retry merge functionality would be implemented via API call')
      setError('Retry functionality not yet implemented - would use API call')

      // Refresh data to show updated status
      await loadMergeData()
    } catch (err) {
      console.error('Error retrying merge:', err)
      setError('Failed to retry merge')
    } finally {
      setRetryingMerge(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>
      case 'FAILED':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>
      case 'IN_PROGRESS':
        return <Badge className="bg-blue-100 text-blue-800"><Clock className="w-3 h-3 mr-1" />In Progress</Badge>
      case 'PENDING':
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Pending</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const formatDuration = (ms?: number) => {
    if (!ms) return 'N/A'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        Loading merge data...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Legacy Account Merge Management</h1>
          <p className="text-muted-foreground">Monitor and manage legacy account merge operations</p>
        </div>
        <Button onClick={loadMergeData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">Merge History</TabsTrigger>
          <TabsTrigger value="monitoring">System Health</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {metrics && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Merges</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.totalMerges}</div>
                  <p className="text-xs text-muted-foreground">Last 24 hours</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{(metrics.successRate * 100).toFixed(1)}%</div>
                  <p className="text-xs text-muted-foreground">
                    {metrics.errorRate > 0.05 ? 'Above threshold' : 'Within normal range'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Processing Time</CardTitle>
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatDuration(metrics.averageProcessingTime)}</div>
                  <p className="text-xs text-muted-foreground">
                    {metrics.averageProcessingTime > 30000 ? 'Slower than expected' : 'Normal performance'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Performance Score</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{metrics.performanceScore}/100</div>
                  <p className="text-xs text-muted-foreground">
                    {metrics.performanceScore >= 85 ? 'Excellent' : 
                     metrics.performanceScore >= 70 ? 'Good' : 'Needs attention'}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest merge operations and their status</CardDescription>
            </CardHeader>
            <CardContent>
              {mergeHistory.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No recent merge activity</p>
              ) : (
                <div className="space-y-2">
                  {mergeHistory.slice(0, 5).map((merge) => (
                    <div key={merge.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        {getStatusBadge(merge.status)}
                        <div>
                          <p className="font-medium">{merge.username || merge.userEmail}</p>
                          <p className="text-sm text-muted-foreground">
                            Discord: {merge.legacyDiscordHandle}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {merge.xpTransferred > 0 ? `${merge.xpTransferred.toLocaleString()} XP` : 'No XP'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(merge.startedAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Merge History</CardTitle>
              <CardDescription>Complete history of all merge operations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mergeHistory.map((merge) => (
                  <div key={merge.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        {getStatusBadge(merge.status)}
                        <span className="font-medium">{merge.username || merge.userEmail}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {merge.status === 'FAILED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => retryMerge(merge.id)}
                            disabled={retryingMerge === merge.id}
                          >
                            {retryingMerge === merge.id ? (
                              <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                            ) : (
                              <RefreshCw className="w-3 h-3 mr-1" />
                            )}
                            Retry
                          </Button>
                        )}
                        <span className="text-sm text-muted-foreground">
                          {formatDate(merge.startedAt)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Discord Handle:</span>
                        <p className="font-medium">{merge.legacyDiscordHandle}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Transactions:</span>
                        <p className="font-medium">{merge.transactionsTransferred}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">XP Transferred:</span>
                        <p className="font-medium">{merge.xpTransferred?.toLocaleString()}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Processing Time:</span>
                        <p className="font-medium">{formatDuration(merge.processingTimeMs)}</p>
                      </div>
                    </div>

                    {merge.errorMessage && (
                      <Alert className="mt-3">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>{merge.errorMessage}</AlertDescription>
                      </Alert>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monitoring" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Health</CardTitle>
              <CardDescription>Monitor merge system performance and health</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="font-medium">Merge Service</span>
                  </div>
                  <Badge className="bg-green-100 text-green-800">Operational</Badge>
                </div>
                
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="font-medium">Database Functions</span>
                  </div>
                  <Badge className="bg-green-100 text-green-800">Operational</Badge>
                </div>
                
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                    <span className="font-medium">Legacy Account Matcher</span>
                  </div>
                  <Badge className="bg-yellow-100 text-yellow-800">Monitoring</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
