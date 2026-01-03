"use client"

import React, { useState, useEffect, useCallback } from 'react'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { BarChart3, TrendingUp, Clock, AlertTriangle, CheckCircle } from 'lucide-react'

interface PerformanceData {
  metrics: Array<{ name: string; value: number }>
  aggregations: Record<string, any>
  timeframe: string
  count: number
}

interface WebVitalMetric {
  name: string
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  threshold: { good: number; poor: number }
  unit: string
}

export function PerformanceDashboard() {
  const { authenticatedFetch } = useAuthenticatedFetch()
  const [data, setData] = useState<PerformanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeframe, setTimeframe] = useState('24h')
  const [error, setError] = useState<string | null>(null)

  const fetchPerformanceData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await authenticatedFetch(`/api/analytics/performance?timeframe=${timeframe}`)
      if (!response.ok) {
        throw new Error('Failed to fetch performance data')
      }
      
      const result = await response.json()
      setData(result.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [timeframe, authenticatedFetch])

  useEffect(() => {
    fetchPerformanceData()
  }, [fetchPerformanceData])

  const getWebVitals = (): WebVitalMetric[] => {
    if (!data?.aggregations._webVitalsSummary) return []

    const vitals = [
      { name: 'LCP', label: 'Largest Contentful Paint', unit: 'ms', threshold: { good: 2500, poor: 4000 } },
      { name: 'FID', label: 'First Input Delay', unit: 'ms', threshold: { good: 100, poor: 300 } },
      { name: 'CLS', label: 'Cumulative Layout Shift', unit: '', threshold: { good: 0.1, poor: 0.25 } },
      { name: 'FCP', label: 'First Contentful Paint', unit: 'ms', threshold: { good: 1800, poor: 3000 } },
      { name: 'TTFB', label: 'Time to First Byte', unit: 'ms', threshold: { good: 800, poor: 1800 } },
    ]

    return vitals.map(vital => ({
      name: vital.label,
      value: data.aggregations._webVitalsSummary[vital.name]?.value || 0,
      rating: data.aggregations._webVitalsSummary[vital.name]?.rating || 'good',
      threshold: vital.threshold,
      unit: vital.unit
    }))
  }

  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'good': return 'text-green-600 bg-green-50 border-green-200'
      case 'needs-improvement': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'poor': return 'text-red-600 bg-red-50 border-red-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getRatingIcon = (rating: string) => {
    switch (rating) {
      case 'good': return <CheckCircle className="w-4 h-4" />
      case 'needs-improvement': return <Clock className="w-4 h-4" />
      case 'poor': return <AlertTriangle className="w-4 h-4" />
      default: return <BarChart3 className="w-4 h-4" />
    }
  }

  const formatValue = (value: number, unit: string) => {
    if (unit === 'ms') {
      return `${Math.round(value)}ms`
    }
    if (unit === '') {
      return value.toFixed(3)
    }
    return `${Math.round(value)}${unit}`
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Failed to load performance data: {error}
          <Button onClick={fetchPerformanceData} variant="outline" size="sm" className="ml-2">
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  const webVitals = getWebVitals()

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Performance Dashboard</h2>
          <p className="text-muted-foreground">
            Monitor Core Web Vitals and application performance metrics
          </p>
        </div>
        
        <div className="flex gap-2">
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          
          <Button onClick={fetchPerformanceData} variant="outline" size="sm">
            <TrendingUp className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs defaultValue="web-vitals" className="space-y-4">
        <TabsList>
          <TabsTrigger value="web-vitals">Core Web Vitals</TabsTrigger>
          <TabsTrigger value="custom-metrics">Custom Metrics</TabsTrigger>
          <TabsTrigger value="api-performance">API Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="web-vitals" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {webVitals.map((vital) => (
              <Card key={vital.name}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    {getRatingIcon(vital.rating)}
                    {vital.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold mb-2">
                    {formatValue(vital.value, vital.unit)}
                  </div>
                  <Badge className={`${getRatingColor(vital.rating)} capitalize`}>
                    {vital.rating.replace('-', ' ')}
                  </Badge>
                  <div className="text-xs text-muted-foreground mt-2">
                    Good: {formatValue(vital.threshold.good, vital.unit)} - Poor: &gt;{formatValue(vital.threshold.poor, vital.unit)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="custom-metrics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data && Object.entries(data.aggregations)
              .filter(([name]) => !name.startsWith('webvital_') && name !== '_webVitalsSummary')
              .map(([name, stats]) => (
                <Card key={name}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium capitalize">
                      {name.replace(/_/g, ' ')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Average:</span>
                        <span className="font-medium">{Math.round(stats.avg)}ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">P95:</span>
                        <span className="font-medium">{Math.round(stats.p95)}ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">Count:</span>
                        <span className="font-medium">{stats.count}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>

        <TabsContent value="api-performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>API Response Times</CardTitle>
              <CardDescription>
                Performance metrics for API endpoints over the selected timeframe
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data?.aggregations.api_response_time ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {Math.round(data.aggregations.api_response_time.avg)}ms
                      </div>
                      <div className="text-sm text-muted-foreground">Average</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {Math.round(data.aggregations.api_response_time.p50)}ms
                      </div>
                      <div className="text-sm text-muted-foreground">Median</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-600">
                        {Math.round(data.aggregations.api_response_time.p95)}ms
                      </div>
                      <div className="text-sm text-muted-foreground">P95</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">
                        {Math.round(data.aggregations.api_response_time.max)}ms
                      </div>
                      <div className="text-sm text-muted-foreground">Max</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No API performance data available for the selected timeframe
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="text-xs text-muted-foreground">
        Data collected from {data?.count || 0} performance measurements over the last {timeframe}
      </div>
    </div>
  )
}

